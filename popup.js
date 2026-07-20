/* AI 简历自动填写 — Popup：触发填写流程并展示结果 */

const fillBtn = document.getElementById('fill');
const statusEl = document.getElementById('status');

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

function setStatus(kind, text) {
  statusEl.className = `status ${kind || ''}`.trim();
  statusEl.textContent = text;
}

fillBtn.addEventListener('click', async () => {
  fillBtn.disabled = true;
  setStatus('working', '填写中，页面右上角有进度');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) {
      setStatus('error', '当前页面不支持注入（仅支持 http/https 页面）');
      return;
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const refill = document.getElementById('refill').checked;
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'RESUME_FILL_START', refill });
    handleResult(resp);
  } catch (e) {
    setStatus('error', `失败：${e?.message || e}`);
  } finally {
    fillBtn.disabled = false;
  }
});

function handleResult(resp) {
  if (!resp) {
    setStatus('error', '内容脚本无响应，请刷新页面后重试');
    return;
  }
  if (resp.ok) {
    const parts = [`已填写 ${resp.filled} / ${resp.total} 个字段`];
    if (resp.existing) parts.push(`${resp.existing} 个已有内容未动`);
    if (resp.requiredEmpty) parts.push(`${resp.requiredEmpty} 个必填待补（页面已标黄）`);
    if (resp.skipped && resp.skipped.length) parts.push(`跳过：${resp.skipped.join('、')}`);
    setStatus('success', parts.join('；'));
    return;
  }
  switch (resp.error) {
    case 'NO_API_KEY':
      setStatus('error', '未配置 API Key，请点击下方「打开设置」填写');
      break;
    case 'NO_RESUME':
      setStatus('error', '未填写简历内容，请点击下方「打开设置」粘贴简历');
      break;
    case 'NO_FIELDS':
      setStatus('error', '本页未识别到可填写的表单字段');
      break;
    case 'API_ERROR':
    case 'NETWORK':
    case 'TIMEOUT':
      setStatus('error', `调用大模型失败：${resp.detail || resp.error}`);
      break;
    case 'BAD_JSON':
      setStatus('error', '大模型返回格式异常，请重试');
      break;
    default:
      setStatus('error', resp.detail || resp.error || '未知错误');
  }
}

/* 打开 popup 时先检查配置，缺什么提示什么（与 background.js 的读取逻辑一致：按厂商取 Key） */
(async () => {
  const cfg = await chrome.storage.local.get(['provider', 'apiKeys', 'apiKey', 'resumeMd']);
  const provider = cfg.provider || 'deepseek';
  const apiKey = (cfg.apiKeys && cfg.apiKeys[provider]) || cfg.apiKey || '';
  if (!apiKey) setStatus('error', '尚未配置 API Key，请先打开设置');
  else if (!cfg.resumeMd || !cfg.resumeMd.trim()) setStatus('error', '尚未填写简历，请先打开设置');
})();
