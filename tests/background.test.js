/* OfferBuddy — background.js 结构回归测试
   MV3 Service Worker 30s 无活动会被终止，长 LLM 请求期间必须保活。
   该 bug 曾导致「解析请求无响应」，此处锁定修复不再回退。
   运行：node --test */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

test('长请求期间有 Service Worker 保活机制', () => {
  assert.match(src, /keepAlive/i, '缺少 keepAlive 定时器');
  assert.match(src, /getPlatformInfo/, '缺少 chrome.runtime.getPlatformInfo 保活调用');
  assert.match(src, /clearInterval\(keepAlive\)/, 'keepAlive 未被清理，可能泄漏');
});

test('请求超时足够覆盖长简历解析（>= 90s）', () => {
  const m = src.match(/REQUEST_TIMEOUT_MS\s*=\s*(\d+)/);
  assert.ok(m, '未找到 REQUEST_TIMEOUT_MS');
  assert.ok(Number(m[1]) >= 90000, `超时 ${m[1]}ms 太短`);
});
