/*
 * picker.js — 可视化元素标注选择器
 *
 * 交互：
 *   鼠标移动        实时高亮当前层
 *   ]              往底层（父级方向）切
 *   [              往顶层（子级方向）切
 *   滚轮            滚动页面（pick 模式下仍能滚，方便标注下方元素）
 *   Enter / 点击    锁定 → 弹批注框 → 打勾确认
 *   1/2/3           选层（直接跳到第 N 层）
 *   Esc             取消 / 退出 pick 模式
 *
 * 设计要点：
 *   - 整个 picker UI 装进 Shadow DOM，与页面 CSS 完全隔离
 *   - 用 document.elementsFromPoint() 拿到鼠标坐标下的「整摞」重叠元素，
 *     再按键在栈里上下切换 —— 解决图层堆叠选不到下层的问题
 *   - 临时把 host 设为 pointer-events:none 再取栈，host 自身不会污染结果
 */
(function () {
  'use strict';

  // 唯一标记，便于从 elementsFromPoint 结果里过滤掉 picker 自身
  const HOST_FLAG = 'data-pk-host';

  // ---------- 1. 搭建 Shadow DOM 隔离的 UI ----------
  const host = document.createElement('div');
  host.setAttribute(HOST_FLAG, '');
  Object.assign(host.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647',
    pointerEvents: 'none',     // 默认不拦截；激活时再打开 overlay 的拦截
  });
  document.documentElement.appendChild(host);

  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }

      /* 高亮框：套在当前 hover 层上 */
      #hl {
        position: fixed; margin: 0; padding: 0;
        border: 2px solid #4f8cff; background: rgba(79,140,255,.12);
        border-radius: 3px; pointer-events: none;
        transition: all .04s linear; display: none;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0); /* 占位 */
      }
      #hl.pin { border-color: #ff5a5a; background: rgba(255,90,90,.14); }

      /* 层级徽标：显示 当前层/总层数 */
      #badge {
        position: fixed; top: 0; left: 0; transform: translate(-50%, -150%);
        background: #111827; color: #fff; font: 600 11px/1 -apple-system, system-ui, sans-serif;
        padding: 3px 7px; border-radius: 5px; white-space: nowrap;
        pointer-events: none; display: none;
      }
      #badge small { color: #9ca3af; font-weight: 400; }

      /* 元素信息条：标签名 + class */
      #info {
        position: fixed; top: 0; left: 0; transform: translate(0, 100%);
        background: rgba(17,24,39,.92); color: #e5e7eb; font: 11px/1.4 ui-monospace, Menlo, monospace;
        padding: 4px 8px; border-radius: 4px; max-width: 60vw; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; pointer-events: none; display: none;
      }

      /* 顶部工具栏 */
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
      #bar .count { color: #60a5fa; font-variant-numeric: tabular-nums; }
      #bar button {
        background: transparent; color: #9ca3af; border: 1px solid #374151;
        border-radius: 5px; padding: 3px 8px; font: inherit; cursor: pointer;
      }
      #bar button:hover { color: #fff; border-color: #6b7280; }

      /* 退出后的悬浮小按钮 */
      #fab {
        position: fixed; bottom: 18px; right: 18px; width: 44px; height: 44px;
        border-radius: 50%; background: #4f8cff; color: #fff; border: none;
        font: 700 16px/44px -apple-system, system-ui, sans-serif; text-align: center;
        cursor: pointer; box-shadow: 0 4px 14px rgba(79,140,255,.5); display: none;
        pointer-events: auto;
      }

      /* 批注浮层 */
      #note-card {
        position: fixed; width: 280px; background: #fff; border-radius: 10px;
        padding: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.3);
        font: 13px/1.4 -apple-system, system-ui, sans-serif; color: #111827;
        display: none;
      }
      #note-card .sel {
        font: 11px/1.4 ui-monospace, Menlo, monospace; color: #6b7280;
        background: #f3f4f6; padding: 5px 7px; border-radius: 5px;
        word-break: break-all; margin-bottom: 8px; max-height: 70px; overflow: auto;
      }
      #note-card textarea {
        width: 100%; min-height: 64px; border: 1px solid #d1d5db; border-radius: 6px;
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
      #note-card button {
        border: none; border-radius: 6px; padding: 6px 14px; font: inherit; cursor: pointer;
      }
      #note-card .ok { background: #111827; color: #fff; }
      #note-card .no { background: #f3f4f6; color: #6b7280; }

      /* 提示 toast */
      #toast {
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: #111827; color: #fff; font: 13px -apple-system, system-ui, sans-serif;
        padding: 8px 16px; border-radius: 6px; opacity: 0; transition: opacity .2s;
        pointer-events: none;
      }
      #toast.show { opacity: 1; }

      /* 选完后的全屏结束遮罩 */
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
      <span class="dot"></span><b>PICK MODE</b>
      <span class="muted"><kbd>[</kbd><kbd>]</kbd>切层</span>
      <span class="muted"><kbd>Enter</kbd>选中</span>
      <span class="muted"><kbd>Esc</kbd>退出</span>
      <span class="count" id="cnt">0</span>
      <button id="exit">✓ 选完了</button>
    </div>

    <div id="note-card">
      <div class="sel" id="sel"></div>
      <textarea id="txt" placeholder="批注：这里想怎么改？"></textarea>
      <div class="tags">
        <div class="tag active" data-tag="改">🔴 改</div>
        <div class="tag" data-tag="问">🟡 问</div>
        <div class="tag" data-tag="赞">🟢 赞</div>
      </div>
      <div class="row">
        <button class="no" id="cancel">取消 Esc</button>
        <button class="ok" id="ok">✓ 确认 Enter</button>
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
        elCancel = $('cancel'), elToast = $('toast'), elCnt = $('cnt');

  // ---------- 2. 状态 ----------
  let active = false;        // pick 模式是否激活
  let stack = [];            // 当前坐标下的元素栈（顶→底）
  let idx = 0;               // 当前选中第几层
  let pinned = null;         // 已锁定的元素
  let curTag = '改';
  let recorded = 0;

  // ---------- 3. 取元素栈（核心） ----------
  function stackAt(clientX, clientY) {
    // 临时让 host 不拦事件，elementsFromPoint 才会返回它底下的真实页面元素
    const prev = host.style.pointerEvents;
    host.style.pointerEvents = 'none';
    const all = document.elementsFromPoint(clientX, clientY) || [];
    host.style.pointerEvents = prev;

    // 过滤：picker 自身注入物、零尺寸、不可见
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

  // 生成稳健 CSS selector
  function cssPath(el) {
    if (el.id) return '#' + cssEscape(el.id);
    const parts = [];
    let cur = el, depth = 0;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement && depth < 6) {
      let sel = cur.nodeName.toLowerCase();
      if (cur.id) { parts.unshift('#' + cssEscape(cur.id)); break; }
      // 取有区分度的 class（去掉明显 utility 类）
      const cls = [...cur.classList].filter(c => c.length > 1).slice(0, 2);
      if (cls.length) sel += '.' + cls.map(cssEscape).join('.');
      else {
        // 没 class/ id → 用 nth-of-type 定位
        const sibs = [...cur.parentElement?.children || []]
          .filter(s => s.nodeName === cur.nodeName);
        if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }
      parts.unshift(sel);
      cur = cur.parentElement;
      depth++;
    }
    return parts.join(' > ') || el.nodeName.toLowerCase();
  }
  function cssEscape(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }

  // 生成 XPath（备用，定位更死板但稳）
  function xPath(el) {
    if (el.id) return `//*[@id="${el.id}"]`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      let i = 1;
      let sib = cur;
      while ((sib = sib.previousElementSibling)) if (sib.nodeName === cur.nodeName) i++;
      parts.unshift(`${cur.nodeName.toLowerCase()}[${i}]`);
      cur = cur.parentElement;
    }
    return '/' + parts.join('/');
  }

  // ---------- 4. 渲染高亮 ----------
  function applyHighlight(el, pin) {
    if (!el) { elHL.style.display = 'none'; elBadge.style.display = 'none'; elInfo.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    Object.assign(elHL.style, {
      left: r.left + 'px', top: r.top + 'px',
      width: r.width + 'px', height: r.height + 'px',
      display: 'block',
    });
    elHL.classList.toggle('pin', !!pin);
    elBadge.style.display = 'block';
    elBadge.style.left = (r.left + r.width / 2) + 'px';
    elBadge.style.top = r.top + 'px';
    elBadge.innerHTML = `${idx + 1}<small>/${stack.length}层</small>`;

    elInfo.style.display = 'block';
    elInfo.style.left = r.left + 'px';
    elInfo.style.top = r.top + 'px';
    const cls = el.className && typeof el.className === 'string' ? ('.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')) : '';
    elInfo.textContent = el.tagName.toLowerCase() + cls;
  }

  function currentEl() { return stack[idx] || null; }

  function refresh() { applyHighlight(currentEl(), !!pinned); }

  // ---------- 5. 模式开关 ----------
  function setActive(on) {
    active = on;
    host.style.pointerEvents = on ? 'auto' : 'none';   // 激活时拦截页面事件
    elBar.style.display = on ? 'flex' : 'none';
    elFab.style.display = on ? 'none' : 'block';
    document.body.style.cursor = on ? 'crosshair' : '';
    if (!on) { elHL.style.display = 'none'; elBadge.style.display = 'none'; elInfo.style.display = 'none'; }
  }
  setActive(true);   // 加载即激活

  elFab.addEventListener('click', () => setActive(true));
  // "✓ 选完了" → 通知 server 会话结束，弹出结束遮罩，引导用户回对话
  $('exit').addEventListener('click', () => {
    fetch('/__done', { method: 'POST' }).catch(() => {});
    $('done-n').textContent = recorded;
    $('done').style.display = 'flex';
    setActive(false);
  });
  $('done-resume').addEventListener('click', () => {
    $('done').style.display = 'none';
    setActive(true);
  });

  // ---------- 6. 鼠标移动 → 取栈 ----------
  host.addEventListener('mousemove', (e) => {
    if (!active || pinned) return;
    stack = stackAt(e.clientX, e.clientY);
    idx = 0;
    refresh();
  });
  host.addEventListener('mouseleave', () => { if (!pinned) { elHL.style.display = 'none'; elBadge.style.display = 'none'; elInfo.style.display = 'none'; } });

  // ---------- 7. 滚轮 / 键盘 → 切层 ----------
  // 滚轮：主动滚动页面，不抢给切层（否则标注不了下方元素）
  host.addEventListener('wheel', (e) => {
    if (!active) return;
    e.preventDefault();
    if (pinned) return;          // 批注时不动
    window.scrollBy(0, e.deltaY);
  }, { passive: false });

  function shiftLayer(delta) {
    if (!stack.length) return;
    idx = Math.max(0, Math.min(stack.length - 1, idx + delta));
    refresh();
  }

  // ---------- 8. 锁定 → 批注 ----------
  function pin() {
    const el = currentEl();
    if (!el) return;
    pinned = el;
    applyHighlight(el, true);

    const r = el.getBoundingClientRect();
    // 把批注卡片贴在元素右侧；放不下就放左侧
    let left = r.right + 10;
    if (left + 280 > window.innerWidth) left = Math.max(8, r.left - 290);
    let top = r.top;
    if (top + 220 > window.innerHeight) top = Math.max(8, window.innerHeight - 230);
    Object.assign(elCard.style, { display: 'block', left: left + 'px', top: top + 'px' });

    elSel.textContent = cssPath(el);
    elTxt.value = '';
    setTimeout(() => elTxt.focus(), 0);
  }

  function unpin() {
    pinned = null;
    elCard.style.display = 'none';
    refresh();
  }

  function submit() {
    if (!pinned) return;
    const el = pinned;
    const r = el.getBoundingClientRect();
    const note = elTxt.value.trim();
    const payload = {
      timestamp: Date.now(),
      url: location.pathname,
      selector: cssPath(el),
      xpath: xPath(el),
      tag: curTag,
      tagName: el.tagName.toLowerCase(),
      textPreview: (el.textContent || '').trim().slice(0, 80),
      htmlPreview: el.outerHTML.slice(0, 200).replace(/\s+/g, ' '),
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      viewport: { w: innerWidth, h: innerHeight },
      note,
    };
    fetch('/__annotate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(res => res.json())
      .then(d => {
        recorded = d.count ?? recorded + 1;
        elCnt.textContent = recorded;
        toast(`已记录 ${d.id}　(${payload.selector})`);
      })
      .catch(() => toast('提交失败，请重试'));
    unpin();
  }

  elOk.addEventListener('click', submit);
  elCancel.addEventListener('click', unpin);

  root.querySelectorAll('.tag').forEach(t => t.addEventListener('click', () => {
    root.querySelectorAll('.tag').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    curTag = t.dataset.tag;
  }));

  function toast(msg) {
    elToast.textContent = msg;
    elToast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => elToast.classList.remove('show'), 1600);
  }

  // ---------- 9. 全局键盘 ----------
  document.addEventListener('keydown', (e) => {
    // 批注框打开时的快捷键
    if (pinned) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.target === elTxt && !e.shiftKey)) {
        // 在 textarea 里直接 Enter 也提交（Shift+Enter 换行）
        if (e.target === elTxt) { e.preventDefault(); submit(); }
      } else if (e.key === 'Escape') { unpin(); }
      return;
    }
    if (!active) {
      if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // 防止在输入框里误触
        if (/input|textarea/i.test(document.activeElement?.tagName || '')) return;
        e.preventDefault(); setActive(true);
      }
      return;
    }
    switch (e.key) {
      case ']': case 'ArrowDown': e.preventDefault(); shiftLayer(1); break;
      case '[': case 'ArrowUp':   e.preventDefault(); shiftLayer(-1); break;
      case '1': case '2': case '3': case '4': case '5':
        e.preventDefault(); idx = Math.min(stack.length - 1, +e.key - 1); refresh(); break;
      case 'Enter': case ' ': e.preventDefault(); pin(); break;
      case 'Escape': e.preventDefault(); setActive(false); break;
    }
  }, true);   // capture，抢在页面脚本之前

  // 滚动/缩放时刷新高亮位置
  window.addEventListener('scroll', () => { if (active) refresh(); }, true);
  window.addEventListener('resize', () => { if (active) refresh(); });

  // 启动时拉一次已记录数
  fetch('/__annotate?count=1').then(r => r.json()).then(d => { recorded = d.count || 0; elCnt.textContent = recorded; }).catch(() => {});

  console.log('%c[PICKER] ready', 'color:#4f8cff', '移动鼠标 → [ ] 切层 → Enter 选中 → 批注确认');
})();
