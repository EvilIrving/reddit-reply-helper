# 贡献指南

感谢你改进 Reddit 协作回复助手。提交改动前，请先阅读本文件与 [行为准则](CODE_OF_CONDUCT.md)。

## 开发流程

1. Fork 仓库并从 `main` 创建主题分支。
2. 在 `chrome://extensions` 中打开开发者模式，选择“加载已解压的扩展程序”。
3. 修改后重新加载扩展，并硬刷新 Reddit 页面。
4. 运行 `node scripts/validate.mjs`，再手动验证受影响的功能。
5. 提交范围清晰的 Pull Request，说明动机、测试结果和界面改动截图。

## 产品边界

扩展不得自动发布评论、帖子或投票，不得加入多账号互刷、垃圾营销或绕过 Reddit 与 subreddit 规则的功能。API Key、队列和浏览记录默认只保存在浏览器本地；若改动数据流、权限或外部请求，必须同步更新 `PRIVACY.md` 与 README。

## 代码约定

项目当前使用原生 JavaScript、HTML 与 CSS，不需要构建步骤。保持改动聚焦，兼顾新版 Reddit 的 `shreddit-post` 与 `old.reddit.com`，浮层样式继续使用 Shadow DOM 隔离。

