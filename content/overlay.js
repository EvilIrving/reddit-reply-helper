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
  /** @type {string} */
  let cruiseStatus = '';
  /** @type {(action: string, payload?: any) => void} */
  let onAction = () => {};

  const STYLES = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    * { box-sizing: border-box; }

    .hidden { display: none !important; }

    /* —— Recommendation panel —— */
    .panel {
      position: fixed;
      right: 16px;
      top: 64px;
      z-index: 2147483647;
      width: min(348px, calc(100vw - 24px));
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
      padding: 14px;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
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
    .x:focus-visible,
    .btn:focus-visible,
    .assistant-btn:focus-visible {
      outline: 2px solid #ff8a5c;
      outline-offset: 2px;
    }
    .title {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 650;
      color: #f0f0f0;
      line-height: 1.4;
      word-break: break-word;
      text-wrap: pretty;
    }
    .body {
      margin: -4px 0 12px;
      color: #a8a8aa;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .angle {
      margin: 0 0 12px;
      padding: 10px 0;
      border-top: 1px solid #303033;
      border-bottom: 1px solid #303033;
      color: #d7dadc;
      font-size: 12px;
    }
    .angle strong { color: #b6d7b2; }
    .angle small {
      display: block;
      margin-top: 4px;
      color: #9a9a9b;
      font-size: 11px;
    }
    .tips {
      margin: -4px 0 12px;
      color: #b8b8ba;
      font-size: 11px;
    }

    .label {
      display: flex;
      align-items: center;
      font-size: 11px;
      color: #9a9a9b;
      margin: 0 0 5px;
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
      outline: 2px solid rgba(255,69,0,.3);
      outline-offset: 1px;
      border-color: #ff4500;
    }
    .actions {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 6px;
      align-items: center;
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
    .btn:active { transform: translateY(1px); }

    /* —— Single persistent assistant entry —— */
    .dock {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483646;
      pointer-events: auto;
    }
    .assistant-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 36px;
      padding: 0 11px;
      border: 1px solid #3a3a3c;
      border-radius: 999px;
      background: #1a1a1b;
      color: #d7dadc;
      font: 600 12px/1 inherit;
      cursor: pointer;
      box-shadow: 0 3px 8px rgba(0,0,0,.28);
    }
    .assistant-btn:hover { background: #242426; color: #fff; }
    .assistant-btn:active { transform: translateY(1px); }
    .pending-count {
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: #ff4500;
      color: #fff;
      font-size: 10px;
      line-height: 18px;
      text-align: center;
    }
    .pending-count[hidden] { display: none; }

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
    @media (prefers-reduced-motion: reduce) {
      .toast { transition: none; }
      .btn:active,
      .assistant-btn:active { transform: none; }
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
    u.pendingN?.toggleAttribute('hidden', pendingCount === 0);
    updateAssistantLabel(u);
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
    const bodyZh = item.bodyZh || '';
    const freshAngle = item.freshAngle || '';
    const tips = (item.tips || [])
      .filter((tip) => !/配置\s*DeepSeek|未配置\s*API\s*Key/i.test(String(tip || '')))
      .slice(0, 2);
    const reviewed = Number(item.commentsReviewed) || 0;
    const url = discussionUrl(post);

    u.panel.classList.remove('hidden');
    u.panel.innerHTML = `
      <div class="card">
        <div class="head">
          <span class="pill">${escapeHtml(String(post.recommendScore ?? '—'))}分</span>
          <span class="sub">r/${escapeHtml(post.subreddit || '?')}</span>
          <button type="button" class="x" data-act="close" aria-label="关闭推荐">×</button>
        </div>
        <h3 class="title">${escapeHtml(titleZh)}</h3>
        ${bodyZh ? `<p class="body">${escapeHtml(bodyZh)}</p>` : ''}
        ${freshAngle ? `<p class="angle"><strong>新角度：</strong>${escapeHtml(freshAngle)}${reviewed ? `<small>参考 ${reviewed} 条当前可见评论</small>` : ''}</p>` : ''}
        ${tips.length ? `<p class="tips">${escapeHtml(tips.join(' · '))}</p>` : ''}
        <label class="label" for="rrh-draft">回复草稿</label>
        <textarea class="ta" id="rrh-draft" data-draft rows="4">${escapeHtml(draft)}</textarea>
        <div class="actions">
          <button type="button" class="btn" data-act="fill">写回复</button>
          <button type="button" class="btn" data-act="stash">先收着</button>
          <button type="button" class="btn" data-act="locate">定位</button>
          <a class="btn" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" data-act="open">打开</a>
          <button type="button" class="btn" data-act="skip">跳过</button>
        </div>
      </div>
    `;

    u.panel.querySelectorAll('[data-act]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const act = el.getAttribute('data-act');
        if (act === 'open') {
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
    cruiseStatus = cruiseOn ? status || (cruisePaused ? '巡航暂停' : '巡航中') : '';
    if (u) updateAssistantLabel(u);
  };

  RRH.onCruiseToggle = null;
  RRH.onScanNow = null;
  RRH.notify = showToast;

  function handleAct(act) {
    if (!currentItem && !['side', 'next', 'dock-side', 'assistant'].includes(act)) return;
    const ta = ui()?.panel?.querySelector('[data-draft]');
    const draft = /** @type {HTMLTextAreaElement|null} */ (ta)?.value || '';

    if (act === 'close') {
      RRH.hide();
      return;
    }
    if (act === 'fill') {
      onAction('fill', {
        id: currentItem.id,
        draft,
        url: discussionUrl(currentItem.post),
      });
      return;
    }
    if (act === 'locate') {
      onAction('locate', { id: currentItem.id });
      return;
    }
    if (act === 'skip') {
      const id = currentItem.id;
      onAction('skipped', {
        id,
        resumeCruise: true,
        continueAnalyze: true,
        requestNext: true,
      });
      RRH.hide();
      showToast('已跳过');
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
    if (act === 'assistant') {
      if (RRH.isOpen()) {
        RRH.hide();
      } else if (pendingCount > 0) {
        onAction('request-next', {});
      } else {
        onAction('side', {});
      }
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
   *  assistant: HTMLElement,
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
          <button type="button" class="assistant-btn" id="assistant" data-act="assistant" aria-label="Reddit 助手">
            <span>助手</span>
            <span class="pending-count" id="pendingN" hidden>0</span>
          </button>
        </div>
        <div class="toast" id="toast"></div>
      `;

      shadow.getElementById('dock')?.addEventListener('click', (e) => {
        const t = /** @type {HTMLElement} */ (e.target).closest('[data-act]');
        if (!t) return;
        e.preventDefault();
        handleAct(t.getAttribute('data-act'));
      });
    }

    const shadow = host.shadowRoot;
    if (!shadow) return null;
    return {
      shadow,
      panel: /** @type {HTMLElement} */ (shadow.getElementById('panel')),
      dock: /** @type {HTMLElement} */ (shadow.getElementById('dock')),
      pendingN: /** @type {HTMLElement} */ (shadow.getElementById('pendingN')),
      assistant: /** @type {HTMLElement} */ (shadow.getElementById('assistant')),
      toast: /** @type {HTMLElement} */ (shadow.getElementById('toast')),
    };
  }

  function updateAssistantLabel(u) {
    const pending = pendingCount > 0 ? `，${pendingCount} 条待办` : '，暂无待办';
    const status = cruiseStatus ? `，${cruiseStatus}` : '';
    const label = `Reddit 助手${pending}${status}`;
    u.assistant?.setAttribute('aria-label', label);
    u.assistant?.setAttribute('title', label);
  }

  function showToast(msg) {
    const t = ui()?.toast;
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function clip(s, n) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  function discussionUrl(post) {
    const url = String(post?.url || '');
    if (/\/comments\/[a-z0-9]+(?:\/|$)/i.test(url)) return url;
    const id = String(post?.id || '').replace(/^t3_/, '');
    const subreddit = String(post?.subreddit || '').replace(/^r\//, '');
    if (/^[a-z0-9]+$/i.test(id) && subreddit) {
      return `${location.origin}/r/${encodeURIComponent(subreddit)}/comments/${encodeURIComponent(id)}/`;
    }
    return url || '#';
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

  // boot chrome early
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ui());
  } else {
    ui();
  }
})();
