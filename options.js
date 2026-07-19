/* AI 简历自动填写 — 设置页：管理 API Key / Base URL / 模型 / 简历 / 附加指令 */

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

const $ = id => document.getElementById(id);

async function load() {
  const cfg = await chrome.storage.local.get(['apiKey', 'baseUrl', 'model', 'resumeMd', 'extraInstructions']);
  $('api-key').value = cfg.apiKey || '';
  $('base-url').value = cfg.baseUrl || DEFAULT_BASE_URL;
  $('model').value = cfg.model || DEFAULT_MODEL;
  $('resume-md').value = cfg.resumeMd || '';
  $('extra-instructions').value = cfg.extraInstructions || '';
}

/* 非默认接口地址（自建代理等）需要运行时主机权限才能 fetch */
async function ensureHostPermission(baseUrl) {
  try {
    const origin = new URL(baseUrl).origin + '/*';
    if (origin === new URL(DEFAULT_BASE_URL).origin + '/*') return true;
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (has) return true;
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

$('save').addEventListener('click', async () => {
  const baseUrl = $('base-url').value.trim() || DEFAULT_BASE_URL;
  const granted = await ensureHostPermission(baseUrl);
  if (!granted) {
    $('save-status').className = 'status error';
    $('save-status').textContent = '未授予该接口地址的访问权限，已取消保存';
    return;
  }
  await chrome.storage.local.set({
    apiKey: $('api-key').value.trim(),
    baseUrl,
    model: $('model').value.trim() || DEFAULT_MODEL,
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
  const baseUrl = ($('base-url').value.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const status = $('test-status');
  if (!key) {
    status.className = 'status error';
    status.textContent = '请先填写 API Key';
    return;
  }
  status.className = 'status';
  status.textContent = '测试中…';
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const n = Array.isArray(data?.data) ? data.data.length : 0;
      status.className = 'status success';
      status.textContent = `连接成功 ✓（可用模型 ${n} 个）`;
    } else {
      status.className = 'status error';
      status.textContent = `连接失败：HTTP ${res.status}（请检查 Key 与 Base URL）`;
    }
  } catch (e) {
    status.className = 'status error';
    status.textContent = `请求失败：${e?.message || e}（如使用自定义地址，请先点保存授权）`;
  }
});

load();
