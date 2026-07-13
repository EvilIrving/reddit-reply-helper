/**
 * Content orchestrator: follow-scroll, cruise, non-blocking inbox.
 * Overlay never blocks further analysis — stash/skip and keep browsing.
 */
(function () {
  const S = () => globalThis.RRH_SCRAPE;
  const O = () => globalThis.RRH_OVERLAY;

  /** @type {Set<string>} */
  const seenIds = new Set();
  const detailAssistedIds = new Set();
  /** @type {boolean} */
  let followEnabled = true;
  /** @type {boolean} */
  let analyzing = false;
  /** @type {boolean} */
  let cruiseOn = false;
  /** @type {boolean} */
  let cruisePaused = false;
  /** @type {number} */
  let cruiseTimer = 0;
  /** @type {'slow'|'normal'|'fast'} */
  let cruiseSpeed = 'normal';
  /** @type {number} */
  let scrollTimer = 0;
  /** @type {number} */
  let pendingCount = 0;

  // Shadow-DOM chrome (overlay / dock / cruise) — isolated from Reddit CSS
  O()?.mountChrome?.();
  if (O()) {
    O().onCruiseToggle = () => {
      if (cruiseOn) stopCruise();
      else startCruise();
    };
    O().onScanNow = () => runAnalyze(true);
  }

  chrome.runtime.sendMessage({ type: 'RRH_GET_SETTINGS' }, (res) => {
    if (res?.ok && res.settings) applySettings(res.settings);
  });
  // any page you open counts as browsed (no sub whitelist)
  reportCurrentSub();
  // sync pending count
  refreshPendingFromSw();

  O()?.setActionHandler?.((action, payload) => {
    if (action === 'fill') {
      fillReplyComposer(payload);
      return;
    }
    if (action === 'locate') {
      S()?.highlightPost?.(payload.id);
      return;
    }
    if (action === 'side') {
      chrome.runtime.sendMessage({ type: 'RRH_OPEN_SIDE_PANEL' });
      return;
    }
    if (action === 'request-next') {
      openNextFromQueue();
      return;
    }
    if (action === 'copied' || action === 'skipped' || action === 'later') {
      const status = action === 'copied' ? 'copied' : action;
      // copy can keep overlay open
      const keepOpen = !!payload.keepOpen && action === 'copied';
      chrome.runtime.sendMessage(
        {
          type: 'RRH_RESOLVE',
          id: payload.id,
          status,
          resumeCruise: !!payload.resumeCruise,
        },
        (r) => {
          if (r?.pending != null) {
            pendingCount = r.pending;
            O()?.setPendingCount?.(pendingCount);
          } else {
            refreshPendingFromSw();
          }
        }
      );
      if (!keepOpen) {
        // skip/later already hide in overlay; ensure continue
        if (cruiseOn && payload.resumeCruise) {
          cruisePaused = false;
          scheduleCruiseTick();
        }
      }
      updateCruiseBar();
      // keep analyzing — never block
      setTimeout(() => runAnalyze(false), 400);
    }
  });

  function fillReplyComposer(payload) {
    const draft = String(payload?.draft || '').trim();
    if (!draft) {
      O()?.notify?.('草稿为空');
      return;
    }
    if (globalThis.RRH_COMPOSER?.fill?.(draft)) {
      O()?.hide?.();
      O()?.notify?.('草稿已填入，请检查后手动发送');
      return;
    }
    globalThis.RRH_COMPOSER?.queue?.(payload);
    const target = String(payload?.url || '');
    if (target && target !== location.href) {
      location.assign(target);
    } else {
      O()?.hide?.();
      O()?.notify?.('点击评论框后会自动填入草稿');
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg?.type) return;

    if (msg.type === 'RRH_PING') {
      sendResponse({
        ok: true,
        meta: S()?.getPageMeta?.(),
        cruiseOn,
        followEnabled,
        overlayOpen: !!O()?.isOpen?.(),
        pendingCount,
      });
      return true;
    }

    if (msg.type === 'RRH_SCRAPE') {
      try {
        sendResponse({ ok: true, posts: S()?.scrapePosts?.() || [], meta: S()?.getPageMeta?.() });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return true;
    }

    if (msg.type === 'RRH_HIGHLIGHT') {
      sendResponse({ ok: !!S()?.highlightPost?.(msg.postId) });
      return true;
    }

    if (msg.type === 'RRH_MARK_RECOMMENDED') {
      markRecommended(msg.ids || []);
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'RRH_SHOW_OVERLAY') {
      handleRecommendation(msg.item, msg.settingsHint, msg.pending);
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'RRH_PENDING_UPDATE') {
      if (typeof msg.pending === 'number') {
        pendingCount = msg.pending;
        O()?.setPendingCount?.(pendingCount);
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'RRH_OVERLAY_RESOLVED') {
      if (msg.resumeCruise && cruiseOn) {
        cruisePaused = false;
        scheduleCruiseTick();
      }
      if (typeof msg.pending === 'number') {
        pendingCount = msg.pending;
        O()?.setPendingCount?.(pendingCount);
      }
      updateCruiseBar();
      runAnalyze(false);
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'RRH_SETTINGS_UPDATED') {
      applySettings(msg.settings || {});
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'RRH_START_CRUISE') {
      startCruise();
      sendResponse({ ok: true, cruiseOn: true });
      return true;
    }

    if (msg.type === 'RRH_STOP_CRUISE') {
      stopCruise();
      sendResponse({ ok: true, cruiseOn: false });
      return true;
    }

    if (msg.type === 'RRH_FORCE_SCAN') {
      runAnalyze(true).then(() => sendResponse({ ok: true }));
      return true;
    }

    if (msg.type === 'RRH_OPEN_NEXT') {
      openNextFromQueue().then(() => sendResponse({ ok: true }));
      return true;
    }

    if (msg.type === 'RRH_FILL_REPLY') {
      fillReplyComposer(msg);
      sendResponse({ ok: true });
      return true;
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      if (!followEnabled) return;
      clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => runAnalyze(false), 600);
    },
    { passive: true }
  );

  setTimeout(() => {
    reportCurrentSub();
    if (followEnabled) runAnalyze(false);
  }, 1500);
  setTimeout(() => {
    if (followEnabled) runAnalyze(false);
  }, 3500);

  // SPA navigation on new Reddit
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      seenIds.clear();
      detailAssistedIds.clear();
      reportCurrentSub();
      if (followEnabled) {
        setTimeout(() => runAnalyze(false), 800);
      }
    }
  }, 1200);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(cruiseTimer);
    } else if (cruiseOn && !cruisePaused) {
      scheduleCruiseTick();
    }
  });

  /**
   * New recommendation: if card already open → only inbox toast;
   * else show full card. Never stop scrolling/analysis.
   * @param {any} item
   * @param {any} hint
   * @param {number} [pending]
   */
  function handleRecommendation(item, hint, pending) {
    if (!item) return;
    if (typeof pending === 'number') {
      pendingCount = pending;
      O()?.setPendingCount?.(pendingCount);
    } else {
      refreshPendingFromSw();
    }

    if (item.id) {
      markRecommended([item.id]);
    }

    // Already looking at a card → don't interrupt; stash into inbox only
    if (O()?.isOpen?.() && O()?.getCurrentId?.() && O().getCurrentId() !== item.id) {
      O()?.notifyQueued?.(item, pendingCount);
      return;
    }

    // Same id re-show or no card open → show
    O()?.show?.(item, { ...(hint || {}), pending: pendingCount });
    // Soft highlight once; user may continue scrolling
    if (item.id) S()?.highlightPost?.(item.id);

    // Cruise keeps going — user can stash anytime
    updateCruiseBar();
  }

  /**
   * @param {boolean} force
   */
  async function runAnalyze(force) {
    if (analyzing) return;
    // NOTE: deliberately do NOT block when overlay is open

    const posts = S()?.scrapePosts?.() || [];
    if (!posts.length) return;
    const detailPost = posts.find((post) => post.existingComments?.length);
    const forceId = detailPost && (force || !detailAssistedIds.has(detailPost.id))
      ? detailPost.id
      : undefined;

    const batch = [];
    for (const p of posts) {
      if (!p.id) continue;
      if (!force && seenIds.has(p.id) && p.id !== forceId) continue;
      seenIds.add(p.id);
      batch.push(p);
    }
    if (!batch.length && !force) return;

    analyzing = true;
    setStatusChip(cruiseOn ? '巡航分析中…' : '分析中…');
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'RRH_ANALYZE_POSTS',
        posts: force ? posts : batch,
        forceId,
        // tell SW whether a card is open (for pending count only; SW still queues all)
        overlayOpen: !!O()?.isOpen?.(),
      });
      if (typeof res?.pending === 'number') {
        pendingCount = res.pending;
        O()?.setPendingCount?.(pendingCount);
      }
      if (res?.ok && forceId) detailAssistedIds.add(forceId);
    } catch (e) {
      console.warn('[RRH] analyze failed', e);
    } finally {
      analyzing = false;
      setStatusChip(
        cruiseOn
          ? cruisePaused
            ? '巡航已暂停'
            : pendingCount
              ? `巡航中 · 待办 ${pendingCount}`
              : '巡航中'
          : pendingCount
            ? `待办 ${pendingCount}`
            : ''
      );
    }
  }

  async function openNextFromQueue() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'RRH_GET_NEXT_PENDING' });
      if (res?.ok && res.item) {
        O()?.show?.(res.item, {
          language: res.item.language,
          showEnSubHint: true,
          pending: res.pending ?? pendingCount,
        });
        if (res.item.id) {
          S()?.highlightPost?.(res.item.id);
          markRecommended([res.item.id]);
        }
        if (typeof res.pending === 'number') {
          pendingCount = res.pending;
          O()?.setPendingCount?.(pendingCount);
        }
      } else {
        setStatusChip(res?.message || '待办空了');
        setTimeout(() => setStatusChip(cruiseOn ? '巡航中' : ''), 2000);
      }
    } catch (e) {
      console.warn('[RRH] next failed', e);
    }
  }

  function refreshPendingFromSw() {
    chrome.runtime.sendMessage({ type: 'RRH_GET_QUEUE' }, (res) => {
      if (!res?.ok) return;
      const q = res.queue || [];
      pendingCount = q.filter((x) => x.status === 'new' || x.status === 'later').length;
      O()?.setPendingCount?.(pendingCount);
    });
  }

  function applySettings(s) {
    followEnabled = s.followEnabled !== false;
    cruiseSpeed = s.cruiseSpeed || 'normal';
    updateCruiseBar();
  }

  function startCruise() {
    cruiseOn = true;
    cruisePaused = false;
    updateCruiseBar();
    chrome.runtime.sendMessage({ type: 'RRH_CRUISE_STATE', cruiseOn: true });
    runAnalyze(false);
    scheduleCruiseTick();
  }

  function stopCruise() {
    cruiseOn = false;
    cruisePaused = false;
    clearTimeout(cruiseTimer);
    updateCruiseBar();
    chrome.runtime.sendMessage({ type: 'RRH_CRUISE_STATE', cruiseOn: false });
    setStatusChip(pendingCount ? `待办 ${pendingCount}` : '');
  }

  function scheduleCruiseTick() {
    clearTimeout(cruiseTimer);
    // Cruise continues even if overlay open — user can stash/skip at leisure
    if (!cruiseOn || cruisePaused || document.hidden) return;
    const delay = cruiseDelay();
    cruiseTimer = window.setTimeout(async () => {
      if (!cruiseOn || cruisePaused) return;
      const step = cruiseStep();
      window.scrollBy({ top: step, behavior: 'smooth' });
      await sleep(400);
      await runAnalyze(false);
      if (nearBottom()) setStatusChip('已接近底部');
      if (cruiseOn && !cruisePaused) scheduleCruiseTick();
    }, delay);
  }

  function cruiseDelay() {
    if (cruiseSpeed === 'slow') return 2200 + Math.random() * 1200;
    if (cruiseSpeed === 'fast') return 900 + Math.random() * 500;
    return 1400 + Math.random() * 900;
  }

  function cruiseStep() {
    if (cruiseSpeed === 'slow') return 350 + Math.random() * 200;
    if (cruiseSpeed === 'fast') return 700 + Math.random() * 300;
    return 500 + Math.random() * 250;
  }

  function nearBottom() {
    return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;
  }

  function updateCruiseBar() {
    O()?.setCruiseUi?.({
      cruiseOn,
      cruisePaused,
      status: cruiseOn ? (cruisePaused ? '暂停' : pendingCount ? `待办 ${pendingCount}` : '巡航中') : '',
    });
  }

  function setStatusChip(text) {
    O()?.setCruiseUi?.({
      cruiseOn,
      cruisePaused,
      status: text || (cruiseOn ? '巡航中' : pendingCount ? `待办 ${pendingCount}` : ''),
    });
  }

  /**
   * @param {string[]} ids
   */
  function markRecommended(ids) {
    ids.forEach((id) => {
      const el = S()?.findElementByPostId?.(id);
      if (!el) return;
      el.classList.add('rrh-recommended');
      if (!el.querySelector('.rrh-badge')) {
        const badge = document.createElement('div');
        badge.className = 'rrh-badge';
        badge.textContent = '待办';
        el.appendChild(badge);
      }
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function reportCurrentSub() {
    const m = location.pathname.match(/\/r\/([^/]+)/i);
    if (!m) return;
    const sub = m[1];
    if (/^(all|popular)$/i.test(sub)) return;
    chrome.runtime.sendMessage({ type: 'RRH_RECORD_VISITED', subs: [sub] }).catch(() => {});
  }
})();
