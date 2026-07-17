import { getState, setState } from './store.js';
import { scorePost } from './score.js';

const SEEN_CAP = 800;
const DISCOVERY_CAP = 80;

/**
 * Score visible posts while browsing. Adds hits to discoveries and returns one overlay item.
 * @param {object[]} posts
 * @param {{ forceId?: string, overlayOpen?: boolean }} [opts]
 */
export async function analyzeLivePosts(posts, opts = {}) {
  const state = await getState();
  const followEnabled = state.settings.followEnabled !== false;
  if (!followEnabled && !opts.forceId) {
    return { ok: true, recommendation: null, reason: 'follow_disabled', pending: pendingCount(state) };
  }

  const seen = new Set(state.runtime.liveSeenIds || []);
  const minScore = Number(state.settings.minScore ?? 52);
  const ranked = [];

  for (const post of posts || []) {
    if (!post?.id || !post?.title) continue;
    const id = String(post.id).replace(/^t3_/, '');
    if (!opts.force && !opts.forceId && seen.has(id)) continue;
    if (opts.forceId && id !== String(opts.forceId).replace(/^t3_/, '')) continue;
    const result = scorePost({ ...post, id, comments: post.comments ?? post.commentCount ?? null });
    ranked.push({
      ...post,
      id,
      url: post.url || post.permalink || '',
      recommendScore: result.score,
      reasons: result.reasons,
      tier: result.tier,
    });
  }

  ranked.sort((a, b) => b.recommendScore - a.recommendScore);
  for (const row of ranked) seen.add(row.id);
  state.runtime.liveSeenIds = [...seen].slice(-SEEN_CAP);

  const candidate = ranked.find((p) => p.recommendScore >= minScore);
  if (!candidate) {
    await setState(state);
    return {
      ok: true,
      recommendation: null,
      scanned: ranked.length,
      topScore: ranked[0]?.recommendScore ?? 0,
      pending: pendingCount(state),
    };
  }

  const discovery = {
    id: candidate.id,
    title: candidate.title,
    subreddit: candidate.subreddit || '',
    permalink: candidate.url || candidate.permalink || '',
    createdAt: candidate.createdAt || Date.now(),
    score: candidate.score ?? 0,
    recommendScore: candidate.recommendScore,
    reasons: candidate.reasons || [],
    source: 'live',
    unread: true,
  };
  const without = (state.discoveries || []).filter((item) => item.id !== discovery.id);
  state.discoveries = [discovery, ...without].slice(0, DISCOVERY_CAP);
  await setState(state);

  const item = {
    id: candidate.id,
    post: candidate,
    draft: '',
    drafts: [],
    titleZh: candidate.title,
    bodyZh: (candidate.body || '').slice(0, 160) || '（无正文或图帖）',
    tips: candidate.reasons || [],
    freshAngle: '',
    commentsReviewed: 0,
    source: 'live',
    status: 'new',
    at: Date.now(),
  };

  return { ok: true, recommendation: item, pending: pendingCount(state) };
}

export async function resolveLiveItem(id, status) {
  const state = await getState();
  const cleanId = String(id || '').replace(/^t3_/, '');
  if (status === 'later' || status === 'stash') {
    const hit = state.discoveries.find((item) => item.id === cleanId);
    const todoId = `t_${cleanId}`;
    if (!state.todos.some((item) => item.id === todoId)) {
      state.todos.unshift({
        id: todoId,
        title: hit?.title || cleanId,
        subreddit: hit?.subreddit || '',
        permalink: hit?.permalink || '',
        addedAt: Date.now(),
        status: 'pending',
        note: '',
      });
    }
  }
  if (hitUnread(state, cleanId)) {
    const row = state.discoveries.find((item) => item.id === cleanId);
    if (row) row.unread = false;
  }
  if (status === 'skipped') {
    state.discoveries = state.discoveries.filter((item) => item.id !== cleanId);
  }
  await setState(state);
  return { ok: true, pending: pendingCount(state) };
}

export async function getNextLiveDiscovery(excludeId) {
  const state = await getState();
  const exclude = String(excludeId || '').replace(/^t3_/, '');
  const hit = (state.discoveries || []).find((item) => item.unread && item.id !== exclude && item.source === 'live');
  if (!hit) return { ok: true, item: null, pending: pendingCount(state), message: '暂无未读推荐，继续滚动即可' };
  const item = {
    id: hit.id,
    post: {
      id: hit.id,
      title: hit.title,
      subreddit: hit.subreddit,
      url: hit.permalink,
      recommendScore: hit.recommendScore,
      reasons: hit.reasons || [],
      body: '',
    },
    draft: '',
    drafts: [],
    titleZh: hit.title,
    bodyZh: '',
    tips: hit.reasons || [],
    source: 'live',
    status: 'new',
    at: hit.createdAt || Date.now(),
  };
  return { ok: true, item, pending: pendingCount(state) };
}

function pendingCount(state) {
  return (state.todos || []).filter((item) => item.status === 'pending').length
    + (state.discoveries || []).filter((item) => item.unread).length;
}

function hitUnread(state, id) {
  return (state.discoveries || []).some((item) => item.id === id && item.unread);
}
