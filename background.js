/* AI 简历自动填写 — Service Worker
   职责：读取本地配置与简历 → 构造 prompt → 调用 DeepSeek API → 返回 {字段序号: 值}。
   API Key 只存放在 chrome.storage.local，由用户在设置页自行填写。 */

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';
const REQUEST_TIMEOUT_MS = 60000;

const SYSTEM_PROMPT = `你是招聘网页表单自动填写助手。用户会给你：
1) 简历（Markdown 格式）
2) 可选的附加填写指令
3) 网页表单字段列表（JSON 数组，每项含 index/tag/type/name/id/label/placeholder/required；select 含 options；radio/checkbox 含 checked）

请判断每个字段应填的内容，返回一个纯 JSON 对象：{ "字段index（字符串）": "要填写的值（字符串）" }。

规则：
1. 只输出 JSON，不要任何解释或 markdown 代码块。
2. 只为有把握的字段返回值；简历中没有依据的信息不要返回该字段，留给用户手填。严禁编造公司、学校、经历、证件号等事实。
3. select 下拉框：从 options 中挑最合适的一项，返回其文本原文。
4. radio：只对你认为应被选中的那一项返回 "true"，其余不返回。checkbox：需要勾选返回 "true"，需要取消返回 "false"，不确定则不返回。
5. type=date 返回 "YYYY-MM-DD"；type=month 返回 "YYYY-MM"；type=number 只返回数字。
6. 开放文本（自我介绍、优势、求职意向等）：基于简历写 100-200 字、第一人称、平实专业的内容，语言与简历一致。
7. 附加指令优先级最高（例如“期望薪资填面议”）。`;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'GENERATE_FILL') return undefined;
  generateFill(msg)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: 'REQUEST_FAILED', detail: String(err?.message || err) }));
  return true; // 异步响应
});

async function generateFill(msg) {
  const cfg = await chrome.storage.local.get(['apiKey', 'baseUrl', 'model', 'resumeMd', 'extraInstructions']);
  if (!cfg.apiKey) return { ok: false, error: 'NO_API_KEY' };
  if (!cfg.resumeMd || !cfg.resumeMd.trim()) return { ok: false, error: 'NO_RESUME' };

  const baseUrl = (cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = cfg.model || DEFAULT_MODEL;

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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
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
  const values = parseJsonObject(content);
  if (!values) return { ok: false, error: 'BAD_JSON', detail: content.slice(0, 300) };
  return { ok: true, values };
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
