# Reddit 协作回复助手

一款面向 Chrome 与 Edge 的 MV3 浏览器扩展，在浏览 Reddit 时发现值得参与的帖子，提供中文摘要、回复提醒和一条可编辑草稿。所有帖子与评论都由用户自行决定并手动发送。

> 本项目是非官方工具，与 Reddit 或 DeepSeek 无隶属、赞助或背书关系。

[产品官网](https://evilirving.github.io/reddit-reply-helper/) · [安装说明](https://evilirving.github.io/reddit-reply-helper/install.html) · [隐私说明](https://evilirving.github.io/reddit-reply-helper/privacy.html) · [支持](https://evilirving.github.io/reddit-reply-helper/support.html)

## 功能

- 跟随页面滚动增量分析帖子，也可手动开启慢速巡航。
- 可在代码评分与 AI 原生评分之间切换；AI 模式批量理解帖子后给出推荐分，失败时自动回退代码评分。
- 在隔离的页内浮层展示中文标题、摘要、提醒和单条草稿。
- 进入帖子详情页后读取最多 24 条已加载的可见评论，生成避开已有观点的新角度与草稿。
- 在评论和发帖编辑器中一键把中文标题、正文翻译成自然英文并回填，不会自动发送。
- 支持跳过、暂存、定位、打开与复制，浮层打开时仍可继续分析。
- 使用用户自己的 DeepSeek API Key 生成内容，失败时静默回退到本地模板。
- 每次生成前动态读取 Reddit 左侧“最近访问”的 5 个 sub，每天生成 3 个完整发帖候选；可重新生成或标记使用，不会自动发布。
- 支持新版 Reddit、`old.reddit.com` 和浏览过的任意 subreddit。

## 安装

商店审核通过后会补充 Chrome Web Store 与 Microsoft Edge Add-ons 链接，当前可从 [GitHub Releases](https://github.com/EvilIrving/reddit-reply-helper/releases) 获取手动安装包。

1. 下载对应浏览器的 ZIP 并解压，或克隆本仓库。
2. 在 Chrome 或 Edge 扩展管理页打开开发者模式。
3. 选择“加载已解压的扩展程序”，指向解压目录或仓库根目录。
4. 点击扩展图标打开侧栏，按需填写 DeepSeek API Key。
5. 打开 Reddit 列表页并硬刷新一次，使 content script 生效。

扩展更新后需要在扩展管理页重新加载，并硬刷新已打开的 Reddit 页面。

## 使用方式

正常浏览并滚动 Reddit 列表，命中推荐后在轻量浮层中查看中文摘要、提醒与草稿。点击「写回复」会在详情页已有空编辑器时直接填入；从列表页使用时会进入帖子，并在你打开评论框后填入，最终仍由你检查和手动发送。

打开帖子详情页后，扩展会读取当前页面已经加载的可见评论，并重新分析该帖。DeepSeek 会先归纳已有观点，再给出一个尚未被充分表达的新角度和一条避重草稿；浮层与侧栏会显示实际参考的评论数量。折叠、尚未加载或需要继续展开的评论不会参与本次分析。

在 Reddit 评论框或发帖编辑器中填写中文后，点击工具栏的翻译图标即可回填自然英文；`old.reddit.com` 使用编辑器旁的「中译英」按钮。发帖标题与正文会先全部翻译成功再一起回填，失败时保留原文；翻译复用侧栏中的 DeepSeek 配置，扩展不会替你点击评论或发布。

页面右下角只保留一个带待办数量的「助手」入口；推荐浮层的全部操作直接显示，不使用「更多」折叠，也不提供重复的复制草稿动作。巡航与立即分析统一在侧栏控制，设置全部直接显示。每日发帖直接使用 Reddit 最近访问的 5 个 sub，这些 sub 不参与跟帖推荐或 AI 回复；复制标题、复制正文和标记使用都通过内容旁的图标完成。

## DeepSeek 与数据处理

默认 API Base 为 `https://api.deepseek.com/v1`，默认模型为 `deepseek-chat`。API Key、AI 数据发送同意状态、设置、队列和浏览记录保存在浏览器本地；只有在用户明确勾选同意后，AI 原生评分才会把一批待评估帖子的 subreddit、标题、部分正文、发布时间、互动数字和详情页已加载的可见评论发送到 DeepSeek，候选生成阶段还会发送详情页最多 24 条已加载的可见评论，用于评分、翻译、摘要、提醒、新角度与避重草稿；用户主动点击中译英时，编辑器文本也会发送到 DeepSeek。

项目维护者不运营中转服务器，也不接收这些数据。完整说明见 [隐私说明](PRIVACY.md)。

## 权限

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存本地设置、API Key、队列和使用记录 |
| `sidePanel` | 展示队列、每日备选与设置 |
| `activeTab`、`scripting` | 与当前 Reddit 页面交互 |
| Reddit 主机权限 | 读取当前页面帖子，并可读取 JSON/RSS 辅助数据 |
| DeepSeek 主机权限 | 使用用户配置的 API Key 发起 AI 请求 |

## 开发与校验

项目使用原生 JavaScript、HTML 与 CSS，运行扩展不需要安装依赖。提交前运行：

```bash
node scripts/validate.mjs
```

生成并检查 Chrome、Edge 与 GitHub 发布包：

```bash
npm run release
```

涉及页面脚本或界面的改动仍需在真实 Reddit 页面手动验证，包括新版页面与 `old.reddit.com`。

## 项目结构

```text
background.js          服务工作线程、分析管线与消息桥
content/               帖子与可见评论解析、浮层、编辑器中译英、滚动与巡航
lib/                   打分、AI、翻译、观点避重、草稿、队列与每日备选
sidepanel.*            队列、今日发帖与设置界面
scripts/validate.mjs   清单引用与敏感密钥校验
scripts/package.mjs    Chrome、Edge 与 GitHub 发布包
docs/                  GitHub Pages 官网、隐私与支持页面
release-docs/          商店文案、审核说明与发布材料
```

## 参与贡献

提交前请阅读 [贡献指南](CONTRIBUTING.md)、[行为准则](CODE_OF_CONDUCT.md) 与 [安全政策](SECURITY.md)。本项目不接受自动发帖、自动评论、自动投票、多账号互刷或垃圾营销功能。

## 许可证

本项目采用 [MIT License](LICENSE)。
