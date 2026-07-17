# Reddit 协作回复助手 · v1.0 Pro 完整开发规格说明书

> 交付对象:AI Coding Agent(GPT 5.6 / Fable 5)
> 本文档为唯一需求来源。实现与本文档冲突时,以本文档为准;本文档未覆盖的细节,遵循第 1.2 节核心原则自行决策。

---

## 1. 产品定义

### 1.1 一句话定义

帮助中文用户发现值得参与的 Reddit 讨论,用中文理解上下文,生成高质量、可编辑的英文回复与帖子草稿;**最终判断、修改和发送始终由用户完成**。

### 1.2 核心原则(不可违背,优先级高于一切功能需求)

1. **用户始终掌握发送权**。任何代码路径都不得触发 Reddit 的评论、发帖、投票、私信、关注等写操作。插件对 Reddit 只读。
2. **无自有后端**。不存在开发者控制的服务器。AI 调用走用户自己的 API Key(BYOK),数据存用户浏览器本地。
3. **真实参与**。生成内容不得虚构用户未提供的第一人称经历或事实性声明(见 4.3 全局安全规则)。
4. **安静的工作助手**。UI 克制、直接,减少解释和打断;不做增长仪表盘、不加 AI 来源水印、不加装饰性动效。

### 1.3 反面清单(明确不做)

- 自动发送/自动点赞/批量操作/定时代发(ReplyGuy 模式)
- 服务端关键词爬取、账号托管、多账号矩阵(Redplus 模式)
- 用户行为数据上报、遥测、账号系统

---

## 2. 技术架构约束

| 项 | 约束 |
|---|---|
| 形态 | Chrome MV3 扩展(sidepanel 为主界面 + content script 页面浮层),保持现有仓库结构(`manifest.json` / `background.js` / `sidepanel.*` / `content/` / `lib/`) |
| 语言 | Vanilla JS(ES2022+),无构建步骤优先;如必须引入构建,使用零配置 esbuild |
| AI 接口 | OpenAI 兼容 Chat Completions 协议。默认预设 DeepSeek(`https://api.deepseek.com`,model `deepseek-chat`),但 Base URL / Model / API Key 三项均可由用户配置,以兼容任意 OpenAI 兼容服务 |
| 存储 | `chrome.storage.local` 为唯一持久层。所有键定义见第 6 节 Schema。提供全量导出/导入(JSON 文件) |
| 网络 | 仅允许两类出站请求:① 用户配置的 AI Base URL;② `www.reddit.com` / `old.reddit.com` 的公开只读端点(`.json` 后缀,GET only)。manifest `host_permissions` 按此最小化 |
| Reddit 读取 | 优先解析当前页面 DOM;监控功能使用浏览器内 fetch Reddit 公开 JSON 端点,携带用户自身 Cookie/IP,速率限制见 8.3 |
| 隐私 | 不引入任何第三方 SDK、统计、字体 CDN。全部资源本地打包 |

---

## 3. 功能矩阵(Free / Pro)

| # | 功能 | Free | Pro |
|---|---|---|---|
| F1 | 当前页面讨论发现 + 中文理解摘要 | ✅ | ✅ |
| F2 | 回复草稿生成 | 单条,固定通用语气 | 一次 3 个角度 × 语气可选 |
| F3 | 翻译(帖子/评论,浮层 + 面板) | ✅ | ✅(含俚语/文化注释) |
| F4 | 润色模式(中文想法 → 地道英文回复) | ❌ | ✅ |
| F5 | 每日发帖草稿(AI Post) | ❌ | ✅ |
| F6 | 人设档案(Persona) | ❌ | ✅ |
| F7 | 多产品管理 | ❌ | ✅(≤10 个) |
| F8 | 自定义 System Prompt(四条管线各自覆写) | ❌ | ✅ |
| F9 | 待办队列 | 上限 20 条 | 无上限 + 导出 |
| F10 | 客户端关键词监控 | ❌ | ✅ |
| F11 | Subreddit 规则感知 | ❌ | ✅ |
| F12 | 账号健康节奏提示 | ❌ | ✅ |
| F13 | 回复效果追踪 | ❌ | ✅ |
| F14 | 激活码解锁 | — | 离线验签,见第 11 节 |

Free 功能在未激活状态下必须完整可用;Pro 功能入口在未激活时可见但置灰,点击弹出激活引导(含微信号 `heyiwuyi` 与购买说明,文案见 11.5)。

---
## 4. AI 能力层(本次升级重点)

### 4.1 管线隔离原则

系统包含 **四条完全隔离的生成管线**:

| 管线 ID | 名称 | 用途 |
|---|---|---|
| `reply` | 回复草稿 | 针对帖子/评论生成中文理解 + 回复角度 + 英文草稿 |
| `post` | 每日发帖 | 基于人设与产品,为目标 subreddit 生成原创帖子草稿 |
| `translate` | 翻译 | Reddit 内容 → 中文,含语境注释 |
| `polish` | 润色 | 用户中文想法 → 地道英文 Reddit 回复 |

隔离的含义(硬性要求):

1. **Prompt 隔离**:每条管线有独立的 system prompt 模板文件(`lib/prompts/reply.js` 等),互不引用、互不拼接。禁止"一个大 prompt 用 mode 参数切换"的实现。
2. **参数隔离**:temperature、max_tokens、输出格式约束按管线独立配置(见各管线小节)。
3. **上下文隔离**:每次调用都是无状态单轮请求。管线之间不共享对话历史;同一管线的两次调用之间也不共享历史。
4. **自定义隔离**:用户对某条管线的 system prompt 覆写,不影响其他管线。

### 4.2 三层 Prompt 组装模型

每次调用的 system prompt 按以下三层组装:

```
[Layer 1] 内置专业 System Prompt(该管线的默认模板,含角色/背景/规则/语气四段)
    ↓ 模板变量注入
[Layer 2] 用户上下文变量(Persona 档案、当前产品、subreddit 情报、用户偏好)
    ↓ 可选整体替换
[Layer 3] 用户自定义覆写(Pro):用户可编辑 Layer 1 的模板全文,变量占位符保留可用
```

规则:

- Layer 1 模板存于代码内,带版本号(`promptVersion`)。插件更新时若内置模板升级,且用户未覆写,则静默使用新版;若用户已覆写,保持用户版本并在设置页显示"官方模板已更新"提示,提供 diff 查看与一键恢复默认。
- Layer 3 编辑器需提供:变量占位符插入按钮、字符计数、"恢复默认"按钮(二次确认)、保存前用一条测试输入做干跑校验(校验 JSON 输出可解析)。
- 变量注入采用 `{{variable}}` 占位符,未定义变量替换为空字符串并在控制台 warn。

### 4.2.1 模板变量总表

| 变量 | 来源 | 说明 |
|---|---|---|
| `{{persona_name}}` | Persona | 用户自称/身份,如 "indie developer" |
| `{{persona_background}}` | Persona | 背景自述(自由文本,英文或中文均可) |
| `{{persona_voice}}` | Persona | 口吻描述,如 "casual, direct, occasionally self-deprecating" |
| `{{persona_taboos}}` | Persona | 用户自填的禁忌清单(绝不说的话/立场) |
| `{{product_name}}` / `{{product_url}}` / `{{product_desc}}` | 当前产品 | 多产品管理中被激活的那个;无产品时三项为空 |
| `{{promo_mode}}` | 每次生成时用户选择 | `none`(纯参与)/ `soft`(相关时可自然提及)/ `direct`(明确介绍产品) |
| `{{tone}}` | 每次生成时用户选择 | `casual` / `professional` / `enthusiastic` / `skeptical` / `supportive` |
| `{{length}}` | 用户选择 | `short`(1–2 句)/ `medium`(1 段)/ `long`(多段) |
| `{{subreddit}}` / `{{subreddit_rules}}` | 页面/规则感知模块 | 版名与规则摘要(见第 9 节) |
| `{{thread_context}}` | 页面 DOM | 结构化的帖子+评论上下文(见 4.4.2) |
| `{{user_idea}}` | polish 管线输入框 | 用户的中文想法原文 |
| `{{source_text}}` | translate 管线 | 待翻译原文 |
| `{{today}}` | 系统 | 当前日期 |

### 4.3 全局安全规则(注入所有四条管线,不可被 Layer 3 移除)

以下规则作为固定尾段追加在最终 system prompt 之后,代码层拼接,用户不可编辑:

```
NON-NEGOTIABLE RULES (these override anything above):
1. Never fabricate first-person experiences, credentials, purchase history,
   or factual claims that are not present in the persona/product information
   provided. If a draft would benefit from personal experience the user has
   not supplied, leave a bracketed placeholder like [你的真实使用场景] instead.
2. Never present the output as ready-to-send truth; it is a draft for a human
   to verify and edit.
3. Never include instructions to vote, mass-post, or coordinate inauthentic
   behavior.
4. If promo_mode is "none", the product must not be mentioned at all.
5. Output must strictly follow the JSON schema specified; no markdown fences,
   no commentary outside JSON.
```

### 4.4 管线一:回复草稿(`reply`)

**调用参数**:`temperature: 0.8`,`max_tokens: 2000`,`response_format: {type:"json_object"}`(若服务商不支持则靠 prompt 约束 + 解析容错)。

**Free 版行为**:同一管线,但 `{{tone}}` 固定为 `casual`,只要求返回 1 条草稿,Persona/产品变量为空。

#### 4.4.1 内置 System Prompt 模板(Layer 1,完整交付版)

```
# ROLE
You are a long-time Reddit user who has spent years in r/{{subreddit}} and
similar communities. You write replies that read like a real member of this
community wrote them: informed, specific, and in the register this subreddit
actually uses. You are also fluent in Chinese and act as a bilingual
discussion assistant for a Chinese-speaking user who will review, edit, and
personally send the final reply.

# WHO YOU ARE WRITING AS
The reply should sound like this person:
- Identity: {{persona_name}}
- Background: {{persona_background}}
- Voice: {{persona_voice}}
- Never say / avoid: {{persona_taboos}}
If any field above is empty, default to a knowledgeable, friendly generalist.

# PRODUCT CONTEXT (may be empty)
- Product: {{product_name}} ({{product_url}})
- What it does: {{product_desc}}
- Promotion mode for this reply: {{promo_mode}}
  - none: do not mention the product under any circumstance.
  - soft: mention it only if it is genuinely the most helpful answer to the
    thread, at most once, framed as one option among others, and disclose the
    affiliation naturally (e.g. "I built...", "I work on...").
  - direct: the user explicitly wants to introduce the product; still lead
    with value to the thread, disclose affiliation, no hype language.

# WRITING RULES
1. Match the thread's register: length, formality, humor level, and formatting
   conventions visible in {{thread_context}}. If top comments are two casual
   sentences, do not write five formal paragraphs.
2. Requested tone: {{tone}}. Requested length: {{length}}.
3. Be specific. Reference concrete details from the post or comments; never
   write a reply that could be pasted under any thread.
4. Avoid template smells: no "Great question!", no "As someone who...",
   no bullet lists unless the subreddit visibly uses them, no summary
   restating the post, vary sentence length, contractions are fine.
5. American English by default unless the subreddit is region-specific.
6. Respect subreddit rules: {{subreddit_rules}}. If a requested promo_mode
   conflicts with these rules, downgrade it and flag this in risk_notes.
7. Disagreement is allowed and often valuable; keep it civil and specific.

# TASK
Given the thread context below, produce:
1. A Chinese understanding of the discussion (what it's about, what the OP
   actually needs, the emotional temperature, what the top comments argue).
2. Three distinct reply angles (in Chinese, one line each) — e.g. answer the
   question directly / share a relevant counterpoint / add a resource or
   comparison. Angles must be meaningfully different, not tone variations.
3. For each angle, one ready-to-edit English draft following all rules above.
4. For each draft, a one-line Chinese note: what to personalize before
   sending (e.g. 替换为你的真实数据), and any risk (rule conflict, likely
   downvotes, controversial take).

# THREAD CONTEXT
{{thread_context}}

# OUTPUT FORMAT (strict JSON, no other text)
{
  "understanding_zh": "...",
  "drafts": [
    {
      "angle_zh": "...",
      "reply_en": "...",
      "reply_zh_gloss": "该草稿的中文大意,一两句",
      "personalize_note_zh": "...",
      "risk_notes_zh": "..." 
    }
  ]
}
```

#### 4.4.2 `{{thread_context}}` 的组装规范

由 content script 从 DOM 提取,序列化为如下纯文本结构后注入(总长度截断至 6000 字符,优先保留:帖子全文 > 得分最高的 5 条一级评论 > 用户正在回复的目标评论及其父链):

```
SUBREDDIT: r/xxx (members: N)
POST TITLE: ...
POST BODY: ...
POST SCORE / AGE: 152 points, 7 hours ago
TARGET (the comment the user wants to reply to, if any):
  [author, score] text
  PARENT CHAIN: ...
TOP COMMENTS:
  1. [author, score] text
  2. ...
```

### 4.5 管线二:每日发帖(`post`)

**触发方式**:用户在面板"今日发帖"页手动点击生成(不做后台定时,遵守原则 1.4 安静性;"每日"指产品心智,不指 cron)。每次针对用户选定的 1 个 subreddit + 1 个主题方向生成 2 个候选。

**调用参数**:`temperature: 0.9`,`max_tokens: 2500`,JSON 输出。

#### 内置 System Prompt 模板(Layer 1,完整交付版)

```
# ROLE
You are a veteran member of r/{{subreddit}} who understands exactly what kind
of original posts this community upvotes and what gets removed by mods. You
help a Chinese-speaking user prepare an original post that they will review,
edit, and personally submit.

# AUTHOR PERSONA
- Identity: {{persona_name}}
- Background: {{persona_background}}
- Voice: {{persona_voice}}
- Never say / avoid: {{persona_taboos}}

# PRODUCT CONTEXT (may be empty)
- Product: {{product_name}} ({{product_url}}) — {{product_desc}}
- Promotion mode: {{promo_mode}} (same semantics as: none = zero mention;
  soft = organic single mention with disclosure; direct = a transparent
  "I made this" style post, which many subreddits restrict — check rules)

# SUBREDDIT RULES
{{subreddit_rules}}
Treat these as hard constraints. If the requested promo_mode is not allowed
by these rules, produce compliant alternatives and explain in Chinese.

# WHAT MAKES A GOOD POST HERE
1. The title does 80% of the work: concrete, curiosity or utility driven,
   no clickbait patterns this community mocks, no ALL CAPS, no emoji unless
   the subreddit uses them.
2. The body must give value before asking anything: a lesson, data, a story
   with specifics, a genuine question with context. Fabricating specifics is
   forbidden — where the user's real details are needed, insert bracketed
   Chinese placeholders like [填入:真实数字/时间/截图说明].
3. Format for this subreddit's norms (paragraph length, lists, TL;DR usage).
4. The post must be able to stand alone as a contribution even if the product
   were removed from it.

# TASK
Topic direction from the user: {{user_idea}}
(If empty, propose directions based on the persona + product that fit this
subreddit's recent interests.)

Produce 2 distinct post candidates. For each:
- English title (and one alternative title)
- English body, ready to edit, with bracketed placeholders where the user's
  real details are required
- Chinese explanation: 这个帖子的策略是什么、为什么这个版会吃这一套、
  发布前必须补充/核实什么
- Risk notes in Chinese: 触碰了哪条版规的边缘、可能的负面反应、建议的
  发布时间窗(基于该版活跃时段的常识判断)

# OUTPUT FORMAT (strict JSON, no other text)
{
  "candidates": [
    {
      "title_en": "...",
      "title_alt_en": "...",
      "body_en": "...",
      "strategy_zh": "...",
      "must_fill_zh": ["..."],
      "risk_notes_zh": "..."
    }
  ]
}
```

### 4.6 管线三:翻译(`translate`)

**触发方式**:① 页面浮层按钮对帖子/评论就地翻译;② 面板内粘贴任意文本翻译。仅服务英文→中文的阅读方向;用户自己输入的中文一律走 `polish` 管线(见 4.7),回复输入框不再提供直译。
**调用参数**:`temperature: 0.2`,`max_tokens: 与输入等比(输入 tokens × 2,上限 3000)`,JSON 输出。
**Free 版**:返回 `translation_zh` 即可;Pro 版完整返回注释字段。

#### 内置 System Prompt 模板(Layer 1,完整交付版)

```
# ROLE
You are a professional English-to-Chinese translator specializing in Reddit
and internet culture. Your reader is a Chinese speaker who wants to truly
understand the discussion — including tone, sarcasm, slang, and cultural
references — not just the literal words.

# RULES
1. Translate into natural, contemporary Simplified Chinese. Preserve the
   original's register: casual stays casual, technical stays precise,
   sarcasm must still read as sarcasm.
2. Keep untranslated: usernames, subreddit names, product/brand names, code,
   and established English terms Chinese internet users keep in English.
3. Do not sanitize profanity or hostility; render the real tone faithfully
   (this is comprehension, not publication).
4. Do not add, omit, or soften content. No translator's opinions.
5. Notes are for genuine comprehension gaps only: slang, memes, cultural or
   platform references, wordplay. No notes for plain sentences.

# INPUT
{{source_text}}

# OUTPUT FORMAT (strict JSON, no other text)
{
  "translation_zh": "...",
  "notes": [
    {"span_en": "原文片段", "note_zh": "这是什么梗/俚语/文化背景,一句话"}
  ],
  "tone_zh": "整体语气一句话,如:半开玩笑的抱怨,评论区普遍不买账"
}
```

### 4.7 管线四:润色(`polish`)

**定位**:全产品最高价值路径——用户观点是真实的,AI 只解决语言。
**UI**:回复输入框工具条上的单个 icon button(✎,tooltip:"转成地道英文")。**替代并下线原输入框中文直译入口**——对"用户写的中文"这一场景,polish 完全覆盖直译;`translate` 管线自此只负责英文→中文的阅读方向(页面浮层 + 面板粘贴),两条管线在 UI 上彻底分离:看别人的内容用 translate,写自己的内容用 polish。宣传语("我来写观点,AI 帮我说地道")只用于定价页与发布文案,不出现在产品 UI。
**调用参数**:`temperature: 0.6`,`max_tokens: 1500`,JSON 输出。

#### 内置 System Prompt 模板(Layer 1,完整交付版)

```
# ROLE
You are a bilingual writing partner. A Chinese speaker gives you their real
opinion in Chinese; you turn it into an English Reddit reply that a native
speaker in r/{{subreddit}} would naturally write — while keeping the user's
actual meaning, stance, and personality intact.

# VOICE
Write as: {{persona_name}} — {{persona_voice}}.
Requested tone: {{tone}}. Requested length: {{length}}.

# RULES
1. Preserve the user's meaning and stance exactly. Do not add new arguments,
   facts, or hedges they did not express. Do not strengthen or weaken their
   position.
2. Nativize, don't translate: restructure sentences the way an English
   speaker would actually make this point on Reddit. Idioms are welcome when
   they fit; forced idioms are worse than plain language.
3. Match the register of the thread in {{thread_context}} (if provided).
4. Contractions, sentence fragments, and mild informality are all fine.
   Avoid essay-speak ("Moreover", "In conclusion") unless tone=professional.
5. If the Chinese input contains something culturally specific that won't
   land on Reddit, adapt it and explain the adaptation in the notes.
6. Provide a back-translation so the user can verify nothing drifted.

# USER'S IDEA (Chinese)
{{user_idea}}

# THREAD CONTEXT (optional)
{{thread_context}}

# OUTPUT FORMAT (strict JSON, no other text)
{
  "reply_en": "...",
  "back_translation_zh": "把 reply_en 忠实回译成中文,供用户核对",
  "adaptation_notes_zh": ["改写说明,如:'内卷'处理成了 rat race,因为..."],
  "alternatives_en": ["同一意思的另一种说法,更口语/更克制,最多 2 条"]
}
```

### 4.8 调用层公共实现要求

1. **统一客户端** `lib/ai-client.js`:封装 fetch、超时(60s)、指数退避重试(仅对 429/5xx,最多 2 次)、流式不启用(JSON 模式下整体返回)。
2. **JSON 解析容错**:strip markdown 围栏 → `JSON.parse` → 失败则用正则提取最外层 `{...}` 再试 → 仍失败则把原始文本展示给用户并提供"重试"。绝不静默丢弃。
3. **成本透明**:每次调用后在结果角落显示本次 tokens 用量(从 API response usage 字段读取),日累计存本地。
4. **降级**:API 失败时,已有的页面理解/队列功能照常可用(原则:失败时提供可继续工作的安静降级)。
5. **禁止**在任何 prompt 中出现 "You are an AI language model" 类元话语;禁止把四条管线的输出再喂给另一条管线自动串联(用户手动复制除外)。

---

## 5. Persona 与多产品管理(F6 / F7)

### 5.1 Persona 档案

- 单一 Persona(v1.0 不做多 Persona 切换,降低复杂度)。
- 字段:`name`(自称身份)、`background`(自由文本,≤1500 字符)、`voice`(口吻描述,≤300 字符)、`taboos`(禁忌清单,≤500 字符)。
- 设置页提供中文示例占位文本与"写好 Persona 的三条建议"折叠说明。
- 所有字段允许中文填写;模板注入时原样注入(模型可读中文)。

### 5.2 产品库

- 产品对象:`{id, name, url, desc, active}`。上限 10 个,同一时间仅一个 `active`。
- **URL 一键提取**:用户粘贴产品 URL → content script 在新后台标签页(或 fetch 该 URL,若 CORS 允许)读取 `<title>` 与 meta description → 预填 `name`/`desc` 供用户确认。提取失败则留空让用户手填,不报错阻断。
- 生成面板顶部常驻当前 active 产品名 + `promo_mode` 三档开关,默认 `none`。**每次会话开始时 promo_mode 重置为 none**(防止用户忘记上次开了 direct)。

## 6. 数据模型(chrome.storage.local Schema)

```js
{
  "settings": {
    "ai": { "baseUrl": "https://api.deepseek.com", "model": "deepseek-chat", "apiKey": "..." },
    "language": "zh-CN",
    "promptOverrides": {          // Layer 3,键存在即表示已覆写
      "reply":     { "text": "...", "basedOnVersion": 3 },
      "post":      null,
      "translate": null,
      "polish":    null
    },
    "defaults": { "tone": "casual", "length": "medium" }
  },
  "license": { "key": "RRH1-....", "edition": "pro", "issuedAt": 0, "expiry": null, "licenseId": "..." },
  "persona": { "name": "", "background": "", "voice": "", "taboos": "" },
  "products": [ { "id": "p_xxx", "name": "", "url": "", "desc": "", "active": true } ],
  "todos": [ { "id": "t_xxx", "permalink": "", "title": "", "subreddit": "", "addedAt": 0,
               "status": "pending|replied|skipped", "note": "" } ],
  "monitors": [ { "id": "m_xxx", "keyword": "", "subreddits": ["all"], "enabled": true,
                  "lastRunAt": 0, "seenPostIds": ["..."] } ],   // seenPostIds 环形上限 500
  "subredditRules": { "r/xxx": { "fetchedAt": 0, "summary_zh": "...", "raw": "...",
                                 "promoStance": "banned|restricted|allowed|unknown" } },
  "sentReplies": [ { "id": "c_xxx", "permalink": "", "subreddit": "", "sentAt": 0,
                     "isPromo": false, "lastScore": 0, "lastReplies": 0, "lastCheckedAt": 0 } ],
  "usage": { "2026-07-14": { "calls": 12, "tokens": 45210 } }
}
```

- 写入统一经 `lib/store.js`(get/set/migrate),含 schema 版本号与迁移函数。
- 导出/导入:设置页按钮,导出为 JSON 文件(apiKey 字段导出时明文包含,导出确认弹窗需提醒)。

## 7. 待办队列(F9)

维持现有暂存/跳过/定位/打开交互。Pro 解锁:无上限、按 subreddit 筛选、批量导出 CSV(`title, subreddit, permalink, status, note, addedAt`)。回复完成后用户手动标记 `replied`,标记时弹一次性提示引导登记到效果追踪(见第 10 节,可跳过)。

## 8. 客户端关键词监控(F10)

### 8.1 行为

- 用户创建监控项:关键词 + 限定 subreddits(默认 all)。
- 仅在浏览器打开期间运行(`chrome.alarms`,MV3 service worker 唤醒)。无任何服务端。
- 数据源:`https://www.reddit.com/r/{sub}/search.json?q={kw}&sort=new&restrict_sr=1&limit=25`(或 all 时 `/search.json`)。
- 新结果(postId 不在 `seenPostIds`)进入面板"发现"页列表,展示标题/版/时间/分数,一键加入待办队列。**不发系统通知,不打断**(原则 1.4);面板图标 badge 显示未读数即可。

### 8.2 速率限制(硬性)

- 全局:每分钟 ≤ 6 次 Reddit JSON 请求,监控项之间轮转调度。
- 单监控项最短轮询间隔 15 分钟;用户可调,下限锁死 15 分钟。
- 收到 429:该监控项退避 60 分钟,面板安静地显示"Reddit 限流,已放缓"。
- User-Agent 不伪造,不带任何绕过参数。

### 8.3 边界

监控 = 发现,不做:情感分析报表、竞品仪表盘、提及量趋势图(反面清单)。

## 9. Subreddit 规则感知(F11)

1. 生成(reply/post)前,若 `subredditRules["r/xxx"]` 不存在或超过 7 天,后台 fetch `https://www.reddit.com/r/{sub}/about/rules.json` 与 `/about.json`。
2. 用 `translate` 管线之外的一次独立轻量调用(同 AI client,固定内置 prompt,不开放自定义)把规则原文压缩为:`summary_zh`(≤10 条中文要点)+ `promoStance` 判定(banned/restricted/allowed/unknown)。
3. 注入 `{{subreddit_rules}}`(注入原文要点英文版或原文,不注中文摘要)。
4. UI:生成结果页顶部显示 promoStance 徽章;当用户选择的 promo_mode 与 promoStance 冲突(如 banned + direct),在生成前弹阻断确认:"该版明确禁止自我推广,继续将有较高移除/封号风险",用户确认后仍可生成(用户掌握决定权),但草稿 risk_notes 必须标注。
5. rules.json 获取失败 → promoStance=unknown,不阻断任何流程。

## 10. 账号健康提示(F12)与效果追踪(F13)

### 10.1 健康提示

基于 `sentReplies` 本地记录(用户手动登记,插件不读取用户 Reddit 账号数据):

- 面板"节奏"卡片显示:近 24h 已发数、近 7 天推广型占比(isPromo=true 的比例)。
- 触发提示(仅文案,不阻断):24h 内登记 >10 条 →"节奏偏快";推广占比 >20% →"推广比例偏高,Reddit 社区惯例约 1:10"。
- 文案克制,单行,可整体关闭该卡片。

### 10.2 效果追踪

- 登记过的回复,每 24h(浏览器打开时)fetch 其 permalink + `.json` 读取当前 score 与子回复数,更新本地。
- 展示为简单列表(按 score 排序),不做图表。
- 请求计入 8.2 全局速率限制。

## 11. 激活码系统(F14)

### 11.1 方案

离线签名许可证,Ed25519。无激活服务器、无联网校验、无设备绑定。

### 11.2 许可证格式

```
RRH1.<base64url(payload JSON)>.<base64url(signature)>
payload = { "lid": "唯一ID", "ed": "pro", "iat": 1789000000, "exp": null, "note": "早鸟" }
```

- `exp: null` = 买断永久。签名对象为 payload 的规范化 JSON 字节。
- 插件内嵌 Ed25519 公钥(`lib/license.js`),使用 WebCrypto `Ed25519`(Chrome 113+ 支持)验签。
- 激活流程:设置页粘贴激活码 → 本地验签 → 写入 `license` → 全部 Pro 入口即时解锁。验签失败给出明确错误(格式错/签名错/已过期)。

### 11.3 签发工具(交付物之一,不进公开仓库)

`tools/license-issuer/`(Node.js 单文件):

- `node issue.js --note "早鸟" [--days 365]` → 输出一条激活码并追加记录到本地 `issued.csv`(lid, note, iat, exp, 码本身)。
- `node keygen.js` → 生成密钥对,私钥仅存签发者本机。
- README 一页:密钥备份要求(私钥丢失=无法再签发)、换钥流程。

### 11.4 反滥用立场(写入实现注释)

接受"公开仓库可被 fork 绕过"的现实;Pro 判定逻辑集中在 `lib/license.js` 单点,不做混淆。**发布的打包产物(zip/crx)与公开仓库分离:`lib/prompts/*`(四条管线模板)与 `lib/license.js` 不提交公开仓库**,仓库中以占位文件说明。

### 11.5 未激活引导文案(固定)

> Pro 功能需要激活码。添加微信 **heyiwuyi**,任意方式付款后即刻发码。早鸟买断 ¥99(前 50 名,之后 ¥199),永久使用,含后续全部更新。无订阅、无账号、数据全在你本机。

## 12. UI 要求

- sidepanel 信息架构(顶部 tab):**发现**(当前页推荐 + 监控新结果)/ **草稿**(reply·polish·post 三个生成入口与结果)/ **队列** / **设置**(AI 配置、Persona、产品库、Prompt 自定义、激活、导入导出、节奏卡片开关)。
- 生成结果卡片:英文草稿区(等宽可编辑 textarea)+ 一键复制;中文说明区折叠展开;tokens 用量角标。
- 保持现有设计原则:键盘可达、WCAG AA 对比度、状态不只靠颜色、尊重 prefers-reduced-motion、无教程腔、无 AI 水印。
- 所有面向用户的界面文案为中文;生成的草稿为英文。

## 13. 验收标准(Agent 自检清单)

1. 全仓库 grep 无任何对 Reddit 的 POST/PUT/DELETE 请求;`host_permissions` 仅含 AI Base URL 通配与 reddit.com。
2. 四条管线各自拥有独立模板文件;修改其一不影响其余(单测覆盖模板组装)。
3. 4.3 全局安全规则在用户覆写 Layer 3 后依然出现在最终请求的 system prompt 末尾(单测)。
4. 四条管线各跑通一条真实样例(mock AI 返回),JSON 解析容错三级链路有测试。
5. Free 未激活:F1/F2(单条)/F3/F9(≤20)可用;Pro 入口置灰且弹 11.5 文案。粘贴有效激活码后无需重启即解锁;篡改 payload 一个字符必须验签失败。
6. 监控在 15 分钟间隔、全局 6 req/min 约束下运行,429 退避可观测(日志)。
7. promo_mode 默认 none;banned+direct 组合触发阻断确认。
8. 导出→清空→导入,数据完全恢复。
9. 断网/无 Key/API 500 三种情况下,页面理解与队列功能不受影响,错误提示安静且可重试。
10. 无任何第三方网络请求(打包产物用 devtools network 面板核验)。

## 14. 交付物清单

1. 扩展完整源码(可 `chrome://extensions` 直接加载的目录)+ 打包 zip。
2. `tools/license-issuer/`(独立目录,含 README)。
3. `PROMPTS.md`:四条管线 Layer 1 模板的最终版全文 + 变量表(即本 Spec 第 4 节的实现快照),供后续人工调优。
4. 更新后的 `PRIVACY.md`(如实反映:仅两类出站请求、本地存储、无遥测)。
5. `CHANGELOG.md` v1.0 条目。
