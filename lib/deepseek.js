/**
 * OpenAI-compatible chat client (DeepSeek default).
 */

/**
 * @param {object} opts
 * @param {string} opts.apiBase
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {{role: string, content: string}[]} opts.messages
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @returns {Promise<string>}
 */
export async function chatCompletion(opts) {
  const base = (opts.apiBase || 'https://api.deepseek.com/v1').replace(/\/$/, '');
  const url = `${base}/chat/completions`;
  if (!opts.apiKey) throw new Error('未配置 API Key');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model || 'deepseek-chat',
      messages: opts.messages,
      temperature: opts.temperature ?? 0.9,
      max_tokens: opts.maxTokens ?? 800,
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`API 返回非 JSON (${res.status}): ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || text.slice(0, 200);
    throw new Error(`API ${res.status}: ${msg}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 无内容返回');
  return String(content).trim();
}

/**
 * Translate Chinese copy into casual, natural Reddit English.
 * @param {string} text
 * @param {object} settings
 */
export async function translateToEnglish(text, settings) {
  return chatCompletion({
    apiBase: settings.apiBase,
    apiKey: settings.apiKey,
    model: settings.model,
    messages: [
      {
        role: 'system',
        content:
          'Translate the user text into casual, natural English that a real Reddit user would type. Match the original tone, preserve line breaks, use contractions when natural, and avoid stiff or textbook phrasing. Do not add facts, explanations, labels, markdown fences, or quotation marks. Output only the translation.',
      },
      { role: 'user', content: text },
    ],
    temperature: 0.3,
    maxTokens: 1600,
  });
}

/**
 * One-shot assist: 中文翻译标题/正文摘要 + 单条草稿 + 简短提醒.
 * @param {object} post
 * @param {object} settings
 * @param {(post: object, settings: object) => object} [fallbackFn]
 * @returns {Promise<{
 *   draft: string,
 *   titleZh: string,
 *   bodyZh: string,
 *   tips: string[],
 *   source: 'ai'|'fallback',
 *   error?: string
 * }>}
 */
export async function generateCommentAssistAI(post, settings, fallbackFn) {
  const draftLang = settings.language === 'en' ? 'English' : '中文';
  const system = `你在帮中国用户快速理解 Reddit 帖子并可选地写一条评论草稿。
输出必须是严格 JSON，不要 markdown 代码块。

格式：
{
  "title_zh": "标题中文翻译（自然通顺，不要机翻腔）",
  "body_zh": "正文中文摘要/翻译，最多120字；无正文则写「无正文或图帖」",
  "fresh_angle": "一个尚未被现有评论充分表达的新角度，中文，最多50字",
  "covered_angles": ["现有评论已覆盖的观点1", "观点2"],
  "draft": "一条评论草稿",
  "tips": ["提醒1", "提醒2"]
}

规则：
1) title_zh / body_zh 永远用中文，即使原帖是英文——用户浮层主要看中文。
2) draft 语言：${draftLang}。默认中文（用户会自己译成英文再发也可以）。
3) draft 只要 1 条，2～5 句，口语，像随手打的；有态度或一个具体点即可。
4) 用户未必用你的草稿，tips 给 1～3 条「回复时可注意」的短提醒（中文），例如：可分享什么经历、避免抬杠、问题向可反问一句。
5) 禁止推广、外链、品牌、AI 套话。
6) 如果提供了现有评论，先归纳 covered_angles，再让 fresh_angle 和 draft 避开相同观点、论据与例子；禁止改写或拼接他人评论。
7) 人设：${settings.persona || '普通人，随口聊'}`;

  const comments = (post.existingComments || []).slice(0, 24);
  const commentsContext = comments.length
    ? `\n现有评论（只用于避重，禁止照抄）：\n${comments
        .map((comment, index) => `${index + 1}. ${String(comment).slice(0, 700)}`)
        .join('\n')
        .slice(0, 9000)}`
    : '\n当前没有读取到现有评论；请仍优先给具体、非泛泛的新角度。';

  const user = `Sub: r/${post.subreddit}
原标题: ${post.title}
原正文: ${(post.body || '').slice(0, 1500) || '（无正文/图帖）'}
↑${post.score ?? '?'} · 评论 ${post.comments ?? '?'}${commentsContext}`;

  try {
    const raw = await chatCompletion({
      apiBase: settings.apiBase,
      apiKey: settings.apiKey,
      model: settings.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.85,
      maxTokens: 700,
    });
    const parsed = parseAssistJson(raw);
    if (!parsed.draft && !parsed.titleZh) throw new Error('无法解析结果');
    return { ...parsed, commentsReviewed: comments.length, source: 'ai' };
  } catch (e) {
    const fb = fallbackFn
      ? fallbackFn(post, settings)
      : { draft: '', titleZh: post.title || '', bodyZh: '', tips: [] };
    return {
      draft: fb.draft || fb.drafts?.[0] || '',
      titleZh: fb.titleZh || post.title || '',
      bodyZh: fb.bodyZh || clip(post.body || '', 120) || '（无正文或图帖）',
      tips: fb.tips || ['未走 AI，仅本地模板'],
      freshAngle: '',
      coveredAngles: [],
      commentsReviewed: comments.length,
      source: 'fallback',
      error: String(e.message || e),
    };
  }
}

/** @deprecated use generateCommentAssistAI */
export async function generateCommentDraftsAI(post, settings, fallbackFn) {
  const out = await generateCommentAssistAI(post, settings, fallbackFn);
  return {
    drafts: out.draft ? [out.draft] : [],
    titleZh: out.titleZh,
    bodyZh: out.bodyZh,
    tips: out.tips,
    source: out.source,
    error: out.error,
  };
}

/**
 * @param {string[]} subs
 * @param {object} settings
 */
export async function generateDailyPostAI(subs, settings, recentHint = '') {
  const lang = settings.language === 'en' ? 'English' : '中文';
  const system = `你在帮真人准备今天要不要发的 Reddit 帖子备选。输出严格 JSON，不要 markdown。
格式：
{"sub":"macapps","titles":["标题1","标题2"],"body":"正文","reason":"为何适合今天发"}
规则：
- 语言：${lang}
- sub 必须从给定列表选一个
- 标题像随手写，不要广告腔
- 正文有故事或具体现象，可带一个真诚问题；零推广零外链
- 人设：${settings.persona || '普通人'}`;

  const user = `可选 sub: ${subs.map((s) => `r/${s}`).join(', ')}
${recentHint ? `近期浏览提示: ${recentHint}` : ''}
请生成 1 份今日发帖备选。`;

  const raw = await chatCompletion({
    apiBase: settings.apiBase,
    apiKey: settings.apiKey,
    model: settings.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.95,
    maxTokens: 900,
  });

  return parseDailyJson(raw, subs);
}

/** @param {string} raw */
function parseAssistJson(raw) {
  const obj = extractJson(raw) || {};
  let draft = '';
  if (typeof obj.draft === 'string') draft = obj.draft.trim();
  else if (Array.isArray(obj.drafts) && obj.drafts[0]) draft = String(obj.drafts[0]).trim();

  const titleZh = String(obj.title_zh || obj.titleZh || '').trim();
  const bodyZh = String(obj.body_zh || obj.bodyZh || '').trim();
  const freshAngle = String(obj.fresh_angle || obj.freshAngle || '').trim();
  const coveredAnglesRaw = obj.covered_angles || obj.coveredAngles;
  const coveredAngles = Array.isArray(coveredAnglesRaw)
    ? coveredAnglesRaw.map(String).filter(Boolean).slice(0, 4)
    : [];
  let tips = [];
  if (Array.isArray(obj.tips)) tips = obj.tips.map(String).filter(Boolean).slice(0, 3);
  else if (typeof obj.tips === 'string' && obj.tips.trim()) tips = [obj.tips.trim()];

  return {
    draft,
    titleZh,
    bodyZh,
    freshAngle,
    coveredAngles,
    tips,
  };
}

/**
 * @param {string} raw
 * @param {string[]} subs
 */
function parseDailyJson(raw, subs) {
  const obj = extractJson(raw) || {};
  let sub = String(obj.sub || subs[0] || 'AskReddit').replace(/^r\//i, '');
  const allowed = subs.map((s) => s.replace(/^r\//i, '').toLowerCase());
  if (!allowed.includes(sub.toLowerCase()) && subs[0]) {
    sub = subs[0].replace(/^r\//i, '');
  }
  const titles = Array.isArray(obj.titles)
    ? obj.titles.map(String)
    : [String(obj.title || '今日随想')];
  return {
    sub,
    titles: titles.slice(0, 2),
    body: String(obj.body || ''),
    reason: String(obj.reason || ''),
  };
}

/** @param {string} raw */
function extractJson(raw) {
  const s = String(raw || '').trim();
  try {
    return JSON.parse(s);
  } catch {
    /* continue */
  }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  return null;
}

/** @param {string} s @param {number} n */
function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}
