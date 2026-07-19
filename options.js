/* OfferBuddy — 设置页：厂商 / Key / 模型 / 简历 / 填写偏好
   Key 安全：按厂商分开存储在 chrome.storage.local（仅本机），
   页面加载不回显明文，仅在用户主动点「显示」时可见。 */

/* 模型列表核实于 2026-07，以各厂商官方文档 / 接口为准 */
const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6', 'gpt-5.5', 'gpt-5.4-mini'],
  },
  moonshot: {
    name: 'Moonshot（Kimi）',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k3', 'kimi-k2.6', 'kimi-k2.7-code'],
  },
  zhipu: {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.7-flash', 'glm-4.7', 'glm-5.1', 'glm-5.2'],
  },
  qwen: {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen3.6-flash', 'qwen3.7-plus', 'qwen3.7-max'],
  },
  custom: {
    name: '自定义（OpenAI 兼容接口）',
    baseUrl: '',
    models: [],
  },
};

/* 已下架/更名的旧模型 ID → 新 ID */
const LEGACY_MODEL_MAP = {
  'deepseek-chat': 'deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek-v4-pro',
};

const $ = id => document.getElementById(id);

let apiKeys = {};          // { deepseek: 'sk-...', openai: '...' } 内存缓存，保存时统一写回
let currentProvider = 'deepseek';

/* ---------- 初始化 ---------- */

async function load() {
  const cfg = await chrome.storage.local.get(['provider', 'apiKeys', 'apiKey', 'baseUrl', 'model', 'resumeMd', 'extraInstructions']);
  apiKeys = cfg.apiKeys || {};

  // 旧版本迁移：单个 apiKey → 按厂商存储
  let provider = cfg.provider;
  if (!provider) provider = (cfg.baseUrl && !cfg.baseUrl.includes('deepseek.com')) ? 'custom' : 'deepseek';
  if (cfg.apiKey && !apiKeys[provider]) {
    apiKeys[provider] = cfg.apiKey;
    await chrome.storage.local.set({ provider, apiKeys });
    await chrome.storage.local.remove('apiKey');
  }

  currentProvider = provider;
  renderProviders(provider);
  applyProvider(provider, {
    keepBaseUrl: cfg.baseUrl || undefined,
    keepModel: cfg.model || undefined,
  });
  $('resume-md').value = cfg.resumeMd || '';
  $('extra-instructions').value = cfg.extraInstructions || '';
  updateResumeCount();
  $('ver').textContent = chrome.runtime.getManifest().version;
}

/* ---------- 厂商卡片 ---------- */

function renderProviders(activeId) {
  const grid = $('provider-grid');
  grid.replaceChildren(...Object.entries(PROVIDERS).map(([id, p]) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'provider-card' + (id === activeId ? ' selected' : '');
    card.dataset.provider = id;

    const name = document.createElement('span');
    name.className = 'provider-name';
    name.textContent = p.name;
    const meta = document.createElement('span');
    meta.className = 'provider-meta';
    meta.textContent = p.models.length ? `${p.models.length} 款模型` : 'OpenAI 兼容';
    card.append(name, meta);

    card.addEventListener('click', () => {
      if (currentProvider === id) return;
      apiKeys[currentProvider] = $('api-key').value.trim(); // 暂存当前厂商的 Key
      currentProvider = id;
      applyProvider(id);
      grid.querySelectorAll('.provider-card').forEach(c => c.classList.toggle('selected', c === card));
    });
    return card;
  }));
}

/* ---------- 厂商联动 ---------- */

/* 切换厂商：自动填 Base URL、刷新模型下拉、载入该厂商已存的 Key */
function applyProvider(id, { keepBaseUrl, keepModel } = {}) {
  const p = PROVIDERS[id] || PROVIDERS.deepseek;
  $('base-url').value = keepBaseUrl !== undefined ? keepBaseUrl : p.baseUrl;
  $('base-url').placeholder = p.baseUrl || 'https://your-api-host/v1';

  const sel = $('model');
  const customInput = $('model-custom');
  const models = [...p.models];
  const wanted = keepModel && (LEGACY_MODEL_MAP[keepModel] || keepModel);
  if (wanted && !models.includes(wanted)) models.push(wanted); // 保留用户此前保存的非候选模型

  sel.replaceChildren(...models.map(m => {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = m;
    return o;
  }));

  if (models.length) {
    sel.style.display = '';
    customInput.style.display = 'none';
    sel.value = wanted || models[0];
  } else {
    // 自定义厂商：无候选，改为输入框
    sel.style.display = 'none';
    customInput.style.display = '';
    customInput.value = wanted || '';
    customInput.placeholder = '输入模型名';
  }

  $('api-key').value = apiKeys[id] || '';
}

function currentModel() {
  const el = $('model').style.display === 'none' ? $('model-custom') : $('model');
  return el.value.trim();
}

/* ---------- 保存 ---------- */

/* 非官方地址需要运行时主机权限才能 fetch */
async function ensureHostPermission(baseUrl) {
  try {
    const origin = new URL(baseUrl).origin + '/*';
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (has) return true;
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

$('save').addEventListener('click', async () => {
  const baseUrl = $('base-url').value.trim() || PROVIDERS[currentProvider].baseUrl;
  if (!baseUrl) {
    $('save-status').className = 'status error';
    $('save-status').textContent = '请填写 Base URL';
    return;
  }
  const granted = await ensureHostPermission(baseUrl);
  if (!granted) {
    $('save-status').className = 'status error';
    $('save-status').textContent = '未授予该接口地址的访问权限，已取消保存';
    return;
  }
  apiKeys[currentProvider] = $('api-key').value.trim();
  await chrome.storage.local.set({
    provider: currentProvider,
    apiKeys,
    baseUrl,
    model: currentModel() || PROVIDERS[currentProvider].models[0] || '',
    resumeMd: $('resume-md').value,
    extraInstructions: $('extra-instructions').value,
  });
  $('save-status').className = 'status success';
  $('save-status').textContent = '已保存 ✓';
  setTimeout(() => { $('save-status').textContent = ''; }, 2000);
});

/* ---------- Key 显示 / 测试连接 ---------- */

$('toggle-key').addEventListener('click', () => {
  const input = $('api-key');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('toggle-key').textContent = show ? '隐藏' : '显示';
});

$('test').addEventListener('click', async () => {
  const key = $('api-key').value.trim();
  const baseUrl = ($('base-url').value.trim() || PROVIDERS[currentProvider].baseUrl).replace(/\/+$/, '');
  const model = currentModel();
  const status = $('test-status');
  if (!key) {
    status.className = 'status error';
    status.textContent = '请先填写 API Key';
    return;
  }
  status.className = 'status';
  status.textContent = '测试中…';
  $('test').classList.add('loading');
  try {
    let res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) {
      status.className = 'status success';
      status.textContent = '连接成功 ✓';
      return;
    }
    if (res.status === 401 || res.status === 403) {
      status.className = 'status error';
      status.textContent = `Key 无效或无权限（HTTP ${res.status}）`;
      return;
    }
    // 部分厂商没有 /models 接口，降级为最小对话请求
    if (!model) {
      status.className = 'status error';
      status.textContent = '请填写模型名后再测试';
      return;
    }
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    });
    if (res.ok) {
      status.className = 'status success';
      status.textContent = '连接成功 ✓';
    } else {
      status.className = 'status error';
      status.textContent = `连接失败：HTTP ${res.status}（请检查 Key / Base URL / 模型名）`;
    }
  } catch (e) {
    status.className = 'status error';
    status.textContent = `请求失败：${e?.message || e}（自定义地址请先点保存授权）`;
  } finally {
    $('test').classList.remove('loading');
  }
});

/* ---------- 侧栏导航：平滑滚动 + 滚动高亮 ---------- */

const navLinks = [...document.querySelectorAll('.rail-nav a')];
navLinks.forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
const spy = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (en.isIntersecting) {
      navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${en.target.id}`));
    }
  });
}, { rootMargin: '-25% 0px -65% 0px' });
document.querySelectorAll('.panel').forEach(p => spy.observe(p));

/* ---------- 简历字数 ---------- */

function updateResumeCount() {
  const n = $('resume-md').value.length;
  $('resume-count').textContent = n ? `${n} 字` : '';
}
$('resume-md').addEventListener('input', updateResumeCount);

/* ---------- 上传简历文件并解析 ---------- */

let pendingResumeMd = null;

$('upload-resume').addEventListener('click', () => $('resume-file').click());

$('resume-file').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = ''; // 允许重复选择同一文件
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    setUploadStatus('error', '文件超过 10MB，请换小一点的文件');
    return;
  }
  hideImportBar();
  setUploadStatus('working', '提取文本中…');
  try {
    const rawText = await extractText(file);
    if (!rawText.trim()) throw new Error('未能从文件中提取到文本');
    setUploadStatus('working', 'AI 整理中…');
    const resp = await chrome.runtime.sendMessage({
      type: 'PARSE_RESUME',
      fileName: file.name,
      rawText: rawText.slice(0, 30000),
    });
    if (!resp?.ok) throw new Error(parseErrorText(resp));
    pendingResumeMd = resp.markdown;

    if (!$('resume-md').value.trim()) {
      // 简历区为空：直接导入
      applyImport('overwrite');
    } else {
      // 非空：由用户选择覆盖 / 追加 / 取消
      $('import-text').textContent = `解析完成（${pendingResumeMd.length} 字），当前已有简历：`;
      $('import-bar').hidden = false;
      setUploadStatus('', '');
    }
  } catch (err) {
    setUploadStatus('error', err?.message || String(err));
  }
});

function applyImport(mode) {
  if (pendingResumeMd == null) return;
  const ta = $('resume-md');
  if (mode === 'append' && ta.value.trim()) {
    ta.value = `${ta.value.trimEnd()}\n\n---\n\n${pendingResumeMd}`;
  } else {
    ta.value = pendingResumeMd;
  }
  pendingResumeMd = null;
  hideImportBar();
  updateResumeCount();
  setUploadStatus('success', '已导入，确认无误后点保存');
}

$('import-overwrite').addEventListener('click', () => applyImport('overwrite'));
$('import-append').addEventListener('click', () => applyImport('append'));
$('import-cancel').addEventListener('click', () => {
  pendingResumeMd = null;
  hideImportBar();
  setUploadStatus('', '');
});

function hideImportBar() {
  $('import-bar').hidden = true;
}

function setUploadStatus(kind, text) {
  const el = $('upload-status');
  el.className = `status ${kind || ''}`.trim();
  el.textContent = text;
}

function parseErrorText(resp) {
  if (!resp) return '解析请求无响应';
  switch (resp.error) {
    case 'NO_API_KEY': return '请先配置 API Key';
    case 'EMPTY_FILE': return resp.detail || '未能从文件中提取到文本';
    case 'API_ERROR':
    case 'NETWORK':
    case 'TIMEOUT':
      return `调用大模型失败：${resp.detail || resp.error}`;
    default: return resp.detail || resp.error || '解析失败';
  }
}

/* 按格式提取纯文本：pdf.js / mammoth 在本地解析，文件不离开本机 */
async function extractText(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'md' || ext === 'txt') return file.text();
  if (ext === 'pdf') {
    const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const parts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      parts.push(tc.items.map(it => it.str).join(' '));
    }
    return parts.join('\n');
  }
  if (ext === 'docx') {
    const res = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return res.value || '';
  }
  throw new Error('仅支持 PDF / DOCX / MD / TXT 文件');
}

load();
