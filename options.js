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

const $ = id => document.getElementById(id);

let apiKeys = {};          // { deepseek: 'sk-...', openai: '...' } 内存缓存，保存时统一写回
let currentProvider = 'deepseek';

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

  const sel = $('provider');
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  }
  sel.value = provider;
  currentProvider = provider;

  applyProvider(provider, {
    keepBaseUrl: cfg.baseUrl || undefined,
    keepModel: cfg.model || undefined,
  });
  $('resume-md').value = cfg.resumeMd || '';
  $('extra-instructions').value = cfg.extraInstructions || '';
}

/* 已下架/更名的旧模型 ID → 新 ID */
const LEGACY_MODEL_MAP = {
  'deepseek-chat': 'deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek-v4-pro',
};

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

$('provider').addEventListener('change', () => {
  apiKeys[currentProvider] = $('api-key').value.trim(); // 暂存当前厂商的 Key
  currentProvider = $('provider').value;
  applyProvider(currentProvider);
});

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
  }
});

load();
