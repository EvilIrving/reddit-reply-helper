# 发布检查表

## 版本与源码

- [ ] `manifest.json`、`package.json` 与更新日志版本一致。
- [ ] `main` 分支工作区干净，发布提交已经合并。
- [ ] 未提交 API Key、Cookie、账号内容或本地调试数据。
- [ ] 权限、主机范围和数据流与 `PRIVACY.md`、官网隐私页、商店表单一致。
- [ ] 商店文案没有安装量、排名、背书、上架状态或性能方面的虚构声明。

## 自动校验

```bash
npm run release
```

预期生成：

```text
releases/reddit-reply-helper-chrome-v0.4.0.zip
releases/reddit-reply-helper-edge-v0.4.0.zip
releases/reddit-reply-helper-github-v0.4.0.zip
```

- [ ] 三个 ZIP 均通过 `scripts/validate-release.mjs`。
- [ ] ZIP 根目录直接包含 `manifest.json`，没有多余的父目录。
- [ ] ZIP 不包含 `.git`、`docs`、`scripts`、`build`、测试数据或商店素材。
- [ ] ZIP 内所有 manifest 与侧栏 HTML 引用文件存在。
- [ ] `manifest_version` 为 3，版本号与标签一致。

## 浏览器手动冒烟

- [ ] Chrome 116+ 加载 Chrome 包，扩展图标可打开侧栏。
- [ ] Edge 116+ 加载 Edge 包，扩展图标可打开侧栏。
- [ ] 新版 Reddit 列表滚动可以发现候选，`old.reddit.com` 也能读取帖子。
- [ ] 浮层使用 Shadow DOM，按钮布局未被 Reddit 样式影响。
- [ ] 浮层关闭只关闭，不改变队列状态。
- [ ] 浮层打开时继续扫描，新推荐静默进入待办。
- [ ] 写回复只填入空编辑器，不覆盖已有输入，不自动发送。
- [ ] 巡航默认关闭，开始、停止和速度设置有效。
- [ ] 无 Key 或未同意 AI 数据发送时没有外部 AI 请求，本地路径可用。
- [ ] 填写测试 Key 并同意后，AI 评分、摘要、草稿与中译英可用。
- [ ] 撤回同意后立即停止后续 AI 请求，保留本地功能。
- [ ] 详情页显示实际参考的可见评论数，不宣称检查整帖。
- [ ] 每日 3 个候选可生成、重新生成、复制和标记使用，不自动发布。
- [ ] 扩展后台、内容脚本与侧栏控制台没有启动错误。

## 商店素材

- [ ] 图标清晰，Chrome 使用 128×128，Edge 上传至少 128×128 的方形图标。
- [ ] Chrome 至少上传 1 张 1280×800 截图，最多 5 张。
- [ ] Edge 截图使用 1280×800 或 640×480，最多 6 张。
- [ ] 小型宣传图为 440×280，大型宣传图为 1400×560。
- [ ] 截图来自当前版本真实界面，没有测试 Key、账号名、私密帖子或误导性状态。
- [ ] 官网、隐私页和支持页已经公开可访问，没有 404。
- [ ] Edge 提交使用 `privacy-edge.html`，Chrome 提交使用 `privacy.html`。

## Chrome Web Store

- [ ] 上传 `reddit-reply-helper-chrome-v0.4.0.zip`。
- [ ] 填写 `release-docs/store-listing.md` 中的中文名称、短描述、长描述与权限说明。
- [ ] 数据使用披露与隐私页一致，并填写公开隐私政策 URL。
- [ ] 选择“不使用远程代码”。
- [ ] 填写网站与支持 URL。
- [ ] 提交前再次确认产品不会自动发送、投票或绕过访问控制。

## Microsoft Edge Add-ons

- [ ] 上传 `reddit-reply-helper-edge-v0.4.0.zip`。
- [ ] 中文长描述不少于 250 个字符，并与 Chrome 文案事实一致。
- [ ] 填写单一用途、逐项权限说明、数据使用和隐私政策 URL。
- [ ] 选择“不使用远程代码”。
- [ ] 上传方形图标与至少一张当前版本截图。
- [ ] 审核备注说明无需测试账号，AI 功能需要审核人员自备 DeepSeek Key。

## GitHub Release

- [ ] 更新 `CHANGELOG.md`，把“未发布”内容归入当前版本。
- [ ] 创建并推送 `v0.4.0` 标签后，Release workflow 成功。
- [ ] GitHub Release 同时包含 Chrome、Edge 与 GitHub 三个 ZIP。
- [ ] Release notes 明确手动安装步骤、更新步骤、数据发送同意和已知限制。

## 发布后

- [ ] 在官网与 README 补充已审核通过的真实商店链接。
- [ ] 从公开链接重新安装一次商店版本。
- [ ] 检查商店页截图、隐私 URL、支持 URL 与版本号。
- [ ] 记录审核反馈并修正文案或代码，不绕过商店审核流程。
