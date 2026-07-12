# Reddit 协作回复助手

一款面向 Chrome 与 Edge 的 MV3 浏览器扩展，在浏览 Reddit 时发现值得参与的帖子，提供中文摘要、回复提醒和一条可编辑草稿。所有帖子与评论都由用户自行决定并手动发送。

> 本项目是非官方工具，与 Reddit 或 DeepSeek 无隶属、赞助或背书关系。

## 功能

- 跟随页面滚动增量分析帖子，也可手动开启慢速巡航。
- 在隔离的页内浮层展示中文标题、摘要、提醒和单条草稿。
- 支持跳过、暂存、定位、打开与复制，浮层打开时仍可继续分析。
- 使用用户自己的 DeepSeek API Key 生成内容，失败时静默回退到本地模板。
- 每天生成一份可弃用或重生的发帖备选，不会自动发布。
- 支持新版 Reddit、`old.reddit.com` 和浏览过的任意 subreddit。

## 安装

1. 下载或克隆本仓库。
2. 在 Chrome 或 Edge 扩展管理页打开开发者模式。
3. 选择“加载已解压的扩展程序”，指向仓库根目录。
4. 点击扩展图标打开侧栏，按需填写 DeepSeek API Key。
5. 打开 Reddit 列表页并硬刷新一次，使 content script 生效。

扩展更新后需要在扩展管理页重新加载，并硬刷新已打开的 Reddit 页面。

## 使用方式

正常浏览并滚动 Reddit 列表，命中推荐后在浮层中查看中文摘要、提醒与草稿。你可以定位原帖核对上下文，修改草稿后复制并手动发送，也可以跳过或先收进待办。

自动巡航默认关闭，可从页面右下角手动启动并随时停止。侧栏用于管理待办、查看每日发帖备选和调整推荐阈值、AI 次数上限、语言、人设与可选偏好 subreddit。

## DeepSeek 与数据处理

默认 API Base 为 `https://api.deepseek.com/v1`，默认模型为 `deepseek-chat`。API Key、设置、队列和浏览记录保存在 `chrome.storage.local`；配置 Key 后，候选帖子的 subreddit、标题、部分正文和互动数字会发送到 DeepSeek，用于生成翻译、摘要、提醒与草稿。

项目维护者不运营中转服务器，也不接收这些数据。完整说明见 [隐私说明](PRIVACY.md)。

## 权限

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存本地设置、API Key、队列和使用记录 |
| `sidePanel` | 展示队列、每日备选与设置 |
| `activeTab`、`scripting` | 与当前 Reddit 页面交互 |
| `alarms` | 定时检查每日发帖备选 |
| Reddit 主机权限 | 读取当前页面帖子，并可读取 JSON/RSS 辅助数据 |
| DeepSeek 主机权限 | 使用用户配置的 API Key 发起 AI 请求 |

## 开发与校验

项目使用原生 JavaScript、HTML 与 CSS，不需要安装依赖或构建。提交前运行：

```bash
node scripts/validate.mjs
```

涉及页面脚本或界面的改动仍需在真实 Reddit 页面手动验证，包括新版页面与 `old.reddit.com`。

## 项目结构

```text
background.js          服务工作线程、分析管线与消息桥
content/               DOM 解析、浮层、滚动与巡航
lib/                   打分、AI、草稿、队列与每日备选
sidepanel.*            队列、今日发帖与设置界面
scripts/validate.mjs   清单引用与敏感密钥校验
```

## 参与贡献

提交前请阅读 [贡献指南](CONTRIBUTING.md)、[行为准则](CODE_OF_CONDUCT.md) 与 [安全政策](SECURITY.md)。本项目不接受自动发帖、自动评论、自动投票、多账号互刷或垃圾营销功能。

## 许可证

本项目采用 [MIT License](LICENSE)。
