# Growth Context

*Last updated: 2026-07-14*

## Product
- **Name:** Reddit 协作回复助手
- **One-liner:** 面向中文用户的 Reddit 人机协作回复浏览器扩展
- **What it does:** 在用户浏览 Reddit 时从当前页面发现值得参与的帖子，提供中文标题与摘要、回复提醒、新角度、单条可编辑草稿和待办队列。详情页最多参考 24 条当前已加载的可见评论以减少观点重复。评论与发帖编辑器支持中译英，但最终修改与发送始终由用户完成。
- **Category:** Chrome / Edge Reddit 回复助手、中文理解与写作辅助浏览器扩展

## Platform & distribution
- **Platform / requirements:** Chrome 116+、Microsoft Edge 116+，Manifest V3
- **How it ships / installs:** 当前从 GitHub 仓库克隆源码，或下载仓库源码压缩包后，以“加载已解压的扩展程序”方式安装；尚未创建公开 GitHub Release，也未在 Chrome Web Store 或 Microsoft Edge Add-ons 上架
- **Updates:** 源码安装版本需要拉取最新提交或重新下载源码，再到扩展管理页重新加载；未来商店版本的更新方式以上架后的实际规则为准
- **Repo:** https://github.com/EvilIrving/reddit-reply-helper
- **Site:** https://evilirving.github.io/reddit-reply-helper/

## Pricing model
- 免费开源，MIT License。AI 功能使用用户自己的 DeepSeek API Key，第三方 API 费用由用户与服务商结算。

## Audience
- **Who it's for:** 希望用中文高效参与 Reddit 真实讨论，并保留最终编辑与发送控制权的用户
- **Why they reach for it:** 手动刷帖、判断回复价值、理解英文上下文和准备不重复回复耗时，希望在同一浏览路径内完成发现、理解、起草与待办管理

## Differentiators (ranked, all true)
- 不限固定 subreddit，跟随当前 Reddit 列表滚动增量发现候选
- 详情页最多参考 24 条当前已加载的可见评论，归纳已有方向并提供避重新角度
- 中文标题、摘要、提醒、单条草稿、待办与编辑器中译英集中在浏览器扩展内
- 不自动评论、发帖或投票，只在空编辑器中安全回填并由用户手动发送
- 无 Key、未同意数据发送或 AI 失败时，仍可使用本地评分、队列与模板
- 设置、Key 与队列保存在浏览器本地，无分析统计、广告或维护者中转服务器

## Competitors / alternatives

当前不加入具体竞品。可描述的替代方式仅包括手动浏览 Reddit、单独使用翻译工具和通用 AI 对话工具。

## Channels
- **Where this audience is:** 暂不制定推广渠道；当前只维护 GitHub 仓库、GitHub Pages 与未来浏览器商店公开面
- **Languages to publish in:** 简体中文为主；扩展生成的 Reddit 内容可按设置使用中文或英文

## Voice
- **Tone:** 直接、具体、克制，开发者对用户，优先陈述真实功能与限制
- **Words to use / avoid:** 使用“发现、中文理解、回复角度、可编辑草稿、手动发送、本地存储、明确同意”；避免“全自动、涨粉、养号神器、一键发布、革命性、无缝、强大、最佳”

## Proof points (REAL only)

暂无公开安装量、评价、推荐语或可引用指标，不在公开文案中使用数字背书。

## Links
- **Social handles / accounts:** 暂无
- **Press / contact:** GitHub Issues 与 GitHub Security 私密漏洞报告
