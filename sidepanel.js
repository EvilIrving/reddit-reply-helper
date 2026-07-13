const $ = (id) => document.getElementById(id);

const els = {
  tabs: document.querySelectorAll('.tab'),
  queueStatus: $('queueStatus'),
  queueList: $('queueList'),
  dailyStatus: $('dailyStatus'),
  dailyCard: $('dailyCard'),
  settingsForm: $('settingsForm'),
  settingsStatus: $('settingsStatus'),
  btnForceScan: $('btnForceScan'),
  btnCruise: $('btnCruise'),
  btnClearProcessed: $('btnClearProcessed'),
  btnDailyAction: $('btnDailyAction'),
};

let expandedQueueId = null;
let cruiseOn = false;
let dailyLoaded = false;
let dailyPost = null;
let dailyLoading = false;

init();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.rrh_queue && document.activeElement?.tagName !== 'TEXTAREA') loadQueue();
});

async function init() {
  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.getAttribute('data-tab')));
  });

  els.btnForceScan.addEventListener('click', forceScan);
  els.btnCruise.addEventListener('click', toggleCruise);
  els.btnClearProcessed.addEventListener('click', clearProcessed);
  els.btnDailyAction.addEventListener('click', () => loadDaily(!!dailyPost));
  els.settingsForm.addEventListener('submit', onSaveSettings);

  await Promise.all([loadSettingsForm(), loadQueue(), syncCruiseState()]);
}

/**
 * @param {string|null} name
 */
async function switchTab(name) {
  els.tabs.forEach((t) => t.classList.toggle('active', t.getAttribute('data-tab') === name));
  els.tabs.forEach((t) =>
    t.setAttribute('aria-selected', String(t.getAttribute('data-tab') === name))
  );
  for (const id of ['queue', 'daily', 'settings']) {
    $(`tab-${id}`)?.classList.toggle('hidden', id !== name);
  }
  if (name === 'daily' && !dailyLoaded) await loadDaily(false);
}

async function loadSettingsForm() {
  const res = await chrome.runtime.sendMessage({ type: 'RRH_GET_SETTINGS' });
  if (!res?.ok) return;
  const s = res.settings;
  const f = els.settingsForm;
  f.focusSubs.value = (s.focusSubs || []).join(',');
  f.followEnabled.checked = s.followEnabled !== false;
  f.minScore.value = s.minScore ?? 58;
  f.apiBase.value = s.apiBase || '';
  f.apiKey.value = s.apiKey || '';
  f.model.value = s.model || 'deepseek-chat';
  f.language.value = s.language || 'zh';
  f.persona.value = s.persona || '';
  f.dailyAiLimit.value = s.dailyAiLimit ?? 40;
  f.cruiseSpeed.value = s.cruiseSpeed || 'normal';
  const visited = res.visitedSubs || [];
  const hint = document.getElementById('visitedHint');
  if (hint) {
    if (!visited.length) {
      hint.textContent = '最近浏览：还没有记录，去任意 sub 逛一下即可';
    } else {
      hint.textContent =
        '最近浏览：' +
        visited
          .slice(0, 12)
          .map((v) => `r/${v.name}`)
          .join(' · ');
    }
  }
}

/**
 * @param {Event} e
 */
async function onSaveSettings(e) {
  e.preventDefault();
  const f = els.settingsForm;
  const patch = {
    focusSubs: String(f.focusSubs.value)
      .split(/[,，\s]+/)
      .map((x) => x.replace(/^r\//i, '').trim())
      .filter(Boolean),
    followEnabled: !!f.followEnabled.checked,
    minScore: clampNumber(f.minScore.value, 0, 100, 58),
    apiBase: f.apiBase.value.trim() || 'https://api.deepseek.com/v1',
    apiKey: f.apiKey.value.trim(),
    model: f.model.value.trim() || 'deepseek-chat',
    language: f.language.value === 'en' ? 'en' : 'zh',
    persona: f.persona.value.trim(),
    dailyAiLimit: clampNumber(f.dailyAiLimit.value, 1, 200, 40),
    cruiseSpeed: f.cruiseSpeed.value || 'normal',
  };
  const res = await chrome.runtime.sendMessage({ type: 'RRH_SAVE_SETTINGS', patch });
  els.settingsStatus.textContent = res?.ok ? '已保存' : `保存失败：${res?.error || ''}`;
  if (res?.ok) await loadSettingsForm();
}

async function loadQueue() {
  const res = await chrome.runtime.sendMessage({ type: 'RRH_GET_QUEUE' });
  const queue = res?.queue || [];
  els.queueList.innerHTML = '';
  if (!queue.length) {
    els.queueList.innerHTML =
      '<div class="empty">暂无候选。打开 Reddit 后点「立即分析」。</div>';
    els.queueStatus.textContent = '队列为空';
    return;
  }
  const open = queue.filter((x) => x.status === 'new' || x.status === 'later');
  const rest = queue.filter((x) => x.status !== 'new' && x.status !== 'later');
  els.queueStatus.textContent = `待处理 ${open.length} · 已处理 ${rest.length}`;

  if (open.length) {
    const h = document.createElement('div');
    h.className = 'section-label';
    h.innerHTML = `<span>待处理</span><span>${open.length}</span>`;
    els.queueList.appendChild(h);
    for (const item of open) els.queueList.appendChild(renderQueueCard(item));
  }
  if (rest.length) {
    const h = document.createElement('div');
    h.className = 'section-label processed';
    h.innerHTML = `<span>已处理</span><span>${rest.length}</span>`;
    els.queueList.appendChild(h);
    for (const item of rest.slice(0, 15)) els.queueList.appendChild(renderQueueCard(item));
  }
}

/**
 * @param {any} item
 */
function renderQueueCard(item) {
  const post = item.post || {};
  const titleZh = item.titleZh || post.title || '';
  const bodyZh = item.bodyZh || '';
  const draft = item.draft || (item.drafts && item.drafts[0]) || '';
  const tips = (item.tips || post.reasons || []).slice(0, 4);
  const freshAngle = item.freshAngle || '';
  const isOpen = expandedQueueId === item.id;
  const statusText = item.status === 'later' ? '已收着' : item.status === 'new' ? '新推荐' : '已处理';
  const el = document.createElement('article');
  el.className = `queue-item${isOpen ? ' is-open' : ''}`;
  el.innerHTML = `
    <button type="button" class="queue-summary" aria-expanded="${String(isOpen)}">
      <span class="queue-summary-copy">
        <span class="queue-title">${escapeHtml(titleZh)}</span>
        <span class="queue-meta">r/${escapeHtml(post.subreddit || '?')} · ${escapeHtml(String(post.recommendScore ?? ''))}分 · ${statusText}</span>
      </span>
      <span class="disclosure" aria-hidden="true">⌄</span>
    </button>
    <div class="queue-detail" ${isOpen ? '' : 'hidden'}>
      ${bodyZh ? `<p class="meta">${escapeHtml(bodyZh)}</p>` : ''}
      ${freshAngle ? `<p class="meta"><strong>新角度：</strong>${escapeHtml(freshAngle)}${item.commentsReviewed ? `（参考 ${escapeHtml(String(item.commentsReviewed))} 条评论）` : ''}</p>` : ''}
      ${tips.length ? `<p class="meta">${escapeHtml(tips.join(' · '))}</p>` : ''}
      <textarea data-d="draft" rows="3" aria-label="回复草稿">${escapeHtml(draft)}</textarea>
      <div class="actions">
        <button type="button" class="btn small primary" data-act="fill">写回复</button>
        <a class="btn small" href="${escapeAttr(discussionUrl(post) || '#')}" target="_blank" rel="noopener">打开</a>
        <button type="button" class="btn small danger" data-act="skip">跳过</button>
      </div>
    </div>
  `;
  el.querySelector('.queue-summary')?.addEventListener('click', () => {
    const shouldOpen = expandedQueueId !== item.id;
    expandedQueueId = shouldOpen ? item.id : null;
    for (const node of els.queueList.querySelectorAll('.queue-item')) {
      setQueueItemOpen(node, shouldOpen && node === el);
    }
  });
  const draftInput = el.querySelector('textarea[data-d="draft"]');
  let saveTimer;
  draftInput?.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.runtime.sendMessage({
        type: 'RRH_UPDATE_QUEUE_ITEM',
        id: item.id,
        patch: { draft: draftInput.value, drafts: [draftInput.value] },
      });
    }, 450);
  });
  el.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.getAttribute('data-act');
      if (act === 'fill') {
        const ta = el.querySelector('textarea[data-d="draft"]');
        const res = await sendToActiveResponse({
          type: 'RRH_FILL_REPLY',
          id: item.id,
          draft: /** @type {HTMLTextAreaElement} */ (ta)?.value || '',
          url: discussionUrl(post),
        });
        setQueueStatus(res?.ok ? '正在进入回复位置…' : '请先打开 Reddit 页面', !res?.ok);
        return;
      }
      if (act === 'skip') {
        await chrome.runtime.sendMessage({
          type: 'RRH_RESOLVE',
          id: item.id,
          status: 'skipped',
        });
        expandedQueueId = null;
        await loadQueue();
      }
    });
  });
  return el;
}

function setQueueItemOpen(el, open) {
  el.classList.toggle('is-open', open);
  el.querySelector('.queue-summary')?.setAttribute('aria-expanded', String(open));
  const detail = el.querySelector('.queue-detail');
  if (detail) detail.hidden = !open;
}

async function syncCruiseState() {
  const state = await sendToActiveResponse({ type: 'RRH_PING' });
  cruiseOn = !!state?.cruiseOn;
  updateCruiseButton();
}

async function toggleCruise() {
  els.btnCruise.disabled = true;
  const state = await sendToActiveResponse({ type: 'RRH_PING' });
  if (!state?.ok) {
    els.btnCruise.disabled = false;
    setQueueStatus('请先打开 Reddit 页面', true);
    return;
  }
  cruiseOn = !!state.cruiseOn;
  const next = !cruiseOn;
  const res = await sendToActiveResponse({
    type: next ? 'RRH_START_CRUISE' : 'RRH_STOP_CRUISE',
  });
  els.btnCruise.disabled = false;
  if (!res?.ok) {
    setQueueStatus('巡航切换失败，请刷新 Reddit 页面', true);
    return;
  }
  cruiseOn = next;
  updateCruiseButton();
  setQueueStatus(next ? '巡航中，可随时停止' : '巡航已停止');
}

function updateCruiseButton() {
  els.btnCruise.textContent = cruiseOn ? '停止巡航' : '开始巡航';
  els.btnCruise.setAttribute('aria-pressed', String(cruiseOn));
  els.btnCruise.classList.toggle('active', cruiseOn);
}

async function forceScan() {
  setQueueStatus('正在请求当前页分析…');
  const ok = await sendToActive({ type: 'RRH_FORCE_SCAN' });
  if (!ok) {
    // inject scripts then retry
    const tab = await getActiveTab();
    if (tab?.id && isReddit(tab.url)) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/scrape.js', 'content/overlay.js', 'content/translate.js', 'content/content.js'],
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content/content.css'],
        });
        await sendToActive({ type: 'RRH_FORCE_SCAN' });
      } catch (e) {
        setQueueStatus('无法注入：' + e, true);
        return;
      }
    } else {
      setQueueStatus('请先打开 Reddit 标签页', true);
      return;
    }
  }
  setTimeout(loadQueue, 1500);
  setQueueStatus('已触发分析，命中会在页面右侧浮层弹出');
}

/**
 * @param {boolean} force
 */
async function loadDaily(force) {
  dailyLoading = true;
  updateDailyButton();
  els.dailyStatus.textContent = force ? '重新生成中…' : '加载今日备选…';
  const res = await chrome.runtime.sendMessage({ type: 'RRH_ENSURE_DAILY', force });
  dailyLoading = false;
  if (!res?.ok) {
    els.dailyStatus.textContent = res?.error || '失败';
    els.dailyStatus.classList.add('err');
    updateDailyButton();
    return;
  }
  dailyLoaded = true;
  els.dailyStatus.classList.remove('err');
  const post = res.post;
  if (!post) {
    dailyPost = null;
    els.dailyCard.className = 'daily-card empty';
    els.dailyCard.textContent = '无数据';
    updateDailyButton();
    return;
  }
  dailyPost = post;
  if (post.status === 'discarded' && !force) {
    els.dailyStatus.textContent = '今日已弃用，可重新生成';
  } else if (post.status === 'adopted') {
    els.dailyStatus.textContent = '已标记为准备发布';
  } else {
    els.dailyStatus.textContent = '';
  }
  renderDaily(post);
  updateDailyButton();
}

function updateDailyButton() {
  els.btnDailyAction.disabled = dailyLoading;
  if (dailyLoading) {
    els.btnDailyAction.textContent = dailyPost ? '重新生成中…' : '生成中…';
    return;
  }
  els.btnDailyAction.textContent = dailyPost ? '重新生成' : '生成今日备选';
}

/**
 * @param {any} post
 */
function renderDaily(post) {
  els.dailyCard.className = 'daily-card';
  const titles = post.titles || [];
  els.dailyCard.innerHTML = `
    <div class="meta">建议发到 r/${escapeHtml(post.sub || '')} · ${escapeHtml(post.date || '')}</div>
    <h3>标题备选</h3>
    <p class="title-opt">1. ${escapeHtml(titles[0] || '')}</p>
    <p class="title-opt">2. ${escapeHtml(titles[1] || '')}</p>
    <h3>正文</h3>
    <div class="body">${escapeHtml(post.body || '')}</div>
    <p class="reason">${escapeHtml(post.reason || '')}</p>
    <div class="actions">
      <button type="button" class="btn small primary" id="d-copy-t1">复制标题1</button>
      <button type="button" class="btn small" id="d-copy-t2">复制标题2</button>
      <button type="button" class="btn small" id="d-copy-body">复制正文</button>
      <button type="button" class="btn small" id="d-adopt">标记已去发</button>
      <button type="button" class="btn small" id="d-discard">弃用</button>
    </div>
  `;
  $('d-copy-t1')?.addEventListener('click', () => copyText(titles[0] || ''));
  $('d-copy-t2')?.addEventListener('click', () => copyText(titles[1] || ''));
  $('d-copy-body')?.addEventListener('click', () => copyText(post.body || ''));
  $('d-adopt')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'RRH_DAILY_STATUS', status: 'adopted' });
    await loadDaily(false);
  });
  $('d-discard')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'RRH_DAILY_STATUS', status: 'discarded' });
    await loadDaily(false);
  });
}

async function clearProcessed() {
  const res = await chrome.runtime.sendMessage({ type: 'RRH_CLEAR_PROCESSED' });
  setQueueStatus(res?.ok ? '已清理已处理记录' : `清理失败：${res?.error || ''}`, !res?.ok);
  if (res?.ok) await loadQueue();
}

/**
 * @param {any} message
 */
async function sendToActive(message) {
  return !!(await sendToActiveResponse(message));
}

/**
 * @param {any} message
 */
async function sendToActiveResponse(message) {
  const tab = await getActiveTab();
  if (!tab?.id || !isReddit(tab.url)) return null;
  try {
    return (await chrome.tabs.sendMessage(tab.id, message)) || { ok: true };
  } catch {
    return null;
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * @param {string} [url]
 */
function isReddit(url) {
  try {
    return /(^|\.)reddit\.com$/i.test(new URL(url || '').hostname);
  } catch {
    return false;
  }
}

/**
 * @param {string} msg
 * @param {boolean} [err]
 */
function setQueueStatus(msg, err = false) {
  els.queueStatus.textContent = msg;
  els.queueStatus.classList.toggle('err', !!err);
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

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function discussionUrl(post) {
  const url = String(post?.url || '');
  if (/\/comments\/[a-z0-9]+(?:\/|$)/i.test(url)) return url;
  const id = String(post?.id || '').replace(/^t3_/, '');
  const subreddit = String(post?.subreddit || '').replace(/^r\//, '');
  if (/^[a-z0-9]+$/i.test(id) && subreddit) {
    return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/comments/${encodeURIComponent(id)}/`;
  }
  return url;
}
