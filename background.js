import { getState, setState, recordUsage, exportState, parseImportedState } from './lib/store.js';
import { runPipeline } from './lib/pipelines.js';
import { verifyLicense, isPro } from './lib/license.js';
import { runMonitors, ensureSubredditRules, refreshSentReplies } from './lib/reddit-client.js';
import { PRO_MESSAGE, sanitizeState } from './lib/entitlements.js';
import { analyzeLivePosts, resolveLiveItem, getNextLiveDiscovery } from './lib/live-discover.js';

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  await installAlarms();
  await refreshBadge();
});
chrome.runtime.onStartup.addListener(installAlarms);
chrome.alarms.onAlarm.addListener(async ({ name }) => {
  try {
    if (name === 'rrh-monitor') await runMonitors();
    if (name === 'rrh-tracking') await refreshSentReplies();
    await refreshBadge();
  } catch (error) {
    console.warn('[RRH]', error.message);
  }
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handleMessage(message, sender).then(respond).catch((error) => respond({ ok: false, error: error.message, raw: error.raw || '' }));
  return true;
});
chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') refreshBadge(); });

async function installAlarms() {
  await chrome.alarms.create('rrh-monitor', { periodInMinutes: 15 });
  await chrome.alarms.create('rrh-tracking', { periodInMinutes: 60 });
}

async function handleMessage(message, sender) {
  if (!message?.type) return { ok: false, error: '消息类型缺失' };
  switch (message.type) {
    case 'RRH_V1_GET_STATE': {
      const state = await getState();
      return { ok: true, state, pro: isPro(state.license), proMessage: PRO_MESSAGE };
    }
    case 'RRH_V1_SET_STATE': {
      const current = await getState();
      const next = sanitizeState(message.state || {}, isPro(current.license));
      next.license = current.license;
      return { ok: true, state: await setState(next) };
    }
    case 'RRH_RUN_PIPELINE':
      return runRequestedPipeline(message);
    case 'RRH_VALIDATE_PROMPT':
      return validatePrompt(message);
    case 'RRH_ACTIVATE': {
      const license = await verifyLicense(message.key);
      const state = await getState();
      state.license = license;
      await setState(state);
      return { ok: true, license };
    }
    case 'RRH_EXPORT':
      return { ok: true, json: await exportState() };
    case 'RRH_IMPORT': {
      const imported = parseImportedState(message.json);
      let license = null;
      if (imported.license?.key) license = await verifyLicense(imported.license.key);
      imported.license = license;
      const state = sanitizeState(imported, isPro(license));
      await setState(state);
      return { ok: true, state };
    }
    case 'RRH_RUN_MONITORS': {
      const state = await getState();
      if (!isPro(state.license)) return { ok: false, error: PRO_MESSAGE };
      const result = await runMonitors();
      await refreshBadge();
      return { ok: true, ...result };
    }
    case 'RRH_GET_RULES': {
      const state = await getState();
      if (!isPro(state.license)) return { ok: true, rules: { raw: '', summary_zh: '', promoStance: 'unknown' } };
      return { ok: true, rules: await ensureSubredditRules(message.subreddit, state) };
    }
    case 'RRH_MARK_DISCOVERIES_READ': {
      const state = await getState();
      state.discoveries.forEach((item) => { item.unread = false; });
      await setState(state);
      await refreshBadge();
      return { ok: true };
    }
    case 'RRH_REFRESH_TRACKING': {
      const state = await getState();
      if (!isPro(state.license)) return { ok: false, error: PRO_MESSAGE };
      return { ok: true, checked: await refreshSentReplies() };
    }
    case 'RRH_GET_QUEUE': {
      const state = await getState();
      return { ok: true, queue: state.todos, pending: state.todos.filter((item) => item.status === 'pending').length };
    }
    case 'RRH_EXTRACT_PRODUCT':
      return extractProductFromActiveTab(message.url);
    case 'RRH_TRANSLATE_READING':
      return runReadingTranslation(message.text);
    case 'RRH_POLISH_COMPOSER':
      return runComposerPolish(message, sender);
    case 'RRH_OPEN_SIDE_PANEL':
      if (sender.tab?.id) await chrome.sidePanel.open({ tabId: sender.tab.id });
      return { ok: true };
    case 'RRH_ANALYZE_POSTS': {
      const result = await analyzeLivePosts(message.posts || [], {
        forceId: message.forceId,
        force: !!message.force,
        overlayOpen: !!message.overlayOpen,
      });
      await refreshBadge();
      return result;
    }
    case 'RRH_RESOLVE_LIVE': {
      const result = await resolveLiveItem(message.id, message.status);
      await refreshBadge();
      return result;
    }
    case 'RRH_GET_NEXT_LIVE':
      return getNextLiveDiscovery(message.excludeId);
    default:
      return { ok: false, error: `未知消息类型：${message.type}` };
  }
}

async function runRequestedPipeline(message) {
  const state = await getState();
  const pro = isPro(state.license);
  if (['post', 'polish'].includes(message.pipeline) && !pro) return { ok: false, error: PRO_MESSAGE };
  if (!state.settings.ai.apiKey) return { ok: false, error: '请先在设置中填写 API Key' };
  const context = { ...(message.context || {}) };
  if (!pro && message.pipeline === 'reply') Object.assign(context, { persona_name: '', persona_background: '', persona_voice: '', persona_taboos: '', product_name: '', product_url: '', product_desc: '', promo_mode: 'none', tone: 'casual' });
  if (pro && ['reply', 'post'].includes(message.pipeline) && context.subreddit) {
    const rules = await ensureSubredditRules(context.subreddit, state);
    context.subreddit_rules = rules.raw;
  }
  const result = await runPipeline(message.pipeline, context, state, pro);
  if (!pro && message.pipeline === 'translate') result.data = { translation_zh: result.data.translation_zh };
  await recordUsage(result.usage?.total_tokens || 0);
  return { ok: true, result };
}

async function validatePrompt(message) {
  const state = await getState();
  if (!isPro(state.license)) return { ok: false, error: PRO_MESSAGE };
  const type = String(message.pipeline || '');
  const temporary = structuredClone(state);
  temporary.settings.promptOverrides[type] = { text: String(message.text || ''), basedOnVersion: Number(message.basedOnVersion || 0) };
  const result = await runPipeline(type, message.context || {}, temporary, true);
  await recordUsage(result.usage?.total_tokens || 0);
  return { ok: true };
}

async function runReadingTranslation(text) {
  const state = await getState();
  if (!state.settings.ai.apiKey) return { ok: false, error: '请先在侧栏设置 API Key' };
  const result = await runPipeline('translate', { source_text: String(text || '').trim().slice(0, 12000) }, state, isPro(state.license));
  if (!isPro(state.license)) result.data = { translation_zh: result.data.translation_zh };
  await recordUsage(result.usage?.total_tokens || 0);
  return { ok: true, result };
}

async function runComposerPolish(message, sender) {
  const state = await getState();
  if (!isPro(state.license)) return { ok: false, error: PRO_MESSAGE };
  const text = String(message.text || '').trim();
  if (!text) return { ok: false, error: '请先输入中文观点' };
  const subreddit = sender.tab?.url?.match(/\/r\/([^/]+)/i)?.[1] || '';
  const context = { user_idea: text, persona_name: state.persona.name, persona_voice: state.persona.voice, tone: state.settings.defaults.tone, length: state.settings.defaults.length, subreddit, thread_context: String(message.threadContext || '').slice(0, 6000), promo_mode: 'none' };
  const result = await runPipeline('polish', context, state, true);
  await recordUsage(result.usage?.total_tokens || 0);
  return { ok: true, translated: result.data.reply_en };
}

async function extractProductFromActiveTab(requestedUrl) {
  const requested = new URL(requestedUrl);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || new URL(tab.url).origin !== requested.origin) return { ok: false, error: '请先在当前标签页打开该产品网址，然后重试' };
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ title: document.querySelector('meta[property="og:title"]')?.content || document.title || '', description: document.querySelector('meta[name="description"]')?.content || document.querySelector('meta[property="og:description"]')?.content || '' }) });
  return { ok: true, ...result.result };
}

async function refreshBadge() {
  const state = await getState();
  const total = state.todos.filter((item) => item.status === 'pending').length + state.discoveries.filter((item) => item.unread).length;
  await chrome.action.setBadgeText({ text: total ? String(total) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#c83a08' });
}
