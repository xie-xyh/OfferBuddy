/* AI 简历自动填写 — 内容脚本
   由 popup 通过 chrome.scripting.executeScript 按需注入：
   识别页面表单字段 → 请 background 调大模型 → 回填并高亮。
   兼容 React/Vue 受控组件：原生 setter 设值 + 派发 input/change 事件。 */

(() => {
  if (window.__resumeFillerLoaded) return;
  window.__resumeFillerLoaded = true;

  const MAX_FIELDS = 80;
  const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset', 'file', 'password']);

  function isVisible(el) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function textOf(node) {
    return (node?.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function getLabel(el) {
    // 1. 关联的 <label for> / 包裹 label（el.labels 两者都覆盖）
    if (el.labels && el.labels.length) {
      const t = [...el.labels].map(textOf).filter(Boolean).join(' ');
      if (t) return t;
    }
    // 2. aria
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const t = labelledBy.split(/\s+/)
        .map(id => textOf(document.getElementById(id)))
        .filter(Boolean).join(' ');
      if (t) return t;
    }
    // 3. 前一个兄弟元素的文本
    let sib = el.previousElementSibling;
    while (sib) {
      const t = textOf(sib);
      if (t) return t;
      sib = sib.previousElementSibling;
    }
    // 4. 父元素自身文本 / 父元素的前一个兄弟
    const parent = el.parentElement;
    if (parent) {
      const own = [...parent.childNodes]
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim()).filter(Boolean).join(' ');
      if (own) return own;
      const prev = parent.previousElementSibling;
      if (prev && textOf(prev)) return textOf(prev);
    }
    return '';
  }

  function collectFields() {
    const els = [...document.querySelectorAll('input, textarea, select')]
      .filter(el => {
        if (el.disabled || el.readOnly) return false;
        if (el.tagName === 'INPUT' && SKIP_INPUT_TYPES.has(el.type)) return false;
        return isVisible(el);
      })
      .slice(0, MAX_FIELDS);

    const fields = els.map((el, index) => {
      const d = {
        index,
        tag: el.tagName.toLowerCase(),
        type: el.tagName === 'INPUT' ? el.type : el.tagName.toLowerCase(),
        name: el.name || '',
        id: el.id || '',
        label: getLabel(el).slice(0, 120),
        placeholder: (el.getAttribute('placeholder') || '').slice(0, 80),
        required: !!el.required,
      };
      if (el.tagName === 'SELECT') {
        d.options = [...el.options].map(o => o.text.trim()).filter(Boolean).slice(0, 60);
      }
      if (el.type === 'radio' || el.type === 'checkbox') {
        d.checked = el.checked;
      }
      return d;
    });
    return { els, fields };
  }

  /* React/Vue 受控组件必须用原生 setter，否则框架 state 会覆盖填进去的值 */
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const norm = s => (s || '').trim().toLowerCase();

  function fillSelect(el, value) {
    const v = norm(value);
    const opts = [...el.options];
    let match = opts.find(o => norm(o.text) === v || norm(o.value) === v);
    if (!match) {
      match = opts.find(o => {
        const t = norm(o.text);
        return t && (t.includes(v) || v.includes(t));
      });
    }
    if (!match) return false;
    setNativeValue(el, match.value);
    return true;
  }

  function fillCheckable(el, value) {
    const truthy = /^(true|1|yes|y|是|对|选中|勾选)$/i.test(String(value).trim());
    if (el.type === 'radio') {
      if (truthy && !el.checked) el.click();
      return truthy;
    }
    if (truthy !== el.checked) el.click();
    return true;
  }

  function highlight(el) {
    el.style.outline = '2px solid #16a34a';
    el.style.outlineOffset = '1px';
  }

  function fillOne(el, field, rawValue) {
    const value = String(rawValue).trim();
    if (!value) return false;
    if (field.type === 'radio' || field.type === 'checkbox') {
      const ok = fillCheckable(el, value);
      if (ok) highlight(el);
      return ok;
    }
    if (el.tagName === 'SELECT') {
      const ok = fillSelect(el, value);
      if (ok) highlight(el);
      return ok;
    }
    let v = value;
    if (field.type === 'number') v = value.replace(/[^\d.\-]/g, '');
    if (!v) return false;
    setNativeValue(el, v);
    if (!el.value) return false; // 值被浏览器拒绝（如 date 格式不对）
    highlight(el);
    return true;
  }

  async function startFill() {
    const { els, fields } = collectFields();
    if (!fields.length) return { ok: false, error: 'NO_FIELDS' };

    const resp = await chrome.runtime.sendMessage({
      type: 'GENERATE_FILL',
      url: location.href,
      title: document.title,
      fields,
    });
    if (!resp || !resp.ok) return resp || { ok: false, error: 'NO_RESPONSE' };

    const values = resp.values || {};
    let filled = 0;
    const skipped = [];
    fields.forEach((field, i) => {
      const raw = values[String(field.index)];
      if (raw == null || String(raw).trim() === '') return; // 大模型主动留空
      const ok = fillOne(els[i], field, raw);
      if (ok) filled += 1;
      else skipped.push(field.label || field.name || field.placeholder || `#${field.index}`);
    });
    return { ok: true, filled, total: fields.length, skipped };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== 'RESUME_FILL_START') return undefined;
    startFill()
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: 'FILL_FAILED', detail: String(err?.message || err) }));
    return true; // 异步响应
  });
})();
