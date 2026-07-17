# v1.0 Pro 验收核对报告

验收日期：2026-07-14

| # | 结果 | 验证方法 |
|---|---|---|
| 1 | 通过 | `scripts/validate.mjs` 扫描扩展源码，仅允许 `lib/ai-client.js` 与 `lib/reddit-client.js` 出现网络能力；Reddit 客户端强制 GET 和 `.json`，manifest 的安装期权限仅为两个 Reddit origin 与默认 AI origin。 |
| 2 | 通过 | `tests/core.test.mjs` 的“模板逐字一致”“三层 Prompt”“管线参数独立”测试；四份运行时模板是独立文件。 |
| 3 | 通过 | `tests/core.test.mjs` 用完全自定义覆写验证最终 system prompt 仍以 `SAFETY_RULES` 原文收尾。 |
| 4 | 通过 | `tests/core.test.mjs` 对四管线分别使用 OpenAI 兼容 mock，并覆盖纯 JSON、围栏、最外层对象提取和不可解析原文错误。 |
| 5 | 通过 | `tests/core.test.mjs` 覆盖 Free 20 条上限、Pro 状态边界、有效 Ed25519 验签及单字符篡改失败；手动检查侧栏可见的灰化入口、固定激活文案和激活后的 storage 即时刷新监听。 |
| 6 | 通过 | `tests/core.test.mjs` 覆盖 15 分钟最短间隔、每分钟六次调度计划、去重和 429 一小时退避；后台日志和监控项 `lastError` 可观察。 |
| 7 | 通过 | `sidepanel.js` 初始化时强制 `promo_mode=none`，并在 `banned + direct` 生成前执行阻断确认；生成请求再次读取并注入规则。 |
| 8 | 通过 | `tests/core.test.mjs` 执行全量导出、清空 storage、导入并比较 Persona 与待办数据；导入许可证会重新验签。 |
| 9 | 通过 | `tests/core.test.mjs` 覆盖 AI 500 的两次退避重试与断网错误；无 Key 在后台返回安静错误，DOM 读取和队列模块不依赖 AI 客户端。 |
| 10 | 通过 | `scripts/validate.mjs` 限定唯一网络实现文件，`scripts/validate-release.mjs` 检查最终 zip 的 manifest、私有文件和占位泄漏；发布包无远程脚本、SDK、字体或遥测。 |

最终自动命令 `npm run release` 通过，包含 12 个单测、源码静态校验、三套 zip 构建和发布包校验。
