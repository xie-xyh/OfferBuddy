/* OfferBuddy — 共享纯逻辑（UMD）
   浏览器：挂到 globalThis.OB（content/background/options 通过它引用）
   Node：module.exports（tests/ 直接 require）
   约定：只放不依赖 DOM / chrome API 的纯函数，保证可测试。 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.OB = Object.assign(root.OB || {}, factory());
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const norm = s => (s || '').trim().toLowerCase();
  const digitsOf = s => (String(s).match(/\d+/g) || []).join('');

  /* “＋ 添加”“添加教育经历”“新增一条工作经历” 都命中（经历类关键词可连续出现） */
  const ADD_TEXT_RE = /^[+＋]?\s*(添加|新增)(?:\s*(?:一段|一条|一项|个))?(?:\s*(?:教育|学历|工作|实习|实践|项目|经历|经验|履历|证书|语言))*\s*$/;
  const isAddButtonText = t => !!t && t.length <= 15 && ADD_TEXT_RE.test(t);

  /* 选项匹配：精确 → 包含 → 数字（年龄/年限/年月等）。options 为 [{ text, value?, ... }] */
  function matchOption(options, value) {
    const v = norm(value);
    let match = options.find(o => norm(o.text) === v || norm(o.value ?? '') === v);
    if (!match) {
      match = options.find(o => {
        const t = norm(o.text);
        return t.includes(v) || v.includes(t);
      });
    }
    if (!match) {
      const vd = digitsOf(value);
      if (vd) {
        match = options.find(o => digitsOf(o.text) === vd)
          || options.find(o => norm(o.text).startsWith(String(parseInt(vd, 10))));
      }
    }
    return match || null;
  }

  /* 兼容 "1995年6月"、"1995/6/3"、"1995-06" 等写法 → 浏览器要求的格式 */
  function normalizeDateValue(value, type) {
    const m = String(value).match(/(\d{4})\s*[年\/.\-]\s*(\d{1,2})\s*(?:[月\/.\-]\s*(\d{1,2})\s*日?)?/);
    if (!m) return null;
    const y = m[1];
    const mo = m[2].padStart(2, '0');
    if (type === 'month') return `${y}-${mo}`;
    const d = (m[3] || '1').padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }

  /* 按字段类型做本地校验与格式化，不合法返回 null */
  function validateValue(field, rawValue) {
    const v = String(rawValue).trim();
    if (!v) return null;
    switch (field.type) {
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
      case 'tel':
        return /^[+\d][\d\s\-()]{4,19}$/.test(v) ? v : null;
      case 'url':
        return /^(https?:\/\/)?[^\s]+\.[^\s]{2,}$/.test(v) ? v : null;
      case 'number': {
        const m = v.match(/-?\d+(\.\d+)?/);
        return m ? m[0] : null;
      }
      case 'date':
      case 'month':
        return normalizeDateValue(v, field.type) || (/^\d{4}-\d{2}(-\d{2})?$/.test(v) ? v : null);
      default:
        return v;
    }
  }

  /* 同 group 下同名字段出现多次 → 视为多段经历，给字段标 entry（第几段） */
  function assignEntryNumbers(fields) {
    const keyOf = d => `${d.group}|${d.label || d.name || d.placeholder || d.type}`;
    const occ = {};
    fields.forEach(d => { const k = keyOf(d); occ[k] = (occ[k] || 0) + 1; d.entry = occ[k]; });
    const max = {};
    fields.forEach(d => { const k = keyOf(d); max[k] = Math.max(max[k] || 0, d.entry); });
    const dupGroups = new Set();
    fields.forEach(d => { if (d.group && max[keyOf(d)] > 1) dupGroups.add(d.group); });
    fields.forEach(d => { if (!dupGroups.has(d.group)) delete d.entry; });
    return fields;
  }

  /* 从模型输出中提取首个 JSON 对象；非对象（数组/标量/垃圾文本）返回 null */
  function parseJsonObject(text) {
    try {
      const v = JSON.parse(text);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch { /* 继续尝试从文本中提取 */ }
    const m = String(text).match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const v = JSON.parse(m[0]);
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
      } catch { /* 放弃 */ }
    }
    return null;
  }

  /* 已下架/更名的旧模型 ID → 新 ID */
  const LEGACY_MODEL_MAP = {
    'deepseek-chat': 'deepseek-v4-flash',
    'deepseek-reasoner': 'deepseek-v4-pro',
  };
  const resolveModel = m => LEGACY_MODEL_MAP[m] || m;

  /* 把设置页当前表单统一转换为 storage patch，供保存/测试/上传三条路径复用 */
  function buildApiStoragePatch({ provider, apiKeys, apiKey, baseUrl, model, allowEmptyKey = false } = {}) {
    const providerId = String(provider || '').trim();
    const key = String(apiKey || '').trim();
    const url = String(baseUrl || '').trim().replace(/\/+$/, '');
    const modelId = String(model || '').trim();
    if (!providerId || (!allowEmptyKey && !key) || !url || !modelId) return null;
    const savedKeys = apiKeys && typeof apiKeys === 'object' && !Array.isArray(apiKeys) ? apiKeys : {};
    return {
      provider: providerId,
      apiKeys: { ...savedKeys, [providerId]: key },
      baseUrl: url,
      model: modelId,
    };
  }

  return {
    norm,
    digitsOf,
    ADD_TEXT_RE,
    isAddButtonText,
    matchOption,
    normalizeDateValue,
    validateValue,
    assignEntryNumbers,
    parseJsonObject,
    LEGACY_MODEL_MAP,
    resolveModel,
    buildApiStoragePatch,
  };
});
