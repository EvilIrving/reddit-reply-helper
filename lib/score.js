import { getProfile, normalizeSub } from './subs.js';

/**
 * @typedef {object} Post
 * @property {string} id
 * @property {string} title
 * @property {string} [body]
 * @property {string} url
 * @property {string} subreddit
 * @property {number|null} score
 * @property {number|null} comments
 * @property {number|null} createdAt  epoch ms
 * @property {string} [author]
 * @property {boolean} [isSelf]
 * @property {string} [flair]
 */

/**
 * Score a post for "worth replying" (0-100). Higher = better candidate.
 * Any sub is eligible — browsing is not limited to a whitelist.
 * @param {Post} post
 */
export function scorePost(post) {
  const reasons = [];
  let score = 40;

  const sub = normalizeSub(post.subreddit);
  const profile = getProfile(sub);
  const title = (post.title || '').toLowerCase();
  const body = (post.body || '').toLowerCase();
  const text = `${title} ${body}`;

  // Age window (prefer 30min – 18h for comments that can still get seen)
  const ageH = post.createdAt ? (Date.now() - post.createdAt) / 3600000 : null;
  if (ageH != null) {
    if (ageH < 0.25) {
      score -= 5;
      reasons.push('太新，可稍等再回');
    } else if (ageH < 2) {
      score += 18;
      reasons.push('很新，回复容易被看到');
    } else if (ageH < 8) {
      score += 14;
      reasons.push('时间窗口不错');
    } else if (ageH < 24) {
      score += 6;
      reasons.push('今天内的帖');
    } else if (ageH < 72) {
      score -= 6;
      reasons.push('有点旧了');
    } else {
      score -= 18;
      reasons.push('太旧，评论难曝光');
    }
  }

  // Comment count sweet spot
  const c = post.comments;
  if (c != null) {
    if (c === 0) {
      score += 8;
      reasons.push('还没人回，可抢首评');
    } else if (c <= 15) {
      score += 16;
      reasons.push(`评论少（${c}），好说话`);
    } else if (c <= 40) {
      score += 10;
      reasons.push(`讨论中（${c} 评）`);
    } else if (c <= 100) {
      score += 2;
    } else if (c <= 300) {
      score -= 10;
      reasons.push('评论已很多，容易被淹');
    } else {
      score -= 20;
      reasons.push('热帖评论爆炸，性价比低');
    }
  }

  // Upvote signal: some traction but not mega viral
  const s = post.score;
  if (s != null) {
    if (s >= 5 && s < 50) {
      score += 8;
      reasons.push('有点热度但未爆');
    } else if (s >= 50 && s < 500) {
      score += 4;
    } else if (s >= 2000) {
      score -= 8;
      reasons.push('已经很爆，新评论难被看到');
    }
  }

  // Question / help shape — great for comments
  const isQuestion =
    /\?$/.test(post.title.trim()) ||
    /^(what|why|how|who|when|where|which|anyone|does|is|are|can|should|would|do you)\b/i.test(
      post.title.trim()
    ) ||
    /\b(advice|help|recommend|suggestions?|tips?)\b/i.test(title);

  if (isQuestion) {
    score += 12;
    reasons.push('问题向，好写有用回复');
  }

  // Keyword fit for known subs
  if (profile) {
    let hits = 0;
    for (const kw of profile.keywords) {
      if (text.includes(kw.toLowerCase())) hits += 1;
    }
    if (hits >= 1) {
      score += Math.min(10, hits * 3);
      reasons.push('话题和 sub 气质匹配');
    }
    for (const bad of profile.avoid) {
      if (text.includes(bad.toLowerCase())) {
        score -= 15;
        reasons.push('疑似推广/敏感话题，慎回');
        break;
      }
    }
  }

  // Body length: self posts with some detail are better
  const bodyLen = (post.body || '').trim().length;
  if (bodyLen > 80 && bodyLen < 2500) {
    score += 6;
    reasons.push('正文有细节，好接话');
  } else if (bodyLen === 0 && post.isSelf) {
    score += 2;
  }

  // Title too vague / meme dump
  if ((post.title || '').length < 12) {
    score -= 6;
  }
  if (/\b(upvote|karma|follow me)\b/i.test(text)) {
    score -= 25;
    reasons.push('像 karma 农场帖');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    reasons: reasons.slice(0, 4),
    tier: score >= 72 ? 'great' : score >= 55 ? 'ok' : score >= 40 ? 'maybe' : 'skip',
  };
}

/**
 * @param {Post[]} posts
 * @param {{ minScore?: number, limit?: number }} [opts]
 */
export function rankPosts(posts, opts = {}) {
  const min = opts.minScore ?? 45;
  const limit = opts.limit ?? 20;
  return posts
    .map((p) => {
      const r = scorePost(p);
      return { ...p, recommendScore: r.score, reasons: r.reasons, tier: r.tier };
    })
    .filter((p) => p.recommendScore >= min)
    .sort((a, b) => b.recommendScore - a.recommendScore)
    .slice(0, limit);
}
