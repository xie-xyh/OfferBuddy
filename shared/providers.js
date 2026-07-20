/* OfferBuddy — 厂商预设（UMD）
   浏览器：globalThis.OB_PROVIDERS（options.js 使用）
   Node：tests/ 直接 require 校验结构。
   模型列表核实于 2026-07，以各厂商官方文档 / 接口为准；更新时请同步修改注释日期。 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.OB_PROVIDERS = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
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
});
