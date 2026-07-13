import { getProfile, normalizeSub } from './subs.js';

/**
 * @typedef {import('./score.js').Post} Post
 */

const AI_SMELLS = [
  'game-changer',
  'game changer',
  'delve',
  'landscape',
  'furthermore',
  'crucial',
  'not just',
  'in today’s',
  'it is important to note',
  'as an ai',
];

/**
 * Build 2 short, human-ish draft comments from post context (template + light variation).
 * These are starting points — user should edit before posting.
 * @param {Post} post
 * @param {{ persona?: string, language?: 'zh'|'en' }} [opts]
 */
export function generateDrafts(post, opts = {}) {
  const sub = normalizeSub(post.subreddit);
  const profile = getProfile(sub);
  const style = profile?.style || 'casual_story';
  const title = (post.title || '').trim();
  const body = (post.body || '').trim();
  const persona = opts.persona || '普通人，随口聊，不营销';
  const language = opts.language === 'en' ? 'en' : 'zh';

  const seeds =
    language === 'zh'
      ? pickSeedsZh(style, title, body, sub)
      : pickSeeds(style, title, body, sub);
  const shuffled = [...seeds].sort(() => Math.random() - 0.5);
  const draft = humanize(shuffled[0] || '', 0);

  // 无 AI 时：标题/正文仍显示原文（浮层会标注未翻译）
  const titleZh = title;
  const bodyZh = body ? shorten(body, 120) : '（无正文或图帖）';
  const tips = [];

  return {
    draft,
    drafts: [draft],
    titleZh,
    bodyZh,
    tips,
    style,
    persona,
    polishPrompt: buildPolishPrompt(post, [draft], persona),
  };
}

/**
 * Chinese fallback templates (default language).
 * @param {string} style
 * @param {string} title
 * @param {string} body
 * @param {string} sub
 */
function pickSeedsZh(style, title, body, sub) {
  const snip = shorten(title, 40);
  switch (style) {
    case 'tech_specific':
      return [
        `我也踩过类似的。关于「${snip}」，我后来是把最容易复现的那步单独测了一遍，结果坑不在表面那个设置上。你现在具体卡在哪一步？`,
        `看标题我第一反应是配置/权限，但也可能是版本差异。你大概什么环境（版本/系统）？我可以对一下我这边能用的做法。`,
        sub === 'macapps'
          ? `如果只是想解决「${snip}」这种需求，我会先试免费/开源替代，确认工作流合适再考虑付费。你更在意稳定还是功能全？`
          : `我的经验是少一次大改、多做小验证。方便的话补一个具体报错/现象，我可以更准一点说。`,
      ];
    case 'comedy_craft':
      return [
        `这段 premise 其实有空间。如果把「意外」再推晚一点，或者把自己写成更笨的那个，往往会更好笑。你 open mic 上 tip 的反应怎么样？`,
        `我听着有点像还在解释 joke，而不是让观众自己掉进去。试着砍掉前半句 setup，直接从画面进？我自己试过，有时会突然好很多。`,
        `挺认的。这种题材很容易变成吐槽日记。加一个具体到过分的细节，会更像 bit 而不是抱怨。`,
      ];
    case 'warm_short':
      return [
        `哈哈这表情也太懂了。我家那位也是这种理直气壮的样子，尤其是刚睡醒的时候。`,
        `可爱到没脾气。是一直这样黏人，还是只有想要东西的时候才这样？`,
        `看了心情好了。这种小瞬间真的比滤镜有用。`,
      ];
    case 'casual_story':
    default:
      return [
        `我有一次差不多：聊到「${snip}」这类事，后来想起来还是有点离谱。你呢，后来怎么收场的？`,
        `这个我有发言权。简单说就是当时完全没想到会变成那样。细节就不展开了，但你问的点我是真踩过。`,
        `认真的吗哈哈。我第一反应是「这也行？」——然后发现自己其实也干过类似的事。`,
      ];
  }
}

/**
 * @param {string} style
 * @param {string} title
 * @param {string} body
 * @param {string} sub
 */
function pickSeeds(style, title, body, sub) {
  const q = extractQuestionHook(title);
  const snippet = firstSentence(body) || title;

  switch (style) {
    case 'tech_specific':
      return [
        `我也遇到过类似的。${hookFromTitle(title)} 我后来是先把最容易复现的那一步单独测了一遍，结果发现坑不在表面那个设置上。你现在具体卡在哪一步？`,
        `看标题我第一反应是配置/权限问题，但也可能是版本差异。你用的大概什么环境（版本/系统）？我可以对照一下我这边能用的做法。`,
        sub === 'macapps'
          ? `如果只是想解决「${shorten(title, 40)}」这种需求，我个人会先试免费/开源替代，确认工作流合适再考虑付费。你更在意稳定还是功能全？`
          : `我的经验是少一次大改、多做小验证。${shorten(snippet, 80)} —— 你要是方便的话补一个具体报错/现象，我可以更准一点说。`,
      ];
    case 'comedy_craft':
      return [
        `这段 premise 其实有空间。如果把「意外」再推晚两秒，或者把你自己写成更笨的那个，往往会更好笑。你现在 open mic 上 tip 的反应怎么样？`,
        `我听着有点像还在解释 joke，而不是让观众自己掉进去。试着砍掉前半句 setup，直接从画面进？我自己试过，有时会突然好很多。`,
        `挺认的。舞台上这种题材很容易变成吐槽日记。加一个具体到过分的细节（地点/时间/一个奇怪物件），会更像 bit 而不是抱怨。`,
      ];
    case 'warm_short':
      return [
        `哈哈这表情也太懂了。我家那位也是这种理直气壮的样子，尤其是刚睡醒的时候。`,
        `可爱到没脾气。是一直这样黏人，还是只有想要东西的时候才这样？`,
        `看了心情好了。这种小瞬间真的比滤镜有用。希望它一直这么开心（并少拆家）。`,
      ];
    case 'casual_story':
    default:
      return [
        `我有一次差不多：${softStory(q || title)} 后来想起来还是有点离谱。你呢，后来怎么收场的？`,
        `这个我有发言权。简单说就是当时完全没想到会变成那样。细节就不展开了，但你问的点我是真踩过。`,
        `认真的吗哈哈。我第一反应是「这也行？」——然后发现自己其实也干过类似的事。`,
      ];
  }
}

/** @param {string} title */
function extractQuestionHook(title) {
  const t = title.replace(/\s+/g, ' ').trim();
  return t.endsWith('?') ? t : '';
}

/** @param {string} title */
function hookFromTitle(title) {
  const t = shorten(title, 60);
  if (!t) return '';
  return `关于「${t}」`;
}

/** @param {string} s @param {number} n */
function shorten(s, n) {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + '…';
}

/** @param {string} body */
function firstSentence(body) {
  const t = body.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = t.match(/^(.{20,160}?[.!?。！？])\s/);
  return m ? m[1] : shorten(t, 120);
}

/** @param {string} hook */
function softStory(hook) {
  const h = shorten(hook.replace(/\?$/, ''), 50);
  return h ? `跟人聊到「${h}」这类事` : '遇到一件一开始觉得很小、后面越想越离谱的事';
}

/** @param {string} text @param {number} idx */
function humanize(text, idx) {
  let t = text.trim();
  // light variation
  if (idx === 1 && !t.startsWith('I ') && Math.random() > 0.3) {
    // keep as is — already varied by seed
  }
  // strip accidental AI smells if templates ever pick them up
  for (const w of AI_SMELLS) {
    const re = new RegExp(w, 'ig');
    t = t.replace(re, '');
  }
  t = t.replace(/\s{2,}/g, ' ').trim();
  // prefer shorter
  if (t.length > 320) t = t.slice(0, 300).replace(/\s+\S*$/, '') + '…';
  return t;
}

/**
 * @param {Post} post
 * @param {string[]} drafts
 * @param {string} persona
 */
export function buildPolishPrompt(post, drafts, persona) {
  return `你在帮我改 Reddit 评论草稿，让它更像真人随手打的，不要像 AI。

规则：
- 2～6 句，口语，可有一点不完美
- 要有具体细节或真实态度，不要空赞美
- 禁止推广、外链、品牌安利
- 禁止：furthermore / game-changer / 至关重要 / 不仅…更是… 等套话
- 语气贴合 r/${post.subreddit}
- 输出 2 个不同版本（一个更干、一个更闲聊）

帖子标题：${post.title}
Sub：r/${post.subreddit}
正文摘要：${shorten(post.body || '（无正文或图帖）', 500)}

我现有草稿（可推翻重写）：
1) ${drafts[0] || ''}
2) ${drafts[1] || ''}

人设：${persona}`;
}

/**
 * Prompt when user wants an original post draft (not a comment).
 * @param {string} sub
 * @param {string} [idea]
 */
export function buildPostPrompt(sub, idea = '') {
  return `帮我写一个准备发在 r/${sub} 的 Reddit 帖子草稿，要像真人，不要营销。

规则：
- 标题像随手写的，不要标题党广告腔
- 正文先故事/现象，再问题或结论；别写「三点收获」
- 可以有一点不完美口语
- 零推广零外链
- 给出 2 个标题 + 1 个正文

${idea ? `我想聊的方向：${idea}` : '方向：结合这个 sub 最近常见话题，写一个容易引发真诚讨论的帖。'}`;
}
