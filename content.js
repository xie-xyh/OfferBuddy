/* OfferBuddy — 内容脚本
   由 popup 通过 chrome.scripting.executeScript 按需注入：
   识别字段（含所在板块分组）→ 规划并点击「添加」→ 调大模型 → 逐个可见地回填。
   兼容 React/Vue 受控组件：原生 setter 设值 + 派发 input/change 事件。 */

(() => {
  if (window.__offerBuddyLoaded) return;
  window.__offerBuddyLoaded = true;

  const MAX_FIELDS = 120;
  const MAX_SECTIONS = 6;
  const MAX_CLICKS_PER_SECTION = 4;
  const FILL_DELAY_MS = 160;
  const CLICK_WAIT_MS = 600;
  const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset', 'file', 'password']);
  /* “＋ 添加”“添加教育经历”“新增一条工作经历” 都命中 */
  const ADD_TEXT_RE = /^[+＋]?\s*(添加|新增)\s*(一段|一条|一项|个)?\s*(教育|学历|工作|实习|实践|项目|经历|经验|履历|证书|语言)?\s*$/;
  const HEADING_SEL = 'h1,h2,h3,h4,h5,h6,legend,strong,b,[class*="title"],[class*="header"],[class*="Title"],[class*="Header"]';

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || '').trim().toLowerCase();
  const digitsOf = s => (String(s).match(/\d+/g) || []).join('');

  /* ---------- 字段识别 ---------- */

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
        group: getGroupTitle(el).slice(0, 30),
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
  }

  /* select 匹配：精确 → 包含 → 数字（年龄/年限/年月等） */
  function fillSelect(el, value) {
    const v = norm(value);
    const opts = [...el.options].filter(o => !o.disabled && norm(o.text) && !/^(请选择|请选择一项|select)/.test(norm(o.text)));
    let match = opts.find(o => norm(o.text) === v || norm(o.value) === v);
    if (!match) {
      match = opts.find(o => {
        const t = norm(o.text);
        return t.includes(v) || v.includes(t);
      });
    }
    if (!match) {
      const vd = digitsOf(value);
      if (vd) {
        match = opts.find(o => digitsOf(o.text) === vd)
          || opts.find(o => norm(o.text).startsWith(String(parseInt(vd, 10))));
      }
    }
    if (!match) return false;
    setNativeValue(el, match.value);
    return el.value === match.value;
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

  function fillOne(el, field, rawValue) {
    const value = String(rawValue).trim();
    if (!value) return false;
    if (field.type === 'radio' || field.type === 'checkbox') return fillCheckable(el, value);
    if (el.tagName === 'SELECT') return fillSelect(el, value);
    let v = value;
    if (field.type === 'number') {
      v = (String(value).match(/-?\d+(\.\d+)?/) || [''])[0]; // "28岁" → "28"
    } else if (field.type === 'date' || field.type === 'month') {
      v = normalizeDateValue(value, field.type)
        || (/^\d{4}-\d{2}(-\d{2})?$/.test(value) ? value : null);
    }
    if (!v) return false;
    setNativeValue(el, v);
    return !!el.value; // 值被浏览器拒绝（格式仍不合法）则视为未填
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

  async function startFill() {
    let { els, fields } = collectFields();
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
        if (added) ({ els, fields } = collectFields()); // 重新识别新出现的字段
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
    const skipped = [];
    let k = 0;
    for (const { field, el, raw } of toFill) {
      k++;
      const label = field.label || field.name || field.placeholder || `字段 ${field.index}`;
      if (!el.isConnected) { skipped.push(label); continue; }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('ob-filled');
      el.classList.add('ob-filling');
      setBadge(`填写 ${k}/${toFill.length} · ${label}`);
      await sleep(FILL_DELAY_MS);
      const ok = fillOne(el, field, raw);
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

    setBadge(`已填 ${filled} 项，请核对`, 'done');
    setTimeout(hideBadge, 8000);
    return { ok: true, filled, total: fields.length, skipped };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== 'RESUME_FILL_START') return undefined;
    startFill()
      .then(sendResponse)
      .catch(err => {
        setBadge('中断', 'error');
        setTimeout(hideBadge, 5000);
        sendResponse({ ok: false, error: 'FILL_FAILED', detail: String(err?.message || err) });
      });
    return true; // 异步响应
  });
})();
