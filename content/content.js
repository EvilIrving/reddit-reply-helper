/**
 * Scroll-follow live discovery + optional cruise.
 * Overlay stays non-blocking — keep browsing while recommendations queue.
 */
(function () {
  const S = () => globalThis.RRH_SCRAPE;
  const O = () => globalThis.RRH_OVERLAY;

  const seenIds = new Set();
  let followEnabled = true;
  let analyzing = false;
  let cruiseOn = false;
  let cruisePaused = false;
  let cruiseTimer = 0;
  let cruiseSpeed = 'normal';
  let scrollTimer = 0;
  let pendingCount = 0;

  O()?.mountChrome?.();
  if (O()) {
    O().onCruiseToggle = () => (cruiseOn ? stopCruise() : startCruise());
    O().onScanNow = () => runAnalyze(true);
  }

  chrome.runtime.sendMessage({ type: 'RRH_V1_GET_STATE' }, (res) => {
    if (res?.ok && res.state) applySettings(res.state.settings || {});
  });
  refreshPending();

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
      chrome.runtime.sendMessage({ type: 'RRH_RESOLVE_LIVE', id: payload.id, status }, (r) => {
        if (r?.pending != null) {
          pendingCount = r.pending;
          O()?.setPendingCount?.(pendingCount);
        } else refreshPending();
        if (r?.ok && payload.requestNext) openNextFromQueue();
      });
      if (cruiseOn && payload.resumeCruise) {
        cruisePaused = false;
        scheduleCruiseTick();
      }
      updateCruiseBar();
      setTimeout(() => runAnalyze(false), 400);
    }
  });

  function fillReplyComposer(payload) {
    const draft = String(payload?.draft || '').trim();
    if (!draft) {
      O()?.notify?.('先到侧栏生成草稿，或点助手打开面板');
      chrome.runtime.sendMessage({ type: 'RRH_OPEN_SIDE_PANEL' });
      return;
    }
    if (globalThis.RRH_COMPOSER?.fill?.(draft)) {
      O()?.hide?.();
      O()?.notify?.('草稿已填入，请检查后手动发送');
      return;
    }
    globalThis.RRH_COMPOSER?.queue?.(payload);
    const target = String(payload?.url || '');
    if (target && target !== location.href) location.assign(target);
    else {
      O()?.hide?.();
      O()?.notify?.('点击评论框后会自动填入草稿');
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg?.type) return;
    if (msg.type === 'RRH_PING') {
      sendResponse({ ok: true, meta: S()?.getPageMeta?.(), cruiseOn, followEnabled, overlayOpen: !!O()?.isOpen?.(), pendingCount });
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
    if (msg.type === 'RRH_SHOW_OVERLAY') {
      handleRecommendation(msg.item, msg.pending);
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
  });

  window.addEventListener('scroll', () => {
    if (!followEnabled) return;
    clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => runAnalyze(false), 600);
  }, { passive: true });

  setTimeout(() => { if (followEnabled) runAnalyze(false); }, 1200);
  setTimeout(() => { if (followEnabled) runAnalyze(false); }, 3200);

  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      seenIds.clear();
      if (followEnabled) setTimeout(() => runAnalyze(false), 800);
    }
  }, 1200);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(cruiseTimer);
    else if (cruiseOn && !cruisePaused) scheduleCruiseTick();
  });

  function handleRecommendation(item, pending) {
    if (!item) return;
    if (typeof pending === 'number') {
      pendingCount = pending;
      O()?.setPendingCount?.(pendingCount);
    }
    if (item.post?.id) markRecommended([item.post.id]);
    if (O()?.isOpen?.()) {
      O()?.notifyQueued?.(item, pendingCount);
      return;
    }
    O()?.show?.(item, { pending: pendingCount });
    S()?.highlightPost?.(item.post?.id);
  }

  async function runAnalyze(force) {
    if (analyzing) return;
    if (!followEnabled && !force) return;
    analyzing = true;
    setStatusChip(cruiseOn ? '巡航分析中…' : '实时监控中…');
    try {
      const posts = S()?.scrapePosts?.() || [];
      const fresh = [];
      for (const post of posts) {
        const id = String(post.id || '').replace(/^t3_/, '');
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        fresh.push({ ...post, id });
      }
      if (!fresh.length && !force) return;
      const res = await chrome.runtime.sendMessage({
        type: 'RRH_ANALYZE_POSTS',
        posts: (force ? posts : fresh).map((post) => ({ ...post, id: String(post.id || '').replace(/^t3_/, '') })),
        force: !!force,
        overlayOpen: !!O()?.isOpen?.(),
      });
      if (typeof res?.pending === 'number') {
        pendingCount = res.pending;
        O()?.setPendingCount?.(pendingCount);
      }
      if (res?.recommendation) handleRecommendation(res.recommendation, res.pending);
    } catch (e) {
      console.warn('[RRH] live analyze failed', e);
    } finally {
      analyzing = false;
      setStatusChip(
        cruiseOn
          ? (cruisePaused ? '巡航暂停' : pendingCount ? `巡航中 · 待办 ${pendingCount}` : '巡航中')
          : (pendingCount ? `实时监控 · 待办 ${pendingCount}` : '实时监控中')
      );
    }
  }

  async function openNextFromQueue() {
    const res = await chrome.runtime.sendMessage({ type: 'RRH_GET_NEXT_LIVE' });
    if (res?.item) handleRecommendation(res.item, res.pending);
    else O()?.notify?.(res?.message || '暂无未读推荐');
  }

  function refreshPending() {
    chrome.runtime.sendMessage({ type: 'RRH_GET_QUEUE' }, (res) => {
      if (!res?.ok) return;
      pendingCount = Number(res.pending || 0);
      O()?.setPendingCount?.(pendingCount);
    });
  }

  function applySettings(settings) {
    followEnabled = settings.followEnabled !== false;
    cruiseSpeed = settings.cruiseSpeed || 'normal';
    if (!followEnabled && cruiseOn) stopCruise();
    setStatusChip(followEnabled ? (cruiseOn ? '巡航中' : '实时监控中') : '实时监控已关闭');
  }

  function startCruise() {
    cruiseOn = true;
    cruisePaused = false;
    followEnabled = true;
    updateCruiseBar();
    scheduleCruiseTick();
    runAnalyze(true);
    O()?.notify?.('巡航已开始');
  }

  function stopCruise() {
    cruiseOn = false;
    cruisePaused = false;
    clearTimeout(cruiseTimer);
    updateCruiseBar();
    setStatusChip(pendingCount ? `实时监控 · 待办 ${pendingCount}` : '实时监控中');
    O()?.notify?.('巡航已停止');
  }

  function scheduleCruiseTick() {
    clearTimeout(cruiseTimer);
    if (!cruiseOn || cruisePaused || document.hidden) return;
    const delay = cruiseSpeed === 'slow' ? 2200 + Math.random() * 1200
      : cruiseSpeed === 'fast' ? 900 + Math.random() * 500
        : 1400 + Math.random() * 800;
    cruiseTimer = window.setTimeout(async () => {
      if (!cruiseOn || cruisePaused) return;
      const step = cruiseSpeed === 'slow' ? 350 + Math.random() * 200
        : cruiseSpeed === 'fast' ? 700 + Math.random() * 300
          : 500 + Math.random() * 250;
      window.scrollBy({ top: step, behavior: 'smooth' });
      await runAnalyze(false);
      if (cruiseOn && !cruisePaused) scheduleCruiseTick();
    }, delay);
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
      status: text || (cruiseOn ? '巡航中' : pendingCount ? `待办 ${pendingCount}` : '实时监控中'),
    });
  }

  function markRecommended(ids) {
    for (const id of ids || []) {
      const el = S()?.findElementByPostId?.(id);
      if (!el || el.querySelector('.rrh-badge')) continue;
      el.classList.add('rrh-recommended');
      const badge = document.createElement('span');
      badge.className = 'rrh-badge';
      badge.textContent = '值得回';
      el.appendChild(badge);
    }
  }
})();
