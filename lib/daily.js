import {
  getSettings,
  getDailyPost,
  setDailyPost,
  localDateStr,
  getAiUsage,
  bumpAiUsage,
  getSubsForDaily,
} from './settings.js';
import { generateDailyPostAI } from './deepseek.js';

/**
 * Ensure today's daily post candidate exists (generate if needed).
 * @param {{ force?: boolean }} [opts]
 */
export async function ensureDailyPost(opts = {}) {
  const settings = await getSettings();
  const today = localDateStr();
  const existing = await getDailyPost();

  if (
    !opts.force &&
    existing &&
    existing.date === today &&
    existing.status !== 'discarded'
  ) {
    return { ok: true, post: existing, created: false };
  }

  // if discarded today and not force, don't auto re-create until tomorrow unless force
  if (!opts.force && existing?.date === today && existing.status === 'discarded') {
    return { ok: true, post: existing, created: false, discarded: true };
  }

  if (!settings.apiKey) {
    const fallback = await localFallbackPost(settings);
    const post = {
      ...fallback,
      date: today,
      status: 'pending',
      source: 'fallback',
      aiError: '未配置 API Key',
      at: Date.now(),
    };
    await setDailyPost(post);
    return { ok: true, post, created: true };
  }

  const usage = await getAiUsage();
  if (usage.count >= (settings.dailyAiLimit ?? 40)) {
    const fallback = await localFallbackPost(settings);
    const post = {
      ...fallback,
      date: today,
      status: 'pending',
      source: 'fallback',
      aiError: '今日 AI 次数已达上限',
      at: Date.now(),
    };
    await setDailyPost(post);
    return { ok: true, post, created: true };
  }

  try {
    const subs = await getSubsForDaily();
    const gen = await generateDailyPostAI(subs, settings);
    await bumpAiUsage();
    const post = {
      ...gen,
      date: today,
      status: 'pending',
      source: 'ai',
      at: Date.now(),
    };
    await setDailyPost(post);
    return { ok: true, post, created: true };
  } catch (e) {
    const fallback = await localFallbackPost(settings);
    const post = {
      ...fallback,
      date: today,
      status: 'pending',
      source: 'fallback',
      aiError: String(e.message || e),
      at: Date.now(),
    };
    await setDailyPost(post);
    return { ok: true, post, created: true, error: String(e.message || e) };
  }
}

/** @param {import('./settings.js').Settings} [settings] */
async function localFallbackPost(settings) {
  const s0 = settings || (await getSettings());
  const subs = await getSubsForDaily();
  const sub = subs[Math.floor(Math.random() * subs.length)] || 'AskReddit';
  const s = sub.replace(/^r\//i, '');
  if (s0.language === 'en') {
    return {
      sub: s,
      titles: [
        `Small thing I noticed around r/${s}`,
        `Anyone else run into this on r/${s}?`,
      ],
      body: `Not a rant, just curious.\n\nI hit a small workflow friction this week and I'm not sure if it's just me. What's your go-to fix?\n\n(Context: casual user, not promoting anything.)`,
      reason: 'Local template from recently browsed subs.',
    };
  }
  return {
    sub: s,
    titles: [
      `最近在 r/${s} 相关话题里踩了个小坑`,
      `请教一下：你们遇到这种情况会怎么处理？`,
    ],
    body: `不是广告，就是想聊聊真实体验。\n\n这周遇到一个小摩擦点，一开始觉得无所谓，后来反复出现就有点烦。你们要是遇到类似的，一般会怎么解决？`,
    reason: '根据你最近浏览过的 sub 生成的本地模板。',
  };
}

/**
 * @param {'adopted'|'discarded'|'pending'} status
 */
export async function setDailyStatus(status) {
  const post = await getDailyPost();
  if (!post) return { ok: false, error: 'no daily post' };
  const next = { ...post, status };
  await setDailyPost(next);
  return { ok: true, post: next };
}
