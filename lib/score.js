/**
 * Local "worth replying" score (0-100). No network.
 * @param {object} post
 */
export function scorePost(post) {
  const reasons = [];
  let score = 40;
  const title = String(post.title || '');
  const body = String(post.body || '');
  const text = `${title} ${body}`.toLowerCase();

  const ageH = post.createdAt ? (Date.now() - post.createdAt) / 3600000 : null;
  if (ageH != null) {
    if (ageH < 0.25) { score -= 5; reasons.push('太新，可稍等再回'); }
    else if (ageH < 2) { score += 18; reasons.push('很新，回复容易被看到'); }
    else if (ageH < 8) { score += 14; reasons.push('时间窗口不错'); }
    else if (ageH < 24) { score += 6; reasons.push('今天内的帖'); }
    else if (ageH < 72) { score -= 6; reasons.push('有点旧了'); }
    else { score -= 18; reasons.push('太旧，评论难曝光'); }
  }

  const c = post.comments;
  if (c != null) {
    if (c === 0) { score += 8; reasons.push('还没人回，可抢首评'); }
    else if (c <= 15) { score += 16; reasons.push(`评论少（${c}），好说话`); }
    else if (c <= 40) { score += 10; reasons.push(`讨论中（${c} 评）`); }
    else if (c <= 100) { score += 2; }
    else if (c <= 300) { score -= 10; reasons.push('评论已很多，容易被淹'); }
    else { score -= 20; reasons.push('热帖评论爆炸，性价比低'); }
  }

  const s = post.score;
  if (s != null) {
    if (s >= 5 && s < 50) { score += 8; reasons.push('有点热度但未爆'); }
    else if (s >= 50 && s < 500) { score += 4; }
    else if (s >= 2000) { score -= 8; reasons.push('已经很爆，新评论难被看到'); }
  }

  const isQuestion =
    /\?$/.test(title.trim()) ||
    /^(what|why|how|who|when|where|which|anyone|does|is|are|can|should|would|do you)\b/i.test(title.trim()) ||
    /\b(advice|help|recommend|suggestions?|tips?)\b/i.test(title.toLowerCase());
  if (isQuestion) { score += 12; reasons.push('问题向，好写有用回复'); }

  const bodyLen = body.trim().length;
  if (bodyLen > 80 && bodyLen < 2500) { score += 6; reasons.push('正文有细节，好接话'); }
  else if (bodyLen === 0 && post.isSelf) score += 2;

  if (title.length < 12) score -= 6;
  if (/\b(upvote|karma|follow me)\b/i.test(text)) { score -= 25; reasons.push('像 karma 农场帖'); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    reasons: reasons.slice(0, 4),
    tier: score >= 72 ? 'great' : score >= 55 ? 'ok' : score >= 40 ? 'maybe' : 'skip',
  };
}
