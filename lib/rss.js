/**
 * Fetch subreddit feeds from the extension (user browser network).
 * Tries .rss first, then .json as fallback.
 */

/**
 * @param {string[]} subs
 * @param {{ sort?: 'new' | 'hot' | 'rising', limit?: number }} [opts]
 * @returns {Promise<{ posts: any[], errors: string[] }>}
 */
export async function fetchSubs(subs, opts = {}) {
  const sort = opts.sort || 'new';
  const limit = opts.limit || 25;
  /** @type {any[]} */
  const posts = [];
  /** @type {string[]} */
  const errors = [];

  for (const raw of subs) {
    const sub = raw.replace(/^r\//i, '').trim();
    if (!sub) continue;
    try {
      const batch = await fetchOneSub(sub, sort, limit);
      posts.push(...batch);
    } catch (e) {
      errors.push(`r/${sub}: ${e?.message || e}`);
    }
    // be polite
    await sleep(400);
  }

  // dedupe by id
  const map = new Map();
  for (const p of posts) {
    const key = p.id || p.url;
    if (!key) continue;
    if (!map.has(key)) map.set(key, p);
  }
  return { posts: [...map.values()], errors };
}

/**
 * @param {string} sub
 * @param {string} sort
 * @param {number} limit
 */
async function fetchOneSub(sub, sort, limit) {
  // Prefer JSON in browser — richer fields; RSS as fallback
  try {
    return await fetchJson(sub, sort, limit);
  } catch (jsonErr) {
    try {
      return await fetchRss(sub, sort);
    } catch (rssErr) {
      throw new Error(`json: ${jsonErr.message}; rss: ${rssErr.message}`);
    }
  }
}

/**
 * @param {string} sub
 * @param {string} sort
 * @param {number} limit
 */
async function fetchJson(sub, sort, limit) {
  const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/${sort}.json?limit=${limit}&raw_json=1`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const children = data?.data?.children || [];
  return children
    .filter((c) => c?.kind === 't3' && c.data)
    .map((c) => {
      const d = c.data;
      return {
        id: d.id,
        title: d.title || '',
        body: d.selftext || '',
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : d.url,
        subreddit: d.subreddit || sub,
        score: typeof d.score === 'number' ? d.score : null,
        comments: typeof d.num_comments === 'number' ? d.num_comments : null,
        createdAt: d.created_utc ? d.created_utc * 1000 : null,
        author: d.author || '',
        isSelf: !!d.is_self,
        source: 'json',
      };
    });
}

/**
 * @param {string} sub
 * @param {string} sort
 */
async function fetchRss(sub, sort) {
  const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/${sort}.rss`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return parseRss(text, sub);
}

/**
 * Minimal RSS parser (no DOMParser dependency issues in SW — use DOMParser in sidepanel).
 * @param {string} xml
 * @param {string} sub
 */
export function parseRss(xml, sub) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('RSS parse error');
  }
  const items = [...doc.querySelectorAll('entry, item')];
  return items.map((item, idx) => {
    const title =
      text(item, 'title') ||
      item.querySelector('title')?.textContent ||
      '';
    const linkEl = item.querySelector('link');
    const href =
      linkEl?.getAttribute('href') ||
      text(item, 'link') ||
      item.querySelector('link')?.textContent ||
      '';
    const idMatch = href.match(/\/comments\/([a-z0-9]+)\//i);
    const content =
      text(item, 'content') ||
      text(item, 'description') ||
      item.querySelector('content, description, summary')?.textContent ||
      '';
    const updated =
      text(item, 'updated') ||
      text(item, 'published') ||
      text(item, 'pubDate') ||
      '';
    const author =
      text(item, 'name') ||
      item.querySelector('author name, dc\\:creator, creator')?.textContent ||
      '';

    return {
      id: idMatch ? idMatch[1] : `rss-${sub}-${idx}`,
      title: stripHtml(title).trim(),
      body: stripHtml(content).trim().slice(0, 2000),
      url: href.startsWith('http') ? href : `https://www.reddit.com${href}`,
      subreddit: sub,
      score: null,
      comments: null,
      createdAt: updated ? Date.parse(updated) || null : null,
      author: stripHtml(author).replace(/^\/?u\//, '').trim(),
      isSelf: true,
      source: 'rss',
    };
  });
}

/**
 * @param {Element} el
 * @param {string} tag
 */
function text(el, tag) {
  return el.querySelector(tag)?.textContent || '';
}

/** @param {string} html */
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
