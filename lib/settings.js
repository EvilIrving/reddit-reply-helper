/** @typedef {object} Settings
 * @property {string[]} focusSubs  optional preference only, not a whitelist
 * @property {boolean} followEnabled
 * @property {number} minScore
 * @property {string} apiBase
 * @property {string} apiKey
 * @property {string} model
 * @property {'zh'|'en'} language
 * @property {string} persona
 * @property {number} dailyAiLimit
 * @property {'slow'|'normal'|'fast'} cruiseSpeed
 * @property {boolean} showEnSubHint
 */

/** @type {Settings} */
export const DEFAULT_SETTINGS = {
  focusSubs: [],
  followEnabled: true,
  minScore: 58,
  apiBase: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  language: 'zh',
  persona: '普通人，随口聊，不营销，有点具体经验，不装专家',
  dailyAiLimit: 40,
  cruiseSpeed: 'normal',
  showEnSubHint: true,
};

const SETTINGS_KEY = 'rrh_settings';
const USAGE_KEY = 'rrh_ai_usage';
const PROCESSED_KEY = 'rrh_processed';
const QUEUE_KEY = 'rrh_queue';
const DAILY_POST_KEY = 'rrh_daily_post';
const VISITED_KEY = 'rrh_visited_subs';

export const STORAGE_KEYS = {
  SETTINGS_KEY,
  USAGE_KEY,
  PROCESSED_KEY,
  QUEUE_KEY,
  DAILY_POST_KEY,
  VISITED_KEY,
};

/**
 * @returns {Promise<Settings>}
 */
export async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

/**
 * @param {Partial<Settings>} patch
 */
export async function saveSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/**
 * @returns {Promise<{ date: string, count: number }>}
 */
export async function getAiUsage() {
  const today = localDateStr();
  const data = await chrome.storage.local.get(USAGE_KEY);
  const u = data[USAGE_KEY] || { date: today, count: 0 };
  if (u.date !== today) return { date: today, count: 0 };
  return u;
}

export async function bumpAiUsage() {
  const today = localDateStr();
  const u = await getAiUsage();
  const next = { date: today, count: (u.date === today ? u.count : 0) + 1 };
  await chrome.storage.local.set({ [USAGE_KEY]: next });
  return next;
}

export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @returns {Promise<Record<string, { status: string, at: number }>>}
 */
export async function getProcessed() {
  const data = await chrome.storage.local.get(PROCESSED_KEY);
  return data[PROCESSED_KEY] || {};
}

/**
 * @param {string} id
 * @param {string} status
 */
export async function markProcessed(id, status) {
  if (!id) return;
  const map = await getProcessed();
  map[id] = { status, at: Date.now() };
  // prune > 7 days
  const cutoff = Date.now() - 7 * 86400000;
  for (const [k, v] of Object.entries(map)) {
    if (v.at < cutoff) delete map[k];
  }
  await chrome.storage.local.set({ [PROCESSED_KEY]: map });
}

/**
 * @returns {Promise<any[]>}
 */
export async function getQueue() {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  return data[QUEUE_KEY] || [];
}

/**
 * @param {any} item
 */
export async function pushQueue(item) {
  const q = await getQueue();
  const filtered = q.filter((x) => x.id !== item.id);
  filtered.unshift(item);
  await chrome.storage.local.set({ [QUEUE_KEY]: filtered.slice(0, 50) });
  return filtered.slice(0, 50);
}

/**
 * @param {string} id
 * @param {Partial<any>} patch
 */
export async function updateQueueItem(id, patch) {
  const q = await getQueue();
  const next = q.map((x) => (x.id === id ? { ...x, ...patch } : x));
  await chrome.storage.local.set({ [QUEUE_KEY]: next });
  return next;
}

/**
 * @returns {Promise<any|null>}
 */
export async function getDailyPost() {
  const data = await chrome.storage.local.get(DAILY_POST_KEY);
  return data[DAILY_POST_KEY] || null;
}

/**
 * @param {any} post
 */
export async function setDailyPost(post) {
  await chrome.storage.local.set({ [DAILY_POST_KEY]: post });
  return post;
}

export async function countPendingQueue() {
  const q = await getQueue();
  return q.filter((x) => x.status === 'new' || x.status === 'later').length;
}

/**
 * @returns {Promise<{ name: string, at: number, count: number }[]>}
 */
export async function getVisitedSubs() {
  const data = await chrome.storage.local.get(VISITED_KEY);
  return data[VISITED_KEY] || [];
}

/**
 * Record subreddits the user has browsed / seen posts from.
 * @param {string|string[]} subs
 */
export async function recordVisitedSubs(subs) {
  const list = Array.isArray(subs) ? subs : [subs];
  const cleaned = list
    .map((s) => String(s || '').replace(/^r\//i, '').trim())
    .filter(Boolean)
    .filter((s) => !/^(all|popular|home|reddit\.com)$/i.test(s));
  if (!cleaned.length) return getVisitedSubs();

  const now = Date.now();
  /** @type {{ name: string, at: number, count: number }[]} */
  const prev = await getVisitedSubs();
  const map = new Map(prev.map((x) => [x.name.toLowerCase(), x]));

  for (const raw of cleaned) {
    const key = raw.toLowerCase();
    const old = map.get(key);
    if (old) {
      map.set(key, { name: old.name, at: now, count: (old.count || 1) + 1 });
    } else {
      map.set(key, { name: raw, at: now, count: 1 });
    }
  }

  const next = [...map.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, 80);
  await chrome.storage.local.set({ [VISITED_KEY]: next });
  return next;
}

/**
 * Subs for daily post ideas: recent visits + optional focus, no hard limit to presets.
 * @returns {Promise<string[]>}
 */
export async function getSubsForDaily() {
  const settings = await getSettings();
  const visited = await getVisitedSubs();
  const names = [];
  const seen = new Set();
  for (const s of settings.focusSubs || []) {
    const n = String(s).replace(/^r\//i, '').trim();
    if (n && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      names.push(n);
    }
  }
  for (const v of visited) {
    const n = v.name;
    if (n && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      names.push(n);
    }
  }
  if (!names.length) {
    // cold start only
    return ['AskReddit', 'ClaudeAI', 'macapps'];
  }
  return names.slice(0, 20);
}
