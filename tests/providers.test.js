/* OfferBuddy — shared/providers.js 结构校验
   运行：node --test tests/ */

const test = require('node:test');
const assert = require('node:assert/strict');
const PROVIDERS = require('../shared/providers.js');

test('每个厂商结构完整', () => {
  for (const [id, p] of Object.entries(PROVIDERS)) {
    assert.ok(p.name && typeof p.name === 'string', `${id} 缺 name`);
    if (id === 'custom') continue;
    assert.ok(/^https:\/\//.test(p.baseUrl), `${id} baseUrl 必须是 https`);
    assert.ok(Array.isArray(p.models) && p.models.length > 0, `${id} 缺候选模型`);
    assert.ok(p.models.every(m => typeof m === 'string' && m.trim()), `${id} 存在空模型名`);
  }
});

test('厂商默认模型（第一项）非空', () => {
  for (const [id, p] of Object.entries(PROVIDERS)) {
    if (id === 'custom') continue;
    assert.ok(p.models[0], `${id} 无默认模型`);
  }
});

test('DeepSeek 不含已下架旧模型', () => {
  assert.ok(!PROVIDERS.deepseek.models.includes('deepseek-chat'));
  assert.ok(!PROVIDERS.deepseek.models.includes('deepseek-reasoner'));
});
