/* OfferBuddy — Service Worker
   职责：读取本地配置与简历 → 构造 prompt → 调用 DeepSeek API。
   两类请求：GENERATE_FILL（生成字段填写值）、PLAN_ENTRIES（规划「添加条目」点击次数）。
   API Key 只存放在 chrome.storage.local，由用户在设置页自行填写。 */

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';
const REQUEST_TIMEOUT_MS = 60000;

const SYSTEM_PROMPT = `你是招聘网页表单自动填写助手。用户会给你：
1) 简历（Markdown 格式）
2) 可选的附加填写指令
3) 网页表单字段列表（JSON 数组，每项含 index/tag/type/name/id/label/group/placeholder/required；select 含 options；radio/checkbox 含 checked）。
   其中 group 是字段所在板块/分组的标题（如“项目经验”“教育经历”）。复合字段（如“起止时间”的年/月多个下拉）共享同一个 group 或 label，请按语义分别填：年填 4 位年份、月填 1-12 的月份。

请判断每个字段应填的内容，返回一个纯 JSON 对象：{ "字段index（字符串）": "要填写的值（字符串）" }。

规则：
1. 只输出 JSON，不要任何解释或 markdown 代码块。
2. 只为有把握的字段返回值；简历中没有依据的信息不要返回该字段，留给用户手填。严禁编造公司、学校、经历、证件号等事实。
3. select 下拉框：从 options 中挑最合适的一项，【原样返回该项文本】（含数字、空格、单位），不要只回数字或自造文本。
4. radio：只对你认为应被选中的那一项返回 "true"，其余不返回。checkbox：需要勾选返回 "true"，需要取消返回 "false"，不确定则不返回。
5. type=date 返回 "YYYY-MM-DD"；type=month 返回 "YYYY-MM"；type=number 只返回数字（如年龄、工作年限）。
6. 长文本经历类字段（项目描述、工作内容、工作总结、教育经历描述、实习/实践经历、自我评价等）：【逐字复制简历中对应段落的原文】，一个标点都不得改动，禁止概括、润色、扩写、改写，保留原文的换行与列表符号。同一 group 下有多组重复字段时，按简历中经历的先后顺序一一对应填写。仅当字段有明确字数上限时，截取原文开头至限额。
7. 其他开放文本（如一句话求职意向）：基于简历事实撰写，语言与简历一致。
8. 附加指令优先级最高（例如“期望薪资填面议”）。`;

const PLAN_PROMPT = `你是表单结构分析助手。招聘网页通常允许重复添加同类条目（如多段教育经历、工作经历、项目经历）。
用户会给你：
1) 简历（Markdown 格式）
2) 页面上检测到的「添加条目」按钮列表（每项含 section 编号、按钮文本 buttonText、所在板块标题 sectionTitle、该区域当前已有的字段标签 currentFields）

请根据简历判断：每个按钮【还需要点击几次】，页面上的条目数才能覆盖简历中的同类经历。
- 返回纯 JSON：{ "addClicks": { "s0": 1 } }，只输出需要点击的按钮，其余不输出。
- 按 sectionTitle 与 currentFields 判断该按钮对应简历中的哪类经历（教育/工作/项目/实习等）。
- currentFields 若已按组重复出现（同一套字段出现多遍），说明页面已有多组，按实际组数计算还差几组。
- 例如简历有两段项目经历，而页面当前只有一组项目字段，则该按钮点击 1 次。
- 每个按钮最多 4 次；没有把握就给 0 或不输出。只输出 JSON。`;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = msg?.type === 'GENERATE_FILL' ? generateFill
    : msg?.type === 'PLAN_ENTRIES' ? planEntries
    : null;
  if (!handler) return undefined;
  handler(msg)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: 'REQUEST_FAILED', detail: String(err?.message || err) }));
  return true; // 异步响应
});

async function loadConfig() {
  const raw = await chrome.storage.local.get(['apiKey', 'baseUrl', 'model', 'resumeMd', 'extraInstructions']);
  if (!raw.apiKey) return { error: { ok: false, error: 'NO_API_KEY' } };
  if (!raw.resumeMd || !raw.resumeMd.trim()) return { error: { ok: false, error: 'NO_RESUME' } };
  return {
    cfg: {
      ...raw,
      baseUrl: (raw.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''),
      model: raw.model || DEFAULT_MODEL,
    },
  };
}

/* 调 chat/completions 并解析 JSON 对象返回，统一错误格式 */
async function callChat(cfg, systemPrompt, userMessage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, error: 'TIMEOUT', detail: '请求超时（60s）' };
    return { ok: false, error: 'NETWORK', detail: String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 300);
    return { ok: false, error: 'API_ERROR', detail: `HTTP ${res.status}: ${text}` };
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const obj = parseJsonObject(content);
  if (!obj) return { ok: false, error: 'BAD_JSON', detail: content.slice(0, 300) };
  return { ok: true, data: obj };
}

async function generateFill(msg) {
  const { cfg, error } = await loadConfig();
  if (error) return error;

  const userMessage = [
    `【目标网页】${msg.title || ''}（${msg.url || ''}）`,
    '',
    '【我的简历 Markdown】',
    cfg.resumeMd,
    '',
    cfg.extraInstructions && cfg.extraInstructions.trim()
      ? `【附加填写指令】\n${cfg.extraInstructions.trim()}\n`
      : '',
    '【网页表单字段 JSON】',
    JSON.stringify(msg.fields, null, 2),
    '',
    '请返回 JSON：{ "字段序号": "要填写的值" }',
  ].filter(line => line !== '').join('\n');

  const r = await callChat(cfg, SYSTEM_PROMPT, userMessage);
  if (!r.ok) return r;
  return { ok: true, values: r.data };
}

async function planEntries(msg) {
  const { cfg, error } = await loadConfig();
  if (error) return error;

  const userMessage = [
    '【我的简历 Markdown】',
    cfg.resumeMd,
    '',
    '【页面上的「添加条目」按钮 JSON】',
    JSON.stringify(msg.sections, null, 2),
    '',
    '请返回 JSON：{ "addClicks": { "s0": 点击次数 } }',
  ].join('\n');

  const r = await callChat(cfg, PLAN_PROMPT, userMessage);
  if (!r.ok) return r;
  return { ok: true, addClicks: r.data.addClicks || {} };
}

function parseJsonObject(text) {
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch { /* 继续尝试从文本中提取 */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const v = JSON.parse(m[0]);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch { /* 放弃 */ }
  }
  return null;
}
