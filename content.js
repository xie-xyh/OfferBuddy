/* OfferBuddy — 内容脚本
   由 popup 通过 chrome.scripting.executeScript 按需注入：
   识别字段（原生控件 + contenteditable 富文本 + 伪下拉，含分组与第几段经历）
   → 规划并点击「添加」→ 调大模型 → 本地校验 → 逐个可见地回填 → 必填缺漏标黄。
   兼容 React/Vue 受控组件：原生 setter 设值 + 派发 input/change 事件。 */

(() => {
  if (window.__offerBuddyLoaded) return;
  window.__offerBuddyLoaded = true;

  const MAX_FIELDS = 120;
  const MAX_FAKE_SELECTS = 10;
  const MAX_SECTIONS = 6;
  const MAX_CLICKS_PER_SECTION = 4;
  const FILL_DELAY_MS = 160;
  const CLICK_WAIT_MS = 600;
  const PANEL_WAIT_MS = 350;
  const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset', 'file', 'password']);
  /* “＋ 添加”“添加教育经历”“新增一条工作经历” 都命中 */
  const ADD_TEXT_RE = /^[+＋]?\s*(添加|新增)\s*(一段|一条|一项|个)?\s*(教育|学历|工作|实习|实践|项目|经历|经验|履历|证书|语言)?\s*$/;
  const HEADING_SEL = 'h1,h2,h3,h4,h5,h6,legend,strong,b,[class*="title"],[class*="header"],[class*="Title"],[class*="Header"]';
  /* 类名 token 形如 el-select / ant-select-selector / select__trigger，排除 selected 之类 */
  const SELECT_TOKEN_RE = /(^|[-_])select([-_]|$)|combobox|cascader/i;
  const PANEL_TOKEN_RE = /dropdown|popover|popper|menu|cascader|(^|[-_])select([-_]|$)/i;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || '').trim().toLowerCase();
  const digitsOf = s => (String(s).match(/\d+/g) || []).join('');

  /* ---------- 基础工具 ---------- */

  function isVisible(el) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function textOf(node) {
    return (node?.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function shortText(node) {
    const t = textOf(node);
    return (t && t.length <= 20) ? t : '';
  }

  function getLabel(el) {
    if (el.labels && el.labels.length) {
      const t = [...el.labels].map(textOf).filter(Boolean).join(' ');
      if (t) return t;
    }
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const t = labelledBy.split(/\s+/)
        .map(id => textOf(document.getElementById(id)))
        .filter(Boolean).join(' ');
      if (t) return t;
    }
    const wrap = el.closest('label');
    if (wrap && textOf(wrap)) return textOf(wrap);
    let sib = el.previousElementSibling;
    while (sib) {
      const t = textOf(sib);
      if (t) return t;
      sib = sib.previousElementSibling;
    }
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

  /* 字段所在板块/分组标题（如“项目经验”“起止时间”），给大模型分组语义 */
  function getGroupTitle(el) {
    let node = el.parentElement;
    let depth = 0;
    while (node && node !== document.body && depth < 6) {
      const head = node.querySelector(HEADING_SEL);
      if (head && !head.contains(el) && !head.matches('input,select,textarea')) {
        const t = shortText(head);
        if (t && !ADD_TEXT_RE.test(t)) return t;
      }
      if (depth >= 1) {
        let sib = node.previousElementSibling;
        while (sib) {
          if (!sib.querySelector('input,select,textarea')) {
            const t = shortText(sib);
            if (t && !ADD_TEXT_RE.test(t)) return t;
          }
          sib = sib.previousElementSibling;
        }
      }
      node = node.parentElement;
      depth++;
    }
    return '';
  }

  /* ---------- 伪下拉（div 模拟 select） ---------- */

  function fakeSelectHost(el) {
    let node = el;
    let depth = 0;
    while (node && node !== document.body && depth < 5) {
      if (node.getAttribute && (node.getAttribute('role') === 'combobox' || node.getAttribute('aria-haspopup') === 'listbox')) {
        return node;
      }
      const cls = String(node.className || '');
      if (cls && cls.split(/\s+/).some(t => SELECT_TOKEN_RE.test(t))) return node;
      node = node.parentElement;
      depth++;
    }
    return null;
  }

  function findFakeSelects() {
    const out = [];
    const hosts = new Set();
    for (const el of document.querySelectorAll('input[readonly], [role="combobox"]')) {
      if (out.length >= MAX_FAKE_SELECTS) break;
      if (!isVisible(el) || el.disabled) continue;
      const host = fakeSelectHost(el);
      if (!host || hosts.has(host)) continue;
      hosts.add(host);
      el.__host = host;
      out.push(el);
    }
    return out;
  }

  function visibleDropdownPanels() {
    return [...document.querySelectorAll('div, ul')].filter(n => {
      if (!isVisible(n)) return false;
      const cls = String(n.className || '');
      return cls && cls.split(/\s+/).some(t => PANEL_TOKEN_RE.test(t));
    });
  }

  async function openDropdown(host) {
    const before = new Set(visibleDropdownPanels());
    host.scrollIntoView({ block: 'center' });
    host.click();
    await sleep(PANEL_WAIT_MS);
    return visibleDropdownPanels().find(p => !before.has(p)) || null;
  }

  function closeDropdown() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function readDropdownOptions(panel) {
    const items = [...panel.querySelectorAll('[role="option"], li, [class*="option"], [class*="item"], [class*="Option"], [class*="Item"]')]
      .filter(isVisible);
    const leaves = items.filter(n => !items.some(o => o !== n && n.contains(o)));
    const seen = new Set();
    return leaves
      .map(el => ({ el, text: textOf(el) }))
      .filter(o => o.text && o.text.length <= 50 && !seen.has(o.text) && seen.add(o.text));
  }

  async function snapshotOptions(el) {
    const panel = await openDropdown(el.__host || el);
    if (!panel) return [];
    const opts = readDropdownOptions(panel).map(o => o.text);
    closeDropdown();
    await sleep(200);
    return opts;
  }

  /* ---------- 字段识别 ---------- */

  function buildDescriptor(el, index) {
    const d = {
      index,
      tag: el.tagName.toLowerCase(),
      type: '',
      name: el.name || '',
      id: el.id || '',
      label: getLabel(el).slice(0, 120),
      group: getGroupTitle(el).slice(0, 30),
      placeholder: (el.getAttribute('placeholder') || '').slice(0, 80),
      required: !!el.required || el.getAttribute('aria-required') === 'true',
    };
    if (el.__host) {
      d.tag = 'div';
      d.type = 'fakeselect';
      d.options = (el.__options || []).slice(0, 60);
    } else if (el.isContentEditable) {
      d.tag = 'div';
      d.type = 'richtext';
    } else {
      d.type = el.tagName === 'INPUT' ? el.type : el.tagName.toLowerCase();
      if (el.tagName === 'SELECT') {
        d.options = [...el.options].map(o => o.text.trim()).filter(Boolean).slice(0, 60);
      }
      if (el.type === 'radio' || el.type === 'checkbox') {
        d.checked = el.checked;
      }
    }
    return d;
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
  }

  async function collectFields() {
    const nativeEls = [...document.querySelectorAll('input, textarea, select')]
      .filter(el => {
        if (el.disabled || el.readOnly) return false; // readonly input 交给伪下拉逻辑
        if (el.tagName === 'INPUT' && SKIP_INPUT_TYPES.has(el.type)) return false;
        return isVisible(el);
      });
    const richEls = [...document.querySelectorAll('[contenteditable="true"], [contenteditable=""]')]
      .filter(el => isVisible(el) && !el.closest('input,textarea'));
    const fakeEls = findFakeSelects();

    const els = [...nativeEls, ...richEls, ...fakeEls].slice(0, MAX_FIELDS);

    // 逐个打开伪下拉快照选项（填表前需要把选项给大模型）
    for (const el of fakeEls) {
      if (!els.includes(el)) break;
      el.__options = await snapshotOptions(el).catch(() => []);
    }

    const fields = els.map((el, index) => buildDescriptor(el, index));
    assignEntryNumbers(fields);
    return { els, fields };
  }

  /* ---------- 页面上的状态徽标 ---------- */

  let badgeEl = null;

  function ensureBadge() {
    if (badgeEl && badgeEl.isConnected) return badgeEl;
    if (!document.getElementById('ob-style')) {
      const style = document.createElement('style');
      style.id = 'ob-style';
      style.textContent = `
        @keyframes ob-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(46,75,216,.45); } 50% { box-shadow: 0 0 0 7px rgba(46,75,216,0); } }
        @keyframes ob-spin { to { transform: rotate(360deg); } }
        .ob-filling { outline: 2px solid #2E4BD8 !important; outline-offset: 1px; animation: ob-pulse 1s ease-in-out infinite; }
        .ob-filled { outline: 2px solid #0E8A66 !important; outline-offset: 1px; }
        .ob-warn { outline: 2px solid #D97706 !important; outline-offset: 1px; }
        @media (prefers-reduced-motion: reduce) { .ob-filling { animation: none; } }
      `;
      document.documentElement.appendChild(style);
    }
    badgeEl = document.createElement('div');
    badgeEl.style.cssText = [
      'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647',
      'background:#1C2536', 'color:#fff', 'padding:9px 13px', 'border-radius:10px',
      'font:13px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif',
      'box-shadow:0 6px 20px rgba(0,0,0,.28)', 'max-width:300px',
      'display:flex', 'align-items:center', 'gap:8px', 'transition:opacity .35s',
    ].join(';');
    document.documentElement.appendChild(badgeEl);
    return badgeEl;
  }

  function setBadge(text, mode = 'working') {
    const badge = ensureBadge();
    badge.style.opacity = '1';
    const icon = document.createElement('span');
    if (mode === 'working') {
      icon.style.cssText = 'width:12px;height:12px;flex:none;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:ob-spin .7s linear infinite';
    } else {
      icon.style.cssText = `width:8px;height:8px;flex:none;border-radius:50%;background:${mode === 'error' ? '#f87171' : '#34d399'}`;
    }
    const label = document.createElement('span');
    label.textContent = text;
    badge.replaceChildren(icon, label);
  }

  function hideBadge() {
    if (badgeEl) badgeEl.style.opacity = '0';
  }

  /* ---------- 回填 ---------- */

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
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /* select 匹配：精确 → 包含 → 数字（年龄/年限/年月等） */
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

  function fillSelect(el, value) {
    const opts = [...el.options]
      .filter(o => !o.disabled && norm(o.text) && !/^(请选择|请选择一项|select)/.test(norm(o.text)))
      .map(o => ({ el: o, text: o.text, value: o.value }));
    const match = matchOption(opts, value);
    if (!match) return false;
    setNativeValue(el, match.el.value);
    return el.value === match.el.value;
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

  /* contenteditable 富文本：execCommand 触发编辑器自己的输入监听 */
  function fillRichText(el, value) {
    el.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(el);
    let ok = false;
    try { ok = document.execCommand('insertText', false, value); } catch { /* 降级 */ }
    if (!ok) el.innerText = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return (el.innerText || '').trim().length > 0;
  }

  async function fillFakeSelect(el, value) {
    const panel = await openDropdown(el.__host || el);
    if (!panel) return false;
    const opts = readDropdownOptions(panel);
    const match = matchOption(opts, value);
    if (!match) {
      closeDropdown();
      return false;
    }
    match.el.click();
    await sleep(150);
    return true;
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

  /* 按字段类型做本地校验与格式化，不合法返回 null（标黄并跳过） */
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

  async function fillOne(el, field, value) {
    if (field.type === 'radio' || field.type === 'checkbox') return fillCheckable(el, value);
    if (field.type === 'richtext') return fillRichText(el, value);
    if (field.type === 'fakeselect') return fillFakeSelect(el, value);
    if (el.tagName === 'SELECT') return fillSelect(el, value);
    setNativeValue(el, value);
    return !!el.value;
  }

  /* 已有内容的字段默认跳过（勾选“覆盖已有内容”时除外） */
  function hasExistingValue(el, field) {
    if (field.type === 'radio' || field.type === 'checkbox' || field.type === 'fakeselect') return false;
    if (field.type === 'richtext') return (el.innerText || '').trim().length > 0;
    return !!(el.value && String(el.value).trim());
  }

  /* ---------- 「添加」按钮检测与条目规划 ---------- */

  /* 招聘站的添加按钮常是 span/div + cursor:pointer，不只 button/a */
  function findAddButtons() {
    return [...document.querySelectorAll('button, a, span, div, i, [role="button"], input[type="button"]')]
      .filter(el => {
        if (el.disabled || !isVisible(el)) return false;
        const t = el.tagName === 'INPUT' ? (el.value || '').trim() : textOf(el);
        if (!t || t.length > 15 || !ADD_TEXT_RE.test(t)) return false;
        // 必须是叶级元素，避免容器因子节点文本命中
        if ([...el.children].some(c => ADD_TEXT_RE.test(textOf(c)))) return false;
        return /^(BUTTON|A|INPUT)$/.test(el.tagName)
          || el.getAttribute('role') === 'button'
          || !!el.onclick
          || getComputedStyle(el).cursor === 'pointer';
      });
  }

  function getSectionTitle(container, btn) {
    const t = getGroupTitle(btn);
    if (t) return t;
    // 容器内第一个「非表单、非添加按钮」的短文本，通常就是板块标题
    const nodes = container.querySelectorAll('*');
    for (let i = 0; i < Math.min(nodes.length, 60); i++) {
      const n = nodes[i];
      if (n === btn || n.contains(btn)) continue;
      if (n.querySelector('input,select,textarea')) continue;
      if ([...n.children].some(c => textOf(c))) continue; // 只看叶级
      const t = shortText(n);
      if (t && !ADD_TEXT_RE.test(t)) return t;
    }
    return '';
  }

  function findAddableSections(fields, els) {
    const buttons = findAddButtons();
    const seen = new Set();
    const sections = [];
    for (const btn of buttons) {
      // 向上找「同时包含按钮和至少一个已采集字段」的最近容器
      let container = btn.parentElement;
      let depth = 0;
      while (container && depth < 6 && !els.some(f => container.contains(f))) {
        container = container.parentElement;
        depth++;
      }
      if (!container || seen.has(container)) continue;
      seen.add(container);
      const memberLabels = fields
        .filter((f, j) => container.contains(els[j]))
        .map(f => f.label || f.name || f.placeholder)
        .filter(Boolean)
        .slice(0, 12);
      if (!memberLabels.length) continue;
      sections.push({
        section: `s${sections.length}`,
        buttonText: (textOf(btn) || btn.value || '').slice(0, 30),
        sectionTitle: getSectionTitle(container, btn),
        currentFields: memberLabels,
        _btn: btn,
      });
      if (sections.length >= MAX_SECTIONS) break;
    }
    return sections;
  }

  /* ---------- 主流程 ---------- */

  async function startFill(refill) {
    let { els, fields } = await collectFields();
    if (!fields.length) return { ok: false, error: 'NO_FIELDS' };
    setBadge(`识别 ${fields.length} 个字段`);

    /* 1) 检测「添加」按钮，让大模型按简历段数判断需要补几组 */
    const sections = findAddableSections(fields, els);
    if (sections.length) {
      setBadge('规划经历条目…');
      const plan = await chrome.runtime.sendMessage({
        type: 'PLAN_ENTRIES',
        url: location.href,
        title: document.title,
        sections: sections.map(({ section, buttonText, sectionTitle, currentFields }) => (
          { section, buttonText, sectionTitle, currentFields }
        )),
      });
      if (plan?.ok && plan.addClicks) {
        let added = false;
        for (const s of sections) {
          const clicks = Math.min(MAX_CLICKS_PER_SECTION, Math.max(0, parseInt(plan.addClicks[s.section], 10) || 0));
          for (let c = 0; c < clicks; c++) {
            setBadge(`添加：${s.sectionTitle || s.buttonText}`);
            s._btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(300);
            s._btn.click();
            added = true;
            await sleep(CLICK_WAIT_MS);
          }
        }
        if (added) ({ els, fields } = await collectFields()); // 重新识别新出现的字段
      }
    }

    /* 2) 大模型生成填写值 */
    setBadge('生成填写内容…');
    const resp = await chrome.runtime.sendMessage({
      type: 'GENERATE_FILL',
      url: location.href,
      title: document.title,
      fields,
    });
    if (!resp || !resp.ok) {
      setBadge('生成失败', 'error');
      setTimeout(hideBadge, 5000);
      return resp || { ok: false, error: 'NO_RESPONSE' };
    }

    /* 3) 逐个可见地回填：滚动到字段 → 蓝色脉冲 → 填入 → 绿色描边 */
    const values = resp.values || {};
    const toFill = fields
      .map((field, i) => ({ field, el: els[i], raw: values[String(field.index)] }))
      .filter(x => x.raw != null && String(x.raw).trim() !== '');
    let filled = 0;
    let existing = 0;
    const skipped = [];
    let k = 0;
    for (const { field, el, raw } of toFill) {
      const label = field.label || field.name || field.placeholder || `字段 ${field.index}`;
      if (!el.isConnected) { skipped.push(label); continue; }
      if (!refill && hasExistingValue(el, field)) { existing++; continue; }
      k++;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('ob-filled');
      el.classList.add('ob-filling');
      setBadge(`填写 ${k}/${toFill.length} · ${label}`);
      await sleep(FILL_DELAY_MS);

      const v = validateValue(field, raw);
      if (v == null) {
        el.classList.remove('ob-filling');
        el.classList.add('ob-warn');
        skipped.push(`${label}（值不合法）`);
        continue;
      }
      const ok = await fillOne(el, field, v);
      if (ok) {
        filled++;
        el.classList.remove('ob-filling');
        el.classList.add('ob-filled');
      } else {
        el.classList.remove('ob-filling');
        skipped.push(label);
      }
      await sleep(60);
    }

    /* 4) 收尾：必填但仍空的字段标黄提醒 */
    let requiredEmpty = 0;
    fields.forEach((field, i) => {
      if (!field.required) return;
      const el = els[i];
      if (!el.isConnected) return;
      let empty;
      if (field.type === 'richtext') empty = !(el.innerText || '').trim();
      else if (field.type === 'radio') {
        empty = el.name
          ? ![...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)].some(r => r.checked)
          : !el.checked;
      } else if (field.type === 'checkbox') empty = !el.checked;
      else if (field.type === 'fakeselect') empty = false; // 伪下拉无可靠判空手段
      else empty = !(el.value && String(el.value).trim());
      if (empty) {
        requiredEmpty++;
        el.classList.add('ob-warn');
      }
    });

    setBadge(`已填 ${filled} 项${requiredEmpty ? ` · ${requiredEmpty} 个必填待补` : ''}`, 'done');
    setTimeout(hideBadge, 8000);
    return { ok: true, filled, total: fields.length, skipped, existing, requiredEmpty };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== 'RESUME_FILL_START') return undefined;
    startFill(!!msg.refill)
      .then(sendResponse)
      .catch(err => {
        setBadge('中断', 'error');
        setTimeout(hideBadge, 5000);
        sendResponse({ ok: false, error: 'FILL_FAILED', detail: String(err?.message || err) });
      });
    return true; // 异步响应
  });
})();
