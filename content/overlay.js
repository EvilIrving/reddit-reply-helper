/**
 * Floating UI in Shadow DOM — isolated from Reddit CSS.
 * globalThis.RRH_OVERLAY
 */
(function () {
  const HOST_ID = 'rrh-host';
  const RRH = (globalThis.RRH_OVERLAY = globalThis.RRH_OVERLAY || {});

  /** @type {any} */
  let currentItem = null;
  /** @type {number} */
  let pendingCount = 0;
  /** @type {(action: string, payload?: any) => void} */
  let onAction = () => {};

  const STYLES = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    * { box-sizing: border-box; }

    .hidden { display: none !important; }

    /* —— Overlay card —— */
    .panel {
      position: fixed;
      right: 16px;
      top: 64px;
      z-index: 2147483647;
      width: min(360px, calc(100vw - 24px));
      max-height: calc(100vh - 120px);
      overflow: auto;
      color: #e8eaed;
      font-size: 13px;
      line-height: 1.45;
      pointer-events: auto;
    }
    .card {
      background: #1a1a1b;
      border: 1px solid #3a3a3c;
      border-radius: 12px;
      padding: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,.5);
    }
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .pill {
      flex: 0 0 auto;
      background: #ff4500;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 999px;
      line-height: 1.2;
    }
    .sub {
      flex: 1 1 auto;
      min-width: 0;
      color: #9a9a9b;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .x {
      flex: 0 0 auto;
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #9a9a9b;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
    }
    .x:hover { background: #2a2a2b; color: #fff; }

    .block {
      background: #0f0f10;
      border: 1px solid #2e2e30;
      border-radius: 10px;
      padding: 10px;
      margin-bottom: 8px;
    }
    .title {
      margin: 0 0 6px;
      font-size: 14px;
      font-weight: 650;
      color: #f0f0f0;
      line-height: 1.35;
      word-break: break-word;
    }
    .body {
      margin: 0;
      font-size: 12px;
      color: #a0a0a2;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .meta {
      margin: 0 0 8px;
      font-size: 11px;
      color: #7c7c7e;
    }
    .tips {
      margin: 0 0 8px;
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(106,167,255,.08);
      border: 1px solid rgba(106,167,255,.22);
    }
    .tips ul {
      margin: 0;
      padding-left: 16px;
      color: #c4c4c6;
      font-size: 11px;
    }
    .tips li { margin: 2px 0; }
    .angle {
      margin: 0 0 8px;
      padding: 8px 10px;
      border-radius: 8px;
      background: #20261f;
      color: #d9ead6;
      font-size: 12px;
    }
    .angle strong { color: #9fd49a; }

    .label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #9a9a9b;
      margin: 4px 0 4px;
    }
    .link {
      border: 0;
      background: none;
      color: #6aa7ff;
      cursor: pointer;
      font-size: 11px;
      padding: 0;
      font-family: inherit;
    }
    .ta {
      display: block;
      width: 100%;
      min-height: 64px;
      margin: 0 0 10px;
      padding: 8px;
      border: 1px solid #2e2e30;
      border-radius: 8px;
      background: #0f0f10;
      color: #e8eaed;
      font: 12px/1.4 inherit;
      resize: vertical;
    }
    .ta:focus {
      outline: none;
      border-color: #ff4500;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px;
      margin-bottom: 6px;
    }
    .row2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 34px;
      padding: 0 8px;
      border: 1px solid #3a3a3c;
      border-radius: 8px;
      background: #272729;
      color: #e8eaed;
      font: 600 12px/1 inherit;
      text-decoration: none;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn:hover { filter: brightness(1.08); }
    .btn.primary {
      background: #ff4500;
      border-color: #ff4500;
      color: #fff;
    }
    .btn.danger {
      background: transparent;
      border-color: #8a4040;
      color: #f09090;
    }
    .btn.stash {
      background: #1e2a3a;
      border-color: #3d6a9e;
      color: #8ec0ff;
    }

    /* —— Dock —— */
    .dock {
      position: fixed;
      right: 16px;
      bottom: 62px;
      z-index: 2147483646;
      display: flex;
      gap: 6px;
      opacity: 0.5;
      pointer-events: auto;
    }
    .dock.has { opacity: 1; }
    .dock-btn {
      height: 34px;
      padding: 0 12px;
      border: 1px solid #3a3a3c;
      border-radius: 999px;
      background: #1a1a1b;
      color: #d7dadc;
      font: 600 12px/1 inherit;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,.3);
    }
    .dock.has .dock-main {
      background: #ff4500;
      border-color: #ff4500;
      color: #fff;
    }

    /* —— Cruise bar —— */
    .cruise {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    }
    .cruise > * { pointer-events: auto; }
    .cruise-btn {
      height: 36px;
      padding: 0 14px;
      border: 0;
      border-radius: 999px;
      background: #ff4500;
      color: #fff;
      font: 600 12px/1 inherit;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.28);
    }
    .cruise-btn.ghost {
      background: #1a1a1b;
      border: 1px solid #3a3a3c;
      color: #e8eaed;
    }
    .cruise-btn.active {
      background: #1a1a1b;
      border: 1px solid #ff4500;
      color: #fff;
    }
    .chip {
      max-width: 140px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(0,0,0,.78);
      color: #eee;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .chip:empty { display: none; }

    /* —— Toast —— */
    .toast {
      position: fixed;
      left: 50%;
      bottom: 90px;
      transform: translateX(-50%) translateY(10px);
      z-index: 2147483647;
      max-width: min(360px, 90vw);
      padding: 10px 14px;
      border-radius: 10px;
      background: rgba(26,26,27,.96);
      border: 1px solid #3a3a3c;
      color: #e8eaed;
      font-size: 12px;
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s ease, transform .18s ease;
      box-shadow: 0 8px 24px rgba(0,0,0,.35);
    }
    .toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  `;

  RRH.setActionHandler = function (fn) {
    onAction = fn || (() => {});
  };

  RRH.isOpen = function () {
    const panel = ui()?.panel;
    return !!(panel && !panel.classList.contains('hidden'));
  };

  RRH.getCurrentId = function () {
    return currentItem?.id || null;
  };

  RRH.hide = function () {
    ui()?.panel?.classList.add('hidden');
    currentItem = null;
  };

  /**
   * @param {number} n
   */
  RRH.setPendingCount = function (n) {
    pendingCount = Math.max(0, Number(n) || 0);
    const u = ui();
    if (!u) return;
    if (u.pendingN) u.pendingN.textContent = String(pendingCount);
    u.dock?.classList.toggle('has', pendingCount > 0);
  };

  /**
   * @param {any} item
   * @param {number} [pending]
   */
  RRH.notifyQueued = function (item, pending) {
    if (typeof pending === 'number') RRH.setPendingCount(pending);
    else RRH.setPendingCount(pendingCount + 1);
    const title = item?.titleZh || item?.post?.title || '新推荐';
    showToast(`待办 ${pendingCount} · ${clip(title, 28)}`);
  };

  /**
   * @param {any} item
   * @param {{ pending?: number }} [hint]
   */
  RRH.show = function (item, hint = {}) {
    if (!item?.post) return;
    currentItem = item;
    if (typeof hint.pending === 'number') RRH.setPendingCount(hint.pending);

    const u = ui();
    if (!u?.panel) return;

    const post = item.post;
    const draft = item.draft || (item.drafts && item.drafts[0]) || '';
    const titleZh = item.titleZh || post.title || '';
    const bodyZh = item.bodyZh || clip(post.body || '', 160) || '（无正文或图帖）';
    const tips = (item.tips || post.reasons || []).slice(0, 4);
    const tipsHtml = tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
    const freshAngle = item.freshAngle || '';
    const reviewed = Number(item.commentsReviewed) || 0;
    const url = post.url || '#';

    u.panel.classList.remove('hidden');
    u.panel.innerHTML = `
      <div class="card">
        <div class="head">
          <span class="pill">${escapeHtml(String(post.recommendScore ?? '—'))}分</span>
          <span class="sub">r/${escapeHtml(post.subreddit || '?')}</span>
          <button type="button" class="x" data-act="stash" aria-label="先收着">×</button>
        </div>
        <div class="block">
          <h3 class="title">${escapeHtml(titleZh)}</h3>
          <p class="body">${escapeHtml(bodyZh)}</p>
        </div>
        <p class="meta">${escapeHtml(metaLine(post))}</p>
        ${freshAngle ? `<p class="angle"><strong>新角度：</strong>${escapeHtml(freshAngle)}${reviewed ? `<br><span>已参考 ${reviewed} 条现有评论避重</span>` : ''}</p>` : ''}
        ${tipsHtml ? `<div class="tips"><ul>${tipsHtml}</ul></div>` : ''}
        <div class="label">
          <span>草稿</span>
          <button type="button" class="link" data-act="copy">复制</button>
        </div>
        <textarea class="ta" data-draft rows="3">${escapeHtml(draft)}</textarea>
        <div class="row">
          <button type="button" class="btn primary" data-act="locate">定位</button>
          <a class="btn" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" data-act="open">打开</a>
          <button type="button" class="btn" data-act="copy">复制</button>
        </div>
        <div class="row2">
          <button type="button" class="btn danger" data-act="skip">跳过</button>
          <button type="button" class="btn stash" data-act="stash">先收着</button>
        </div>
      </div>
    `;

    u.panel.querySelectorAll('[data-act]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const act = el.getAttribute('data-act');
        if (act === 'open') {
          // let default open in new tab; still mark nothing
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        handleAct(act);
      });
    });
  };

  /** Cruise bar API used by content.js */
  RRH.mountChrome = function () {
    ui();
  };

  RRH.setCruiseUi = function ({ cruiseOn, cruisePaused, status }) {
    const u = ui();
    if (!u?.cruiseToggle) return;
    if (!cruiseOn) {
      u.cruiseToggle.textContent = '开始巡航';
      u.cruiseToggle.classList.remove('active');
    } else if (cruisePaused) {
      u.cruiseToggle.textContent = '停止巡航';
      u.cruiseToggle.classList.add('active');
    } else {
      u.cruiseToggle.textContent = '停止巡航';
      u.cruiseToggle.classList.add('active');
    }
    if (u.chip) u.chip.textContent = status || '';
  };

  RRH.onCruiseToggle = null;
  RRH.onScanNow = null;
  RRH.notify = showToast;

  function handleAct(act) {
    if (!currentItem && act !== 'side' && act !== 'next' && act !== 'dock-side') return;
    const ta = ui()?.panel?.querySelector('[data-draft]');
    const draft = /** @type {HTMLTextAreaElement|null} */ (ta)?.value || '';

    if (act === 'copy') {
      copyText(draft);
      onAction('copied', { id: currentItem.id, draft, keepOpen: true });
      showToast('已复制');
      return;
    }
    if (act === 'locate') {
      onAction('locate', { id: currentItem.id });
      return;
    }
    if (act === 'skip') {
      const id = currentItem.id;
      onAction('skipped', { id, resumeCruise: true, continueAnalyze: true });
      RRH.hide();
      showToast('已跳过');
      onAction('request-next', {});
      return;
    }
    if (act === 'stash' || act === 'later' || act === 'dismiss') {
      const id = currentItem.id;
      onAction('later', { id, resumeCruise: true, continueAnalyze: true });
      RRH.hide();
      showToast('已收着');
      return;
    }
    if (act === 'side' || act === 'dock-side') {
      onAction('side', { id: currentItem?.id });
      return;
    }
    if (act === 'next') {
      onAction('request-next', {});
    }
  }

  /**
   * @returns {{
   *  shadow: ShadowRoot,
   *  panel: HTMLElement,
   *  dock: HTMLElement,
   *  pendingN: HTMLElement,
   *  cruiseToggle: HTMLElement,
   *  scanBtn: HTMLElement,
   *  chip: HTMLElement,
   *  toast: HTMLElement
   * } | null}
   */
  function ui() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      // host itself should not inherit reddit layout
      // zero-size host; children use position:fixed so they still cover viewport
      // (avoid pointer-events:none on host — it blocks all shadow clicks in Chrome)
      host.style.cssText =
        'all:initial;position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;';
      document.documentElement.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>${STYLES}</style>
        <div class="panel hidden" id="panel"></div>
        <div class="dock" id="dock">
          <button type="button" class="dock-btn dock-main" data-act="next">待办 <span id="pendingN">0</span></button>
          <button type="button" class="dock-btn" data-act="dock-side">列表</button>
        </div>
        <div class="cruise" id="cruise">
          <button type="button" class="cruise-btn" id="cruiseToggle">开始巡航</button>
          <button type="button" class="cruise-btn ghost" id="scanBtn">立即分析</button>
          <span class="chip" id="chip"></span>
        </div>
        <div class="toast" id="toast"></div>
      `;

      shadow.getElementById('dock')?.addEventListener('click', (e) => {
        const t = /** @type {HTMLElement} */ (e.target).closest('[data-act]');
        if (!t) return;
        e.preventDefault();
        handleAct(t.getAttribute('data-act'));
      });
      shadow.getElementById('cruiseToggle')?.addEventListener('click', () => {
        if (typeof RRH.onCruiseToggle === 'function') RRH.onCruiseToggle();
      });
      shadow.getElementById('scanBtn')?.addEventListener('click', () => {
        if (typeof RRH.onScanNow === 'function') RRH.onScanNow();
      });
    }

    const shadow = host.shadowRoot;
    if (!shadow) return null;
    return {
      shadow,
      panel: /** @type {HTMLElement} */ (shadow.getElementById('panel')),
      dock: /** @type {HTMLElement} */ (shadow.getElementById('dock')),
      pendingN: /** @type {HTMLElement} */ (shadow.getElementById('pendingN')),
      cruiseToggle: /** @type {HTMLElement} */ (shadow.getElementById('cruiseToggle')),
      scanBtn: /** @type {HTMLElement} */ (shadow.getElementById('scanBtn')),
      chip: /** @type {HTMLElement} */ (shadow.getElementById('chip')),
      toast: /** @type {HTMLElement} */ (shadow.getElementById('toast')),
    };
  }

  function showToast(msg) {
    const t = ui()?.toast;
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function metaLine(p) {
    const bits = [];
    if (p.score != null) bits.push(`↑${p.score}`);
    if (p.comments != null) bits.push(`💬${p.comments}`);
    return bits.join(' · ');
  }

  function clip(s, n) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text || '');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text || '';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  // boot chrome early
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ui());
  } else {
    ui();
  }
})();
