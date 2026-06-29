/*
 * picker.js — 可视化元素标注选择器
 *
 * 交互：
 *   鼠标移动        实时高亮 + 选择器预览 + 尺寸
 *   ] / [          往底层/顶层切
 *   1-9            直接跳到第 N 层
 *   滚轮            滚动页面
 *   Enter / 点击    锁定 → 自动复制 selector → 弹批注框
 *   ⌘/Ctrl + C     hover 时直接复制当前层 selector（无需选中）
 *   ⌘/Ctrl + Enter  hover 时快速标注（选中即提交，跳过打字）
 *   ⌘/Ctrl + Z     撤销上一条标注
 *   Tab (批注框)    切换标签 改/问/赞
 *   Esc             关闭面板 / 取消 / 退出 pick
 *
 * 设计要点：
 *   - Shadow DOM 与页面 CSS 完全隔离
 *   - elementsFromPoint 取整摞重叠元素，按键切层
 *   - 选中即复制 selector 到剪贴板
 */
(function () {
  'use strict';

  const HOST_FLAG = 'data-pk-host';

  // ---------- 1. Shadow DOM UI ----------
  const host = document.createElement('div');
  host.setAttribute(HOST_FLAG, '');
  Object.assign(host.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647',
    pointerEvents: 'none',
  });
  document.documentElement.appendChild(host);

  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }

      #hl {
        position: fixed; margin: 0; padding: 0;
        border: 2px solid #4f8cff; background: rgba(79,140,255,.12);
        border-radius: 3px; pointer-events: none;
        transition: all .04s linear; display: none;
      }
      #hl.pin { border-color: #ff5a5a; background: rgba(255,90,90,.14); }

      #badge {
        position: fixed; top: 0; left: 0; transform: translate(-50%, -150%);
        background: #111827; color: #fff; font: 600 11px/1.4 -apple-system, system-ui, sans-serif;
        padding: 4px 8px; border-radius: 5px; white-space: nowrap;
        pointer-events: none; display: none;
      }
      #badge small { color: #9ca3af; font-weight: 400; }

      #info {
        position: fixed; top: 0; left: 0; transform: translate(0, 100%);
        background: rgba(17,24,39,.92); color: #e5e7eb; font: 11px/1.4 ui-monospace, Menlo, monospace;
        padding: 4px 8px; border-radius: 4px; max-width: 80vw; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; pointer-events: none; display: none;
      }
      #info .dim { color: #9ca3af; }
      #info .pv { color: #60a5fa; }

      #bar {
        position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
        background: #111827; color: #fff; font: 13px/1 -apple-system, system-ui, sans-serif;
        padding: 9px 14px; border-radius: 8px; display: flex; gap: 12px; align-items: center;
        box-shadow: 0 6px 20px rgba(0,0,0,.25); user-select: none;
      }
      #bar .dot { width: 8px; height: 8px; border-radius: 50%; background: #34d399; }
      #bar b { color: #fff; }
      #bar kbd {
        background: #1f2937; border: 1px solid #374151; border-bottom-width: 2px;
        border-radius: 4px; padding: 1px 5px; font: 11px ui-monospace, monospace; color: #d1d5db;
      }
      #bar .muted { color: #9ca3af; }
      #bar .count {
        color: #60a5fa; font-variant-numeric: tabular-nums; cursor: pointer;
        padding: 2px 6px; border-radius: 4px;
      }
      #bar .count:hover { background: #1f2937; }
      #bar button {
        background: transparent; color: #9ca3af; border: 1px solid #374151;
        border-radius: 5px; padding: 3px 8px; font: inherit; cursor: pointer;
      }
      #bar button:hover { color: #fff; border-color: #6b7280; }

      #fab {
        position: fixed; bottom: 18px; right: 18px; width: 44px; height: 44px;
        border-radius: 50%; background: #4f8cff; color: #fff; border: none;
        font: 700 16px/44px -apple-system, system-ui, sans-serif; text-align: center;
        cursor: pointer; box-shadow: 0 4px 14px rgba(79,140,255,.5); display: none;
        pointer-events: auto;
      }

      #note-card {
        position: fixed; width: 300px; background: #fff; border-radius: 10px;
        padding: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.3);
        font: 13px/1.4 -apple-system, system-ui, sans-serif; color: #111827;
        display: none;
      }
      #note-card .sel {
        font: 11px/1.4 ui-monospace, Menlo, monospace; color: #374151;
        background: #f3f4f6; padding: 5px 7px; border-radius: 5px;
        word-break: break-all; margin-bottom: 6px; max-height: 70px; overflow: auto;
      }
      #note-card .copy-row { display: flex; gap: 4px; margin-bottom: 8px; }
      #note-card .copy-row button {
        flex: 1; background: #f3f4f6; color: #6b7280; border: none;
        border-radius: 4px; padding: 4px 0; font: 11px ui-monospace, monospace; cursor: pointer;
      }
      #note-card .copy-row button:hover { background: #e5e7eb; color: #111827; }
      #note-card textarea {
        width: 100%; min-height: 58px; border: 1px solid #d1d5db; border-radius: 6px;
        padding: 7px; font: inherit; resize: vertical; outline: none;
      }
      #note-card textarea:focus { border-color: #4f8cff; }
      #note-card .tags { display: flex; gap: 6px; margin: 8px 0; }
      #note-card .tag {
        flex: 1; padding: 5px 0; text-align: center; border-radius: 5px;
        background: #f3f4f6; cursor: pointer; font-size: 12px; border: 2px solid transparent;
      }
      #note-card .tag.active { border-color: #111827; }
      #note-card .row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
      #note-card .row button {
        border: none; border-radius: 6px; padding: 6px 14px; font: inherit; cursor: pointer;
      }
      #note-card .ok { background: #111827; color: #fff; }
      #note-card .no { background: #f3f4f6; color: #6b7280; }

      /* 标注列表面板 */
      #panel {
        position: fixed; top: 54px; right: 14px; width: 330px; max-height: 70vh;
        background: #fff; border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,.3);
        font: 13px/1.4 -apple-system, system-ui, sans-serif; color: #111827;
        display: none; flex-direction: column; overflow: hidden;
      }
      #panel .hd {
        padding: 10px 12px; border-bottom: 1px solid #f3f4f6; display: flex;
        justify-content: space-between; align-items: center; font-weight: 600;
      }
      #panel .hd button { background: none; border: none; cursor: pointer; color: #9ca3af; font: 15px/1 sans-serif; padding: 0; }
      #panel .list { overflow-y: auto; flex: 1; }
      #panel .item {
        padding: 8px 12px; border-bottom: 1px solid #f9fafb; display: flex; gap: 8px; align-items: flex-start;
      }
      #panel .item:hover { background: #f9fafb; }
      #panel .item .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
      #panel .item .main { flex: 1; min-width: 0; }
      #panel .item .sel {
        font: 11px/1.3 ui-monospace, Menlo, monospace; color: #111827;
        word-break: break-all; cursor: pointer;
      }
      #panel .item .sel:hover { color: #4f8cff; }
      #panel .item .note { font-size: 12px; color: #6b7280; margin-top: 2px; word-break: break-all; }
      #panel .empty { padding: 24px 12px; text-align: center; color: #9ca3af; font-size: 12px; }
      #panel .del {
        background: none; border: none; cursor: pointer; color: #d1d5db; font: 13px/1 sans-serif;
        padding: 2px 4px; flex-shrink: 0;
      }
      #panel .del:hover { color: #ef4444; }
      #panel .ft { padding: 8px 12px; border-top: 1px solid #f3f4f6; display: flex; gap: 8px; }
      #panel .ft button {
        flex: 1; background: #f3f4f6; color: #374151; border: none; border-radius: 6px;
        padding: 7px; font: 12px ui-monospace, monospace; cursor: pointer;
      }
      #panel .ft button:hover { background: #e5e7eb; }

      #toast {
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: #111827; color: #fff; font: 13px -apple-system, system-ui, sans-serif;
        padding: 8px 16px; border-radius: 6px; opacity: 0; transition: opacity .2s;
        pointer-events: none; max-width: 80vw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #toast.show { opacity: 1; }

      #done {
        position: fixed; inset: 0; background: rgba(17,24,39,.94); color: #fff;
        display: none; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; font: 15px/1.6 -apple-system, system-ui, sans-serif; gap: 16px;
        pointer-events: auto;
      }
      #done .big { font-size: 22px; font-weight: 700; }
      #done .hint { color: #9ca3af; max-width: 380px; }
      #done button { background: #4f8cff; color: #fff; border: none; padding: 9px 20px; border-radius: 6px; font: inherit; cursor: pointer; }
    </style>

    <div id="hl"></div>
    <div id="badge"></div>
    <div id="info"></div>

    <div id="bar">
      <span class="dot"></span><b>PICK</b>
      <span class="muted"><kbd>[</kbd><kbd>]</kbd>切层</span>
      <span class="muted"><kbd>⌘C</kbd>复制</span>
      <span class="muted"><kbd>⌘Z</kbd>撤销</span>
      <span class="muted"><kbd>Esc</kbd>退出</span>
      <span class="count" id="cnt" title="点击查看标注列表">0</span>
      <button id="exit">✓ 选完了</button>
    </div>

    <div id="panel">
      <div class="hd"><span id="panel-title">标注</span><button id="panel-close">✕</button></div>
      <div class="list" id="panel-list"></div>
      <div class="ft">
        <button id="cp-all">复制全部 selector</button>
        <button id="cp-all-json">复制 JSON</button>
      </div>
    </div>

    <div id="note-card">
      <div class="sel" id="sel"></div>
      <div class="copy-row">
        <button data-cp="sel">复制 selector</button>
        <button data-cp="xpath">XPath</button>
        <button data-cp="html">HTML</button>
      </div>
      <textarea id="txt" placeholder="批注：这里想怎么改？（Tab 切标签 · ⌘Enter 提交）"></textarea>
      <div class="tags">
        <div class="tag active" data-tag="改">🔴 改</div>
        <div class="tag" data-tag="问">🟡 问</div>
        <div class="tag" data-tag="赞">🟢 赞</div>
      </div>
      <div class="row">
        <button class="no" id="cancel">取消 Esc</button>
        <button class="ok" id="ok">✓ 确认 ⌘Enter</button>
      </div>
    </div>

    <button id="fab">◎</button>
    <div id="toast"></div>

    <div id="done">
      <div class="big">✓ 已记录 <span id="done-n">0</span> 条标注</div>
      <div class="hint">回到 Claude 对话，告诉它你想怎么改。<br>它会读取你选的元素，直接定位到代码去修改。</div>
      <button id="done-resume">继续标注</button>
    </div>
  `;

  const $ = (id) => root.getElementById(id);
  const elHL = $('hl'), elBadge = $('badge'), elInfo = $('info'),
        elBar = $('bar'), elFab = $('fab'), elCard = $('note-card'),
        elSel = $('sel'), elTxt = $('txt'), elOk = $('ok'),
        elCancel = $('cancel'), elToast = $('toast'), elCnt = $('cnt'),
        elPanel = $('panel'), elPanelList = $('panel-list'), elPanelTitle = $('panel-title');

  // ---------- 2. 状态 ----------
  let active = false;
  let stack = [];
  let idx = 0;
  let pinned = null;
  let curTag = '改';
  let recorded = 0;
  let panelOpen = false;

  const TAG_COLOR = { '改': '#ef4444', '问': '#f59e0b', '赞': '#10b981' };

  // ---------- 3. 工具 ----------
  function copyText(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => {}).catch(() => {});
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function stackAt(clientX, clientY) {
    const prev = host.style.pointerEvents;
    host.style.pointerEvents = 'none';
    const all = document.elementsFromPoint(clientX, clientY) || [];
    host.style.pointerEvents = prev;
    return all.filter((el) => {
      if (!el || el.nodeType !== 1) return false;
      if (el.getAttribute && el.getAttribute(HOST_FLAG) !== null) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      return true;
    });
  }

  function cssEscape(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }

  function cssPath(el) {
    if (el.id) return '#' + cssEscape(el.id);
    const parts = [];
    let cur = el, depth = 0;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement && depth < 6) {
      let sel = cur.nodeName.toLowerCase();
      if (cur.id) { parts.unshift('#' + cssEscape(cur.id)); break; }
      const cls = [...cur.classList].filter(c => c.length > 1).slice(0, 2);
      if (cls.length) sel += '.' + cls.map(cssEscape).join('.');
      else {
        const sibs = [...(cur.parentElement?.children || [])].filter(s => s.nodeName === cur.nodeName);
        if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }
      parts.unshift(sel);
      cur = cur.parentElement;
      depth++;
    }
    return parts.join(' > ') || el.nodeName.toLowerCase();
  }

  function xPath(el) {
    if (el.id) return `//*[@id="${el.id}"]`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      let i = 1, sib = cur;
      while ((sib = sib.previousElementSibling)) if (sib.nodeName === cur.nodeName) i++;
      parts.unshift(`${cur.nodeName.toLowerCase()}[${i}]`);
      cur = cur.parentElement;
    }
    return '/' + parts.join('/');
  }

  // 简短选择器预览：tag#id.class（前 2 个 class）
  function selectorPreview(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
    return s;
  }

  // ---------- 4. 渲染高亮 ----------
  function applyHighlight(el, pin) {
    if (!el) { elHL.style.display = 'none'; elBadge.style.display = 'none'; elInfo.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    Object.assign(elHL.style, {
      left: r.left + 'px', top: r.top + 'px',
      width: r.width + 'px', height: r.height + 'px', display: 'block',
    });
    elHL.classList.toggle('pin', !!pin);

    elBadge.style.display = 'block';
    elBadge.style.left = (r.left + r.width / 2) + 'px';
    elBadge.style.top = r.top + 'px';
    elBadge.innerHTML = `${idx + 1}<small>/${stack.length}层 · ${Math.round(r.width)}×${Math.round(r.height)}</small>`;

    elInfo.style.display = 'block';
    elInfo.style.left = r.left + 'px';
    elInfo.style.top = r.top + 'px';
    elInfo.innerHTML = `<span class="pv">${selectorPreview(el)}</span> <span class="dim">${Math.round(r.width)}×${Math.round(r.height)} · ${escapeHtml(cssPath(el))}</span>`;
  }

  function currentEl() { return stack[idx] || null; }
  function refresh() { applyHighlight(currentEl(), !!pinned); }

  // ---------- 5. 模式开关 ----------
  function setActive(on) {
    active = on;
    host.style.pointerEvents = on ? 'auto' : 'none';
    elBar.style.display = on ? 'flex' : 'none';
    elFab.style.display = on ? 'none' : 'block';
    document.body.style.cursor = on ? 'crosshair' : '';
    if (!on) { elHL.style.display = 'none'; elBadge.style.display = 'none'; elInfo.style.display = 'none'; }
  }
  setActive(true);

  elFab.addEventListener('click', () => setActive(true));
  $('exit').addEventListener('click', () => {
    fetch('/__done', { method: 'POST' }).catch(() => {});
    $('done-n').textContent = recorded;
    $('done').style.display = 'flex';
    setActive(false);
  });
  $('done-resume').addEventListener('click', () => { $('done').style.display = 'none'; setActive(true); });

  // ---------- 6. 鼠标 → 取栈 ----------
  host.addEventListener('mousemove', (e) => {
    if (!active || pinned) return;
    stack = stackAt(e.clientX, e.clientY);
    idx = 0;
    refresh();
  });
  host.addEventListener('mouseleave', () => { if (!pinned) { elHL.style.display = 'none'; elBadge.style.display = 'none'; elInfo.style.display = 'none'; } });

  host.addEventListener('wheel', (e) => {
    if (!active) return;
    e.preventDefault();
    if (pinned) return;
    window.scrollBy(0, e.deltaY);
  }, { passive: false });

  function shiftLayer(delta) {
    if (!stack.length) return;
    idx = Math.max(0, Math.min(stack.length - 1, idx + delta));
    refresh();
  }

  // ---------- 7. 锁定 → 自动复制 → 批注 ----------
  function pin() {
    const el = currentEl();
    if (!el) return;
    pinned = el;
    applyHighlight(el, true);

    const sel = cssPath(el);
    copyText(sel);   // 选中即复制

    const r = el.getBoundingClientRect();
    let left = r.right + 10;
    if (left + 300 > window.innerWidth) left = Math.max(8, r.left - 310);
    let top = r.top;
    if (top + 260 > window.innerHeight) top = Math.max(8, window.innerHeight - 270);
    Object.assign(elCard.style, { display: 'block', left: left + 'px', top: top + 'px' });

    elSel.textContent = sel;
    elTxt.value = '';
    toast('已复制 selector · ' + (sel.length > 38 ? sel.slice(0, 38) + '…' : sel));
    setTimeout(() => elTxt.focus(), 0);
  }

  function unpin() { pinned = null; elCard.style.display = 'none'; refresh(); }

  function payloadFor(el, note) {
    const r = el.getBoundingClientRect();
    return {
      timestamp: Date.now(), url: location.pathname,
      selector: cssPath(el), xpath: xPath(el), tag: curTag,
      tagName: el.tagName.toLowerCase(),
      textPreview: (el.textContent || '').trim().slice(0, 80),
      htmlPreview: el.outerHTML.slice(0, 200).replace(/\s+/g, ' '),
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      viewport: { w: innerWidth, h: innerHeight },
      note: note || '',
    };
  }

  function submit() {
    if (!pinned) return;
    const payload = payloadFor(pinned, elTxt.value.trim());
    fetch('/__annotate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(res => res.json())
      .then(d => { recorded = d.count ?? recorded + 1; elCnt.textContent = recorded; if (panelOpen) renderPanel(); })
      .catch(() => toast('提交失败，请重试'));
    unpin();
  }

  // 快速标注：hover 时 ⌘Enter，不弹批注框，用当前 tag 直接提交
  function quickAnnotate() {
    const el = currentEl();
    if (!el) return;
    const payload = payloadFor(el, '');
    copyText(payload.selector);
    fetch('/__annotate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(res => res.json())
      .then(d => {
        recorded = d.count ?? recorded + 1; elCnt.textContent = recorded;
        if (panelOpen) renderPanel();
        const s = payload.selector;
        toast(`已记录 ${d.id} · 已复制 · ${s.length > 34 ? s.slice(0, 34) + '…' : s}`);
      })
      .catch(() => toast('提交失败'));
  }

  elOk.addEventListener('click', submit);
  elCancel.addEventListener('click', unpin);

  // 批注框一键复制
  root.querySelectorAll('.copy-row button').forEach(b => b.addEventListener('click', () => {
    const el = pinned; if (!el) return;
    let text;
    if (b.dataset.cp === 'sel') text = cssPath(el);
    else if (b.dataset.cp === 'xpath') text = xPath(el);
    else text = el.outerHTML;
    copyText(text);
    toast('已复制 · ' + (text.length > 40 ? text.slice(0, 40) + '…' : text));
  }));

  root.querySelectorAll('.tag').forEach(t => t.addEventListener('click', () => {
    root.querySelectorAll('.tag').forEach(x => x.classList.remove('active'));
    t.classList.add('active'); curTag = t.dataset.tag;
  }));

  // ---------- 8. 撤销 ----------
  function undoLast() {
    fetch('/__undo', { method: 'POST' })
      .then(res => res.json())
      .then(d => {
        if (d.ok) {
          recorded = d.count; elCnt.textContent = recorded;
          if (panelOpen) renderPanel();
          toast(d.id ? `已撤销 ${d.id}` : '没有可撤销的');
        }
      }).catch(() => toast('撤销失败'));
  }

  // ---------- 9. 标注面板 ----------
  async function renderPanel() {
    elPanelTitle.textContent = `标注 (${recorded})`;
    try {
      const data = await fetch('/__annotate').then(r => r.json());
      const items = data.annotations || [];
      elPanelList.innerHTML = items.length ? items.map(a => `
        <div class="item">
          <span class="dot" style="background:${TAG_COLOR[a.tag] || '#9ca3af'}"></span>
          <div class="main">
            <div class="sel" data-cp="${escapeHtml(a.selector)}">${escapeHtml(a.selector || '')}</div>
            ${a.note ? `<div class="note">${escapeHtml(a.note)}</div>` : ''}
          </div>
          <button class="del" data-del="${escapeHtml(a.id)}" title="删除">✕</button>
        </div>`).join('') : '<div class="empty">还没有标注</div>';
      elPanelList.querySelectorAll('.sel').forEach(s => s.addEventListener('click', () => {
        copyText(s.dataset.cp);
        toast('已复制 · ' + (s.dataset.cp.length > 40 ? s.dataset.cp.slice(0, 40) + '…' : s.dataset.cp));
      }));
      elPanelList.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => deleteAnno(b.dataset.del)));
    } catch {}
  }

  function deleteAnno(id) {
    fetch('/__delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      .then(r => r.json())
      .then(d => { if (d.ok) { recorded = d.count; elCnt.textContent = recorded; renderPanel(); toast('已删除'); } })
      .catch(() => toast('删除失败'));
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    elPanel.style.display = panelOpen ? 'flex' : 'none';
    if (panelOpen) renderPanel();
  }
  elCnt.addEventListener('click', togglePanel);
  $('panel-close').addEventListener('click', togglePanel);
  $('cp-all').addEventListener('click', async () => {
    const data = await fetch('/__annotate').then(r => r.json());
    const items = data.annotations || [];
    copyText(items.map(a => a.selector).join('\n'));
    toast(`已复制 ${items.length} 条 selector`);
  });
  $('cp-all-json').addEventListener('click', async () => {
    const data = await fetch('/__annotate').then(r => r.json());
    copyText(JSON.stringify(data, null, 2));
    toast('已复制 JSON');
  });

  function toast(msg) {
    elToast.textContent = msg;
    elToast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => elToast.classList.remove('show'), 1800);
  }

  // ---------- 10. 全局键盘 ----------
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;

    // 批注框打开时
    if (pinned) {
      if (e.key === 'Enter' && (mod || (e.target === elTxt && !e.shiftKey))) {
        if (e.target === elTxt || mod) { e.preventDefault(); submit(); }
      } else if (e.key === 'Escape') {
        unpin();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const tags = ['改', '问', '赞'];
        curTag = tags[(tags.indexOf(curTag) + (e.shiftKey ? -1 : 1) + 3) % 3];
        root.querySelectorAll('.tag').forEach(x => x.classList.toggle('active', x.dataset.tag === curTag));
      }
      return;
    }

    if (!active) {
      if (e.key.toLowerCase() === 'p' && !mod && !e.altKey) {
        if (/input|textarea/i.test(document.activeElement?.tagName || '')) return;
        e.preventDefault(); setActive(true);
      }
      return;
    }

    // pick 模式（hover）快捷键
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); const el = currentEl(); if (!el) return; const sel = cssPath(el); copyText(sel); toast('已复制 · ' + (sel.length > 40 ? sel.slice(0, 40) + '…' : sel)); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undoLast(); return; }
    if (mod && e.key === 'Enter') { e.preventDefault(); quickAnnotate(); return; }

    switch (e.key) {
      case ']': case 'ArrowDown': e.preventDefault(); shiftLayer(1); break;
      case '[': case 'ArrowUp':   e.preventDefault(); shiftLayer(-1); break;
      case 'Enter': case ' ': e.preventDefault(); pin(); break;
      case 'Escape': e.preventDefault(); if (panelOpen) togglePanel(); else setActive(false); break;
      default:
        if (/^[1-9]$/.test(e.key)) { e.preventDefault(); idx = Math.min(stack.length - 1, +e.key - 1); refresh(); }
    }
  }, true);

  window.addEventListener('scroll', () => { if (active) refresh(); }, true);
  window.addEventListener('resize', () => { if (active) refresh(); });

  fetch('/__annotate?count=1').then(r => r.json()).then(d => { recorded = d.count || 0; elCnt.textContent = recorded; }).catch(() => {});

  console.log('%c[PICKER] ready', 'color:#4f8cff', '⌘C 复制 · ⌘Enter 快速标注 · ⌘Z 撤销 · Enter 选中');
})();
