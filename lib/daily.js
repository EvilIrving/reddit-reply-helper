import {
  getSettings,
  getDailyPost,
  setDailyPost,
  localDateStr,
  getSubsForDaily,
} from './settings.js';
import { generateDailyPostAI } from './deepseek.js';

/**
 * Ensure today's daily post candidate exists (generate if needed).
 * @param {{ force?: boolean, subs?: string[] }} [opts]
 */
export async function ensureDailyPost(opts = {}) {
  const settings = await getSettings();
  const today = localDateStr();
  const existing = await getDailyPost();

  if (
    !opts.force &&
    existing &&
    existing.date === today &&
    Array.isArray(existing.candidates) &&
    existing.candidates.length === 3
  ) {
    return { ok: true, post: existing, created: false };
  }

  const subs = Array.isArray(opts.subs)
    ? [...new Set(opts.subs.map((sub) => String(sub || '').replace(/^r\//i, '').trim()).filter(Boolean))].slice(0, 5)
    : await getSubsForDaily();
  if (!subs.length) {
    return { ok: false, error: '还没有读取到 Reddit 最近访问的 sub' };
  }

  if (!settings.apiKey || !settings.aiDataConsent) {
    const fallback = await localFallbackPost(settings, subs);
    const post = {
      ...fallback,
      date: today,
      status: 'pending',
      source: 'fallback',
      aiError: settings.apiKey ? '未同意向 AI 服务发送内容' : '未配置 API Key',
      at: Date.now(),
    };
    await setDailyPost(post);
    return { ok: true, post, created: true };
  }

  try {
    const gen = await generateDailyPostAI(subs, settings);
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
    const fallback = await localFallbackPost(settings, subs);
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

/**
 * @param {import('./settings.js').Settings} [settings]
 * @param {string[]} [dailySubs]
 */
async function localFallbackPost(settings, dailySubs) {
  const s0 = settings || (await getSettings());
  const subs = dailySubs || (await getSubsForDaily());
  const selected = [0, 1, 2].map((index) =>
    String(subs[index % Math.max(1, subs.length)] || 'AskReddit').replace(/^r\//i, '')
  );
  if (s0.language === 'en') {
    return {
      candidates: [
        {
          sub: selected[0],
          title: `Small thing I noticed around r/${selected[0]}`,
          body: `Not a rant, just curious.\n\nI hit a small workflow friction this week and I'm not sure if it's just me. What's your go-to fix?`,
          reason: 'A specific experience that invites practical replies.',
        },
        {
          sub: selected[1],
          title: `What changed your mind about this in r/${selected[1]}?`,
          body: `I used to have a pretty fixed opinion on this, but one small experience made me reconsider it. Has anything similar changed how you see it?`,
          reason: 'An opinion prompt with room for personal stories.',
        },
        {
          sub: selected[2],
          title: `What's one detail people usually miss in r/${selected[2]}?`,
          body: `The obvious advice gets repeated a lot, but the small details are usually what make the difference. What's one thing you wish someone had told you earlier?`,
          reason: 'A focused question that can produce useful discussion.',
        },
      ],
    };
  }
  return {
    candidates: [
      {
        sub: selected[0],
        title: `最近在 r/${selected[0]} 相关话题里踩了个小坑`,
        body: `不是吐槽，就是有点好奇。\n\n这周遇到一个小摩擦点，一开始觉得无所谓，后来反复出现就有点烦。你们遇到类似情况一般怎么处理？`,
        reason: '从具体经历切入，容易收到实用回复。',
      },
      {
        sub: selected[1],
        title: `你在 r/${selected[1]} 里有过被现实改观的经历吗？`,
        body: `我以前对这件事的看法挺固定，后来因为一个很小的实际体验改了主意。你们有没有类似的瞬间？`,
        reason: '观点型问题，适合引出真实经历。',
      },
      {
        sub: selected[2],
        title: `r/${selected[2]} 里最容易被忽略的细节是什么？`,
        body: `常见建议大家都讲过很多次了，我更想知道真正实践以后才发现的小细节。有什么是你希望自己早点知道的？`,
        reason: '问题具体，能避开泛泛讨论。',
      },
    ],
  };
}

/**
 * @param {'adopted'|'pending'} status
 * @param {number} [candidateIndex]
 */
export async function setDailyStatus(status, candidateIndex) {
  const post = await getDailyPost();
  if (!post) return { ok: false, error: 'no daily post' };
  const index = Number(candidateIndex);
  if (status === 'adopted' && (!Number.isInteger(index) || !post.candidates?.[index])) {
    return { ok: false, error: 'invalid candidate' };
  }
  const usedIndex = status === 'adopted' ? index : null;
  const next = {
    ...post,
    status,
    usedIndex,
    candidates: (post.candidates || []).map((candidate, i) => ({
      ...candidate,
      used: i === usedIndex,
    })),
  };
  await setDailyPost(next);
  return { ok: true, post: next };
}
