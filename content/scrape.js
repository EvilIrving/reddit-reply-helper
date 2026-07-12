/**
 * Scrape posts from current Reddit page (new + old).
 * Attaches to globalThis.RRH_SCRAPE
 */
(function () {
  const RRH = (globalThis.RRH_SCRAPE = globalThis.RRH_SCRAPE || {});

  /**
   * @returns {Array<object>}
   */
  RRH.scrapePosts = function scrapePosts() {
    const existingComments = scrapeVisibleComments();
    const fromShreddit = scrapeShreddit();
    if (fromShreddit.length) return attachComments(dedupe(fromShreddit), existingComments);

    const fromOld = scrapeOldReddit();
    if (fromOld.length) return attachComments(dedupe(fromOld), existingComments);

    const fromLinks = scrapeGenericLinks();
    return attachComments(dedupe(fromLinks), existingComments);
  };

  function attachComments(posts, comments) {
    if (!comments.length || !/\/comments\/[a-z0-9]+\//i.test(location.pathname)) return posts;
    const currentId = idFromPermalink(location.pathname);
    return posts.map((post) =>
      post.id === currentId ? { ...post, existingComments: comments } : post
    );
  }

  function scrapeVisibleComments() {
    if (!/\/comments\/[a-z0-9]+\//i.test(location.pathname)) return [];
    const selectors = [
      'shreddit-comment',
      '.thing.comment',
      '[data-testid="comment"]',
      'article[data-qa="comment"]',
    ];
    const out = [];
    const seen = new Set();
    document.querySelectorAll(selectors.join(',')).forEach((node) => {
      if (out.length >= 24) return;
      const body = textOf(
        node.querySelector('[slot="comment"], [slot="comment-body"], .usertext-body .md, [data-testid="comment"] p, .md')
      );
      const text = clean(body);
      if (text.length < 12 || /^\[(deleted|removed)\]$/i.test(text)) return;
      const normalized = text.toLowerCase().slice(0, 240);
      if (seen.has(normalized)) return;
      seen.add(normalized);
      out.push(text.slice(0, 700));
    });
    return out;
  }

  /**
   * @param {string} postId
   */
  RRH.findElementByPostId = function findElementByPostId(postId) {
    if (!postId) return null;
    const selectors = [
      `shreddit-post[id="${cssEscape(postId)}"]`,
      `shreddit-post[id="t3_${cssEscape(postId)}"]`,
      `#${cssEscape(postId)}`,
      `#t3_${cssEscape(postId)}`,
      `.thing[data-fullname="t3_${cssEscape(postId)}"]`,
      `.thing[data-fullname="${cssEscape(postId)}"]`,
      `article[id*="${cssEscape(postId)}"]`,
      `[data-post-id="${cssEscape(postId)}"]`,
      `a[href*="/comments/${cssEscape(stripT3(postId))}/"]`,
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el.closest('shreddit-post, .thing, article, [data-testid="post-container"]') || el;
      } catch {
        /* invalid selector */
      }
    }
    // fallback: any anchor matching comments path
    const id = stripT3(postId);
    const a = document.querySelector(`a[href*="/comments/${id}/"]`);
    return a ? a.closest('shreddit-post, .thing, article') || a : null;
  };

  RRH.highlightPost = function highlightPost(postId) {
    document.querySelectorAll('.rrh-highlight').forEach((el) => el.classList.remove('rrh-highlight'));
    const el = RRH.findElementByPostId(postId);
    if (!el) return false;
    el.classList.add('rrh-highlight');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  };

  RRH.getPageMeta = function getPageMeta() {
    return {
      url: location.href,
      title: document.title,
      isReddit: /\.reddit\.com$/i.test(location.hostname),
      path: location.pathname,
    };
  };

  function scrapeShreddit() {
    /** @type {Array<object>} */
    const out = [];
    const nodes = document.querySelectorAll('shreddit-post');
    nodes.forEach((node, idx) => {
      const el = /** @type {HTMLElement} */ (node);
      const permalink =
        el.getAttribute('permalink') ||
        el.getAttribute('content-href') ||
        pickAttr(el, ['permalink']);
      const title =
        el.getAttribute('post-title') ||
        textOf(el.querySelector('[slot="title"], a[slot="title"], faceplate-tracker h1, h1, h2, h3')) ||
        '';
      if (!title && !permalink) return;

      const id =
        stripT3(el.id || el.getAttribute('id') || '') ||
        idFromPermalink(permalink) ||
        `idx-${idx}`;

      const subreddit =
        el.getAttribute('subreddit-name') ||
        el.getAttribute('subreddit-prefixed-name')?.replace(/^r\//, '') ||
        subFromPermalink(permalink) ||
        subFromPath() ||
        '';

      const score2 = num(el.getAttribute('score'));
      const comments = num(el.getAttribute('comment-count'));
      const createdRaw =
        el.getAttribute('created-timestamp') ||
        el.getAttribute('created') ||
        el.querySelector('time')?.getAttribute('datetime') ||
        '';
      const createdAt = parseTime(createdRaw);
      const author = el.getAttribute('author') || textOf(el.querySelector('[slot="authorName"], a[href*="/user/"]'));
      const body =
        textOf(el.querySelector('[slot="text-body"], .md, [data-click-id="text"]')) ||
        textOf(el.querySelector('div[id*="post-rtjson"]')) ||
        '';

      const url = absUrl(permalink || el.querySelector('a[href*="/comments/"]')?.getAttribute('href'));

      out.push({
        id: stripT3(id),
        title: clean(title),
        body: clean(body),
        url,
        subreddit: clean(subreddit),
        score: score2,
        comments,
        createdAt,
        author: clean(author || ''),
        isSelf: body.length > 0,
        source: 'shreddit',
      });
    });
    return out;
  }

  function scrapeOldReddit() {
    /** @type {Array<object>} */
    const out = [];
    document.querySelectorAll('.thing.link, .thing[data-fullname^="t3_"]').forEach((node, idx) => {
      const el = /** @type {HTMLElement} */ (node);
      const fullname = el.getAttribute('data-fullname') || '';
      const id = stripT3(fullname) || `old-${idx}`;
      const titleEl = el.querySelector('a.title');
      const title = textOf(titleEl);
      if (!title) return;
      const url = absUrl(titleEl?.getAttribute('href') || el.getAttribute('data-permalink'));
      const subreddit =
        el.getAttribute('data-subreddit') ||
        textOf(el.querySelector('.subreddit'))?.replace(/^r\//, '') ||
        subFromPath() ||
        '';
      const score = num(el.getAttribute('data-score') || textOf(el.querySelector('.score.unvoted, .score')));
      const comments = num(textOf(el.querySelector('a.comments')));
      const createdAt = parseTime(el.querySelector('time')?.getAttribute('datetime') || '');
      const author = el.getAttribute('data-author') || textOf(el.querySelector('.author'));
      const body = textOf(el.querySelector('.expando .md, .usertext-body .md'));

      out.push({
        id,
        title: clean(title),
        body: clean(body),
        url,
        subreddit: clean(subreddit),
        score,
        comments,
        createdAt,
        author: clean(author || ''),
        isSelf: !!el.classList.contains('self') || body.length > 0,
        source: 'old',
      });
    });
    return out;
  }

  /** Fallback: post links in feed */
  function scrapeGenericLinks() {
    /** @type {Array<object>} */
    const out = [];
    const seen = new Set();
    document.querySelectorAll('a[href*="/comments/"]').forEach((a, idx) => {
      const href = a.getAttribute('href') || '';
      const id = idFromPermalink(href);
      if (!id || seen.has(id)) return;
      // skip comment deep links with many segments if title empty and looks like "comments"
      const title = clean(a.textContent || '');
      if (!title || title.length < 8) return;
      if (/^\d+\s*comments?$/i.test(title)) return;
      seen.add(id);
      out.push({
        id,
        title,
        body: '',
        url: absUrl(href),
        subreddit: subFromPermalink(href) || subFromPath() || '',
        score: null,
        comments: null,
        createdAt: null,
        author: '',
        isSelf: false,
        source: 'generic',
      });
    });
    return out.slice(0, 40);
  }

  function dedupe(posts) {
    const map = new Map();
    for (const p of posts) {
      const key = p.id || p.url || p.title;
      if (!key) continue;
      const prev = map.get(key);
      if (!prev || (p.body && !prev.body) || (p.comments != null && prev.comments == null)) {
        map.set(key, p);
      }
    }
    return [...map.values()];
  }

  function stripT3(id) {
    return String(id || '').replace(/^t3_/, '').trim();
  }

  function idFromPermalink(url) {
    if (!url) return '';
    const m = String(url).match(/\/comments\/([a-z0-9]+)\//i);
    return m ? m[1] : '';
  }

  function subFromPermalink(url) {
    if (!url) return '';
    const m = String(url).match(/\/r\/([^/]+)/i);
    return m ? m[1] : '';
  }

  function subFromPath() {
    const m = location.pathname.match(/\/r\/([^/]+)/i);
    return m ? m[1] : '';
  }

  function absUrl(href) {
    if (!href) return location.href;
    try {
      return new URL(href, location.origin).href;
    } catch {
      return href;
    }
  }

  function textOf(el) {
    if (!el) return '';
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function clean(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    const s = String(v).trim().toLowerCase();
    if (!s || s === '•' || s === 'vote' || s === 'comment') return null;
    const m = s.replace(/,/g, '').match(/(-?[\d.]+)\s*([kmb])?/);
    if (!m) return null;
    let n = parseFloat(m[1]);
    if (m[2] === 'k') n *= 1e3;
    if (m[2] === 'm') n *= 1e6;
    if (m[2] === 'b') n *= 1e9;
    return Math.round(n);
  }

  function parseTime(raw) {
    if (!raw) return null;
    // ISO
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return t;
    // epoch seconds
    const n = Number(raw);
    if (!Number.isNaN(n)) {
      return n < 1e12 ? n * 1000 : n;
    }
    return null;
  }

  function pickAttr(el, names) {
    for (const n of names) {
      const v = el.getAttribute(n);
      if (v) return v;
    }
    return '';
  }

  function cssEscape(s) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
    return String(s).replace(/"/g, '\\"');
  }
})();
