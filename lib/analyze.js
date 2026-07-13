import { scorePost } from './score.js';
import { generateDrafts } from './draft.js';
import { generateCommentAssistAI, scorePostsAI } from './deepseek.js';
import {
  getSettings,
  getProcessed,
  markProcessed,
  pushQueue,
  updateQueueItem,
  countPendingQueue,
  getQueue,
} from './settings.js';

/**
 * Analyze a batch of posts from content script.
 * Returns at most one recommendation to show (to avoid spam).
 * @param {any[]} posts
 * @param {{ forceId?: string }} [opts]
 */
export async function analyzePosts(posts, opts = {}) {
  const settings = await getSettings();
  const processed = await getProcessed();

  if (!settings.followEnabled && !opts.forceId) {
    return { ok: true, recommendation: null, reason: 'follow_disabled' };
  }

  /** @type {any[]} */
  const eligible = [];
  for (const p of posts || []) {
    if (!p?.id || !p?.title) continue;
    if (processed[p.id] && !opts.forceId) continue;
    if (opts.forceId && p.id !== opts.forceId) continue;

    eligible.push(p);
  }

  const localRanked = eligible.map((p) => {
    const r = scorePost(p);
    return {
      ...p,
      recommendScore: r.score,
      reasons: r.reasons,
      tier: r.tier,
      scoreSource: 'local',
    };
  });

  let ranked = localRanked;
  let aiScoringError = '';
  const wantsAiScoring = settings.scoringMode === 'ai';
  const canScoreWithAi = !!settings.apiKey && settings.aiDataConsent === true;

  if (wantsAiScoring && canScoreWithAi && eligible.length) {
    try {
      const aiScores = [];
      for (let index = 0; index < eligible.length; index += 20) {
        const batchScores = await scorePostsAI(eligible.slice(index, index + 20), settings);
        aiScores.push(...batchScores);
      }
      const scoreById = new Map(aiScores.map((row) => [row.id, row]));
      ranked = eligible.map((p) => {
        const result = scoreById.get(String(p.id));
        return {
          ...p,
          recommendScore: result.score,
          reasons: result.reason ? [result.reason] : [],
          tier:
            result.score >= 72
              ? 'great'
              : result.score >= 55
                ? 'ok'
                : result.score >= 40
                  ? 'maybe'
                  : 'skip',
          scoreSource: 'ai',
          scoreConfidence: result.confidence,
        };
      });
    } catch (error) {
      aiScoringError = String(error?.message || error);
      ranked = localRanked;
    }
  }

  ranked.sort((a, b) => b.recommendScore - a.recommendScore);

  const min = settings.minScore ?? 58;
  const candidate = ranked.find((p) => p.recommendScore >= min);
  if (!candidate) {
    return {
      ok: true,
      recommendation: null,
      scanned: ranked.length,
      topScore: ranked[0]?.recommendScore ?? 0,
      pending: await countPendingQueue(),
    };
  }

  await markProcessed(candidate.id, 'generating');

  const canAi = !!settings.apiKey && settings.aiDataConsent === true && !aiScoringError;

  let draft = '';
  let titleZh = candidate.title || '';
  let bodyZh = (candidate.body || '').slice(0, 120) || '（无正文或图帖）';
  let tips = [];
  let freshAngle = '';
  let coveredAngles = [];
  let commentsReviewed = 0;
  let source = 'fallback';
  let aiError;

  if (canAi) {
    const out = await generateCommentAssistAI(candidate, settings, (post, s) =>
      generateDrafts(post, { persona: s.persona, language: s.language })
    );
    draft = out.draft || '';
    titleZh = out.titleZh || titleZh;
    bodyZh = out.bodyZh || bodyZh;
    tips = out.tips || [];
    freshAngle = out.freshAngle || '';
    coveredAngles = out.coveredAngles || [];
    commentsReviewed = out.commentsReviewed || 0;
    source = out.source;
    aiError = out.error;
  } else {
    const fb = generateDrafts(candidate, {
      persona: settings.persona,
      language: settings.language,
    });
    draft = fb.draft || '';
    titleZh = fb.titleZh || titleZh;
    bodyZh = fb.bodyZh || bodyZh;
    tips = fb.tips || [];
    source = settings.apiKey ? 'fallback' : 'no_key';
    if (aiScoringError) aiError = `AI 评分失败，已改用代码评分：${aiScoringError}`;
    else if (!settings.apiKey) aiError = '未配置 API Key（无中文翻译）';
    else if (!settings.aiDataConsent) aiError = '未同意向 AI 服务发送内容';
  }

  // 合并规则分理由 + AI tips，去重
  const reasons = candidate.reasons || [];
  const allTips = [...tips];
  for (const r of reasons) {
    if (!allTips.includes(r)) allTips.push(r);
  }

  const item = {
    id: candidate.id,
    post: candidate,
    draft,
    drafts: draft ? [draft] : [],
    titleZh,
    bodyZh,
    tips: allTips.slice(0, 5),
    freshAngle,
    coveredAngles,
    commentsReviewed,
    source,
    aiError: aiError || null,
    translated: source === 'ai',
    status: 'new',
    at: Date.now(),
    language: settings.language,
  };

  await pushQueue(item);
  await markProcessed(candidate.id, 'new');

  const pending = await countPendingQueue();
  try {
    await chrome.action.setBadgeText({ text: pending > 0 ? String(pending) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#ff4500' });
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    recommendation: item,
    pending,
    settingsHint: {
      language: settings.language,
      showEnSubHint: settings.showEnSubHint !== false,
    },
  };
}

/**
 * @param {string} [excludeId]
 */
export async function getNextPending(excludeId) {
  const q = await getQueue();
  const item = q.find(
    (x) =>
      (x.status === 'new' || x.status === 'later') &&
      (!excludeId || x.id !== excludeId)
  );
  const pending = await countPendingQueue();
  if (!item) {
    return { ok: true, item: null, pending, message: '待办空了，继续刷即可' };
  }
  return { ok: true, item, pending };
}

/**
 * @param {string} id
 * @param {'skipped'|'later'|'copied'|'done'} status
 */
export async function resolveRecommendation(id, status) {
  await markProcessed(id, status);
  await updateQueueItem(id, { status });
  const pending = await countPendingQueue();
  try {
    await chrome.action.setBadgeText({ text: pending > 0 ? String(pending) : '' });
  } catch {
    /* ignore */
  }
  return { ok: true, pending };
}
