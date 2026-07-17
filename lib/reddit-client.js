import { updateState, getState, recordUsage } from './store.js';
import { chatCompletion } from './ai-client.js';

export const REDDIT_WINDOW_MS = 60_000;
export const REDDIT_MAX_REQUESTS = 6;
let reservationGate = Promise.resolve();
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function planRateLimit(previous, now) {
  const recent = (previous || []).map(Number).filter((time) => now - time < REDDIT_WINDOW_MS).sort((a, b) => a - b);
  const waitMs = recent.length >= REDDIT_MAX_REQUESTS ? Math.max(0, REDDIT_WINDOW_MS - (now - recent[0])) : 0;
  return { recent, waitMs };
}

async function reserveRedditSlot(deps = {}) {
  const now = deps.now || Date.now;
  const sleep = deps.sleep || defaultSleep;
  let release;
  const previous = reservationGate;
  reservationGate = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    let state = await getState();
    let plan = planRateLimit(state.runtime?.redditRequestTimes, now());
    if (plan.waitMs) await sleep(plan.waitMs);
    const timestamp = now();
    plan = planRateLimit(plan.recent, timestamp);
    await updateState((latest) => {
      latest.runtime ||= {};
      latest.runtime.redditRequestTimes = [...plan.recent, timestamp].slice(-REDDIT_MAX_REQUESTS);
      return latest;
    });
  } finally {
    release();
  }
}

export async function redditGet(path, deps = {}) {
  const pathname = String(path || '');
  if (!/^\/(?:r\/[A-Za-z0-9_]+\/)?(?:search|about(?:\/rules)?|comments\/[A-Za-z0-9_]+(?:\/[^?]*)?)\.json(?:\?|$)/.test(pathname)) throw new Error('不允许的 Reddit 端点');
  await reserveRedditSlot(deps);
  const response = await (deps.fetchImpl || fetch)(`https://www.reddit.com${pathname}`, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
  if (response.status === 429) {
    const error = new Error('Reddit 限流，已放缓');
    error.status = 429;
    throw error;
  }
  if (!response.ok) throw new Error(`Reddit 读取失败 ${response.status}`);
  return response.json();
}

export async function runMonitors(deps = {}) {
  const state = await getState();
  const now = (deps.now || Date.now)();
  const monitors = state.monitors || [];
  if (!monitors.length) return { checked: 0, added: 0 };
  const start = Number(state.runtime?.monitorCursor || 0) % monitors.length;
  let due = null;
  let dueIndex = -1;
  for (let offset = 0; offset < monitors.length; offset += 1) {
    const index = (start + offset) % monitors.length;
    const monitor = monitors[index];
    const interval = Math.max(15, Number(monitor.intervalMinutes || 15)) * 60_000;
    if (monitor.enabled && now >= Number(monitor.backoffUntil || 0) && now - Number(monitor.lastRunAt || 0) >= interval) {
      due = monitor;
      dueIndex = index;
      break;
    }
  }
  if (!due) return { checked: 0, added: 0 };
  const subs = due.subreddits?.length ? due.subreddits : ['all'];
  const subIndex = Number(due.subCursor || 0) % subs.length;
  const selectedSub = String(subs[subIndex] || 'all').replace(/^r\//, '');
  const subPath = selectedSub === 'all' ? '' : `/r/${encodeURIComponent(selectedSub)}`;
  const path = `${subPath}/search.json?q=${encodeURIComponent(due.keyword)}&sort=new&restrict_sr=${subPath ? '1' : '0'}&limit=25&raw_json=1`;
  try {
    const body = await redditGet(path, deps);
    const rows = (body?.data?.children || []).filter((item) => item.kind === 't3').map(({ data }) => ({ id: data.id, title: data.title, subreddit: data.subreddit, permalink: `https://www.reddit.com${data.permalink}`, createdAt: data.created_utc * 1000, score: data.score, monitorId: due.id, unread: true }));
    const seen = new Set(due.seenPostIds || []);
    const fresh = rows.filter((item) => !seen.has(item.id));
    await updateState((latest) => {
      const monitor = latest.monitors.find((item) => item.id === due.id);
      if (!monitor) return latest;
      monitor.lastRunAt = now;
      monitor.lastError = '';
      monitor.backoffUntil = 0;
      monitor.subCursor = (subIndex + 1) % subs.length;
      monitor.seenPostIds = [...rows.map((item) => item.id), ...(monitor.seenPostIds || [])].filter((id, index, all) => all.indexOf(id) === index).slice(0, 500);
      const existing = new Set(latest.discoveries.map((item) => item.id));
      latest.discoveries.unshift(...fresh.filter((item) => !existing.has(item.id)).map((item) => ({ ...item, source: 'monitor' })));
      latest.discoveries = latest.discoveries.slice(0, 500);
      latest.runtime.monitorCursor = (dueIndex + 1) % monitors.length;
      return latest;
    });
    return { checked: 1, added: fresh.length };
  } catch (error) {
    await updateState((latest) => {
      const monitor = latest.monitors.find((item) => item.id === due.id);
      if (monitor) {
        monitor.lastRunAt = now;
        monitor.lastError = error.message;
        if (error.status === 429) monitor.backoffUntil = now + 60 * 60_000;
      }
      latest.runtime.monitorCursor = (dueIndex + 1) % monitors.length;
      return latest;
    });
    throw error;
  }
}

export async function ensureSubredditRules(subreddit, state) {
  const name = String(subreddit || '').replace(/^r\//, '');
  const key = `r/${name}`;
  const cached = state.subredditRules[key];
  if (cached && Date.now() - cached.fetchedAt < 7 * 86_400_000) return cached;
  let raw = '';
  let description = '';
  try {
    const rules = await redditGet(`/r/${encodeURIComponent(name)}/about/rules.json?raw_json=1`);
    const about = await redditGet(`/r/${encodeURIComponent(name)}/about.json?raw_json=1`);
    raw = (rules?.rules || []).map((rule, index) => `${index + 1}. ${rule.short_name}: ${rule.description || rule.violation_reason || ''}`).join('\n').slice(0, 12_000);
    description = about?.data?.public_description || '';
  } catch {
    const value = { fetchedAt: Date.now(), summary_zh: '暂时无法读取规则。', raw: '', promoStance: 'unknown' };
    await updateState((latest) => { latest.subredditRules[key] = value; return latest; });
    return value;
  }
  let summary = { summary_zh: '规则已读取，生成前请人工核对。', promoStance: 'unknown' };
  if (state.settings.ai.apiKey) {
    try {
      const request = { model: state.settings.ai.model, messages: [{ role: 'system', content: 'Summarize the supplied subreddit rules into at most 10 concise Simplified Chinese points and classify self-promotion as banned, restricted, allowed, or unknown. Return strict JSON: {"summary_zh":"...","promoStance":"..."}. This is rule analysis, not translation.' }, { role: 'user', content: JSON.stringify({ rules: raw, description }) }], temperature: 0.1, max_tokens: 800, response_format: { type: 'json_object' } };
      const result = await chatCompletion(state.settings.ai, request);
      summary = result.data;
      await recordUsage(result.usage?.total_tokens || 0);
    } catch (error) {
      console.warn('[RRH] 规则摘要失败', error.message);
    }
  }
  const value = { fetchedAt: Date.now(), summary_zh: String(summary.summary_zh || ''), raw, promoStance: ['banned', 'restricted', 'allowed'].includes(summary.promoStance) ? summary.promoStance : 'unknown' };
  await updateState((latest) => { latest.subredditRules[key] = value; return latest; });
  return value;
}

export async function refreshSentReplies(deps = {}) {
  const state = await getState();
  const now = (deps.now || Date.now)();
  const due = state.sentReplies.filter((item) => now - Number(item.lastCheckedAt || 0) >= 86_400_000).slice(0, REDDIT_MAX_REQUESTS);
  for (const item of due) {
    try {
      const url = new URL(item.permalink);
      if (!['www.reddit.com', 'old.reddit.com'].includes(url.hostname) || !url.pathname.includes('/comments/')) throw new Error('回复链接必须来自 Reddit');
      const path = `${url.pathname.replace(/\/$/, '')}.json?raw_json=1`;
      const body = await redditGet(path, deps);
      const target = findComment(Array.isArray(body) ? body[1]?.data?.children || [] : [], item.redditId);
      item.lastScore = target?.score ?? item.lastScore;
      item.lastReplies = countReplies(target?.replies) ?? item.lastReplies;
    } catch (error) {
      item.lastError = error.message;
    }
    item.lastCheckedAt = now;
  }
  if (due.length) await updateState((latest) => { latest.sentReplies = state.sentReplies; return latest; });
  return due.length;
}

function findComment(nodes, id) {
  for (const node of nodes || []) {
    if (node?.kind !== 't1') continue;
    if (!id || node.data?.id === id) return node.data;
    const nested = findComment(node.data?.replies?.data?.children, id);
    if (nested) return nested;
  }
  return null;
}

function countReplies(replies) {
  return replies?.data?.children?.filter((item) => item.kind === 't1').length || 0;
}
