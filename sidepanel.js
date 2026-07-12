const $ = (id) => document.getElementById(id);

const els = {
  tabs: document.querySelectorAll('.tab'),
  queueStatus: $('queueStatus'),
  queueList: $('queueList'),
  dailyStatus: $('dailyStatus'),
  dailyCard: $('dailyCard'),
  settingsForm: $('settingsForm'),
  settingsStatus: $('settingsStatus'),
  btnRefreshQueue: $('btnRefreshQueue'),
  btnForceScan: $('btnForceScan'),
  btnStartCruise: $('btnStartCruise'),
  btnStopCruise: $('btnStopCruise'),
  btnDailyLoad: $('btnDailyLoad'),
  btnDailyRegen: $('btnDailyRegen'),
};

init();

async function init() {
  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.getAttribute('data-tab')));
  });

  els.btnRefreshQueue.addEventListener('click', loadQueue);
  els.btnForceScan.addEventListener('click', forceScan);
  els.btnStartCruise.addEventListener('click', () => sendToActive({ type: 'RRH_START_CRUISE' }));
  els.btnStopCruise.addEventListener('click', () => sendToActive({ type: 'RRH_STOP_CRUISE' }));
  els.btnDailyLoad.addEventListener('click', () => loadDaily(false));
  els.btnDailyRegen.addEventListener('click', () => loadDaily(true));
  els.settingsForm.addEventListener('submit', onSaveSettings);

  await loadSettingsForm();
  await loadQueue();
  // auto ensure daily when opening panel
  await loadDaily(false);
}

/**
 * @param {string|null} name
 */
function switchTab(name) {
  els.tabs.forEach((t) => t.classList.toggle('active', t.getAttribute('data-tab') === name));
  for (const id of ['queue', 'daily', 'settings']) {
    $(`tab-${id}`)?.classList.toggle('hidden', id !== name);
  }
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
    minScore: Number(f.minScore.value) || 58,
    apiBase: f.apiBase.value.trim() || 'https://api.deepseek.com/v1',
    apiKey: f.apiKey.value.trim(),
    model: f.model.value.trim() || 'deepseek-chat',
    language: f.language.value === 'en' ? 'en' : 'zh',
    persona: f.persona.value.trim(),
    dailyAiLimit: Number(f.dailyAiLimit.value) || 40,
    cruiseSpeed: f.cruiseSpeed.value || 'normal',
  };
  const res = await chrome.runtime.sendMessage({ type: 'RRH_SAVE_SETTINGS', patch });
  els.settingsStatus.textContent = res?.ok ? '已保存' : `保存失败：${res?.error || ''}`;
}

async function loadQueue() {
  const res = await chrome.runtime.sendMessage({ type: 'RRH_GET_QUEUE' });
  const queue = res?.queue || [];
  els.queueList.innerHTML = '';
  if (!queue.length) {
    els.queueList.innerHTML =
      '<div class="empty">暂无候选。去 Reddit 列表页滚动，或点「开始巡航 / 立即分析」。</div>';
    els.queueStatus.textContent = '队列为空';
    return;
  }
  const open = queue.filter((x) => x.status === 'new' || x.status === 'later');
  const rest = queue.filter((x) => x.status !== 'new' && x.status !== 'later');
  els.queueStatus.textContent = `待处理 ${open.length} · 已处理 ${rest.length}（可慢慢想，收着不挡继续刷）`;

  if (open.length) {
    const h = document.createElement('p');
    h.className = 'muted';
    h.style.margin = '0 0 6px';
    h.textContent = '—— 待处理（先收着 / 新推荐）——';
    els.queueList.appendChild(h);
    for (const item of open) els.queueList.appendChild(renderQueueCard(item));
  }
  if (rest.length) {
    const h = document.createElement('p');
    h.className = 'muted';
    h.style.margin = '12px 0 6px';
    h.textContent = '—— 已跳过 / 已复制 ——';
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
  const el = document.createElement('article');
  el.className = 'card';
  el.innerHTML = `
    <div class="meta">
      r/${escapeHtml(post.subreddit || '?')}
      · ${escapeHtml(String(post.recommendScore ?? ''))}分
    </div>
    <h3>${escapeHtml(titleZh)}</h3>
    ${bodyZh ? `<p class="meta">${escapeHtml(bodyZh)}</p>` : ''}
    ${freshAngle ? `<p class="meta"><strong>新角度：</strong>${escapeHtml(freshAngle)}${item.commentsReviewed ? `（已参考 ${escapeHtml(String(item.commentsReviewed))} 条评论）` : ''}</p>` : ''}
    ${
      tips.length
        ? `<p class="meta">${escapeHtml(tips.join(' · '))}</p>`
        : ''
    }
    <textarea data-d="draft" rows="3">${escapeHtml(draft)}</textarea>
    <div class="actions">
      <button type="button" class="btn small primary" data-act="copy">复制</button>
      <a class="btn small" href="${escapeAttr(post.url || '#')}" target="_blank" rel="noopener">打开</a>
      <button type="button" class="btn small" data-act="skip">跳过</button>
      <button type="button" class="btn small" data-act="later">先收着</button>
    </div>
  `;
  el.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.getAttribute('data-act');
      if (act === 'copy') {
        const ta = el.querySelector('textarea[data-d="draft"]');
        await copyText(/** @type {HTMLTextAreaElement} */ (ta)?.value || '');
        await chrome.runtime.sendMessage({
          type: 'RRH_RESOLVE',
          id: item.id,
          status: 'copied',
        });
        setQueueStatus('已复制');
        return;
      }
      if (act === 'skip' || act === 'later') {
        await chrome.runtime.sendMessage({
          type: 'RRH_RESOLVE',
          id: item.id,
          status: act === 'skip' ? 'skipped' : 'later',
        });
        await loadQueue();
      }
    });
  });
  return el;
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
          files: ['content/scrape.js', 'content/overlay.js', 'content/content.js'],
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
  els.dailyStatus.textContent = force ? '重新生成中…' : '加载今日备选…';
  const res = await chrome.runtime.sendMessage({ type: 'RRH_ENSURE_DAILY', force });
  if (!res?.ok) {
    els.dailyStatus.textContent = res?.error || '失败';
    els.dailyStatus.classList.add('err');
    return;
  }
  els.dailyStatus.classList.remove('err');
  const post = res.post;
  if (!post) {
    els.dailyCard.className = 'daily-card empty';
    els.dailyCard.textContent = '无数据';
    return;
  }
  if (post.status === 'discarded' && !force) {
    els.dailyStatus.textContent = '今日已弃用，可重新生成';
  } else {
    els.dailyStatus.textContent = '';
  }
  renderDaily(post);
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
    <p class="muted" style="margin-top:8px">英文 sub 请自行翻译后发布。插件不会自动发帖。</p>
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

/**
 * @param {any} message
 */
async function sendToActive(message) {
  const tab = await getActiveTab();
  if (!tab?.id || !isReddit(tab.url)) return false;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return true;
  } catch {
    return false;
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
