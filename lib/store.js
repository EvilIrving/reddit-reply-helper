export const SCHEMA_VERSION = 3;
export const migrations = [
  (state) => ({ ...state, schemaVersion: 1, discoveries: state.discoveries || [], monitors: state.monitors || [], sentReplies: state.sentReplies || [], usage: state.usage || {} }),
  (state) => ({ ...state, schemaVersion: 2, runtime: state.runtime || { redditRequestTimes: [], monitorCursor: 0 } }),
  (state) => ({
    ...state,
    schemaVersion: 3,
    settings: {
      ...state.settings,
      followEnabled: state.settings?.followEnabled !== false,
      cruiseSpeed: state.settings?.cruiseSpeed || 'normal',
      minScore: Number(state.settings?.minScore ?? 52),
    },
    runtime: { ...(state.runtime || {}), liveSeenIds: state.runtime?.liveSeenIds || [] },
  }),
];
export const DEFAULT_STATE = {
  schemaVersion: SCHEMA_VERSION,
  settings: {
    ai: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: '' },
    language: 'zh-CN',
    promptOverrides: { reply: null, post: null, translate: null, polish: null },
    defaults: { tone: 'casual', length: 'medium' },
    healthCardEnabled: true,
    followEnabled: true,
    cruiseSpeed: 'normal',
    minScore: 52,
  },
  license: null,
  persona: { name: '', background: '', voice: '', taboos: '' },
  products: [], todos: [], monitors: [], discoveries: [], subredditRules: {}, sentReplies: [], usage: {},
  runtime: { redditRequestTimes: [], monitorCursor: 0, liveSeenIds: [] },
};
const ROOT_KEY = 'rrh_v1';
const STATE_KEYS = ['schemaVersion','settings','license','persona','products','todos','monitors','discoveries','subredditRules','sentReplies','usage','runtime'];

export async function getState() {
  const data = await chrome.storage.local.get([ROOT_KEY, 'rrh_settings', 'rrh_queue', ...STATE_KEYS]);
  if (data.settings?.ai) return mergeState(Object.fromEntries(STATE_KEYS.map((k)=>[k,data[k]])));
  if (data[ROOT_KEY]) { const migrated=mergeState(data[ROOT_KEY]);await setState(migrated);return migrated; }
  const legacy = data.rrh_settings || {};
  const state = mergeState({ settings: { ai: { baseUrl: legacy.apiBase, model: legacy.model, apiKey: legacy.apiKey }, defaults: { tone: 'casual', length: 'medium' } }, persona: legacy.persona ? { ...DEFAULT_STATE.persona, voice: legacy.persona } : undefined, todos: (data.rrh_queue || []).map((x) => ({ ...x, permalink: x.permalink || x.url || '', status: x.status === 'done' ? 'replied' : x.status === 'skip' ? 'skipped' : 'pending', addedAt: x.addedAt || Date.now() })) });
  return setState(state);
}
function mergeState(value = {}) {
  for (let version=Number(value.schemaVersion||0);version<SCHEMA_VERSION;version+=1) value=migrations[version](value);
  return { ...structuredClone(DEFAULT_STATE), ...value, settings: { ...DEFAULT_STATE.settings, ...(value.settings || {}), ai: { ...DEFAULT_STATE.settings.ai, ...(value.settings?.ai || {}) }, defaults: { ...DEFAULT_STATE.settings.defaults, ...(value.settings?.defaults || {}) }, promptOverrides: { ...DEFAULT_STATE.settings.promptOverrides, ...(value.settings?.promptOverrides || {}) } }, persona: { ...DEFAULT_STATE.persona, ...(value.persona || {}) }, runtime: { ...DEFAULT_STATE.runtime, ...(value.runtime || {}) } };
}
export async function setState(state) { const next = mergeState(state); await chrome.storage.local.set(Object.fromEntries(STATE_KEYS.map((k)=>[k,next[k]]))); return next; }
export async function updateState(mutator) { const state = await getState(); const next = (await mutator(state)) || state; return setState(next); }
export async function recordUsage(tokens = 0) { return updateState((s) => { const day = new Date().toLocaleDateString('sv-SE'); const old = s.usage[day] || { calls: 0, tokens: 0 }; s.usage[day] = { calls: old.calls + 1, tokens: old.tokens + Number(tokens || 0) }; return s; }); }
export async function exportState() { return JSON.stringify(await getState(), null, 2); }
export function parseImportedState(value) { const parsed = typeof value === 'string' ? JSON.parse(value) : value; if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('备份文件格式无效'); return mergeState(parsed); }
export async function importState(value) { return setState(parseImportedState(value)); }
