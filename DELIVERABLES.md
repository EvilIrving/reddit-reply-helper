# v1.0 Pro 交付索引

## 变更文件树

```text
chrome-reddit-reply-helper/
├── manifest.json
├── background.js
├── sidepanel.html
├── sidepanel.css
├── sidepanel-v1.css
├── sidepanel.js
├── content/
│   ├── content.css
│   ├── content.js
│   ├── scrape.js
│   └── translate.js
├── lib/
│   ├── ai-client.js
│   ├── entitlements.js
│   ├── pipelines.js
│   ├── reddit-client.js
│   ├── store.js
│   ├── license.js
│   └── prompts/
│       └── {reply,post,translate,polish,safety,index}.js
├── scripts/
│   ├── package.mjs
│   ├── sync-spec-prompts.mjs
│   ├── validate.mjs
│   └── validate-release.mjs
├── tests/core.test.mjs
├── tools/license-issuer/
│   ├── keygen.js
│   ├── issue.js
│   └── README.md
├── SPEC.md
├── PROMPTS.md
├── DECISIONS.md
├── ACCEPTANCE.md
├── PRIVACY.md
├── CHANGELOG.md
└── releases/
    ├── reddit-reply-helper-chrome-v1.0.0.zip
    ├── reddit-reply-helper-edge-v1.0.0.zip
    └── reddit-reply-helper-github-v1.0.0.zip
```

旧版 `lib/analyze.js`、`lib/daily.js`、`lib/deepseek.js`、`lib/draft.js`、`lib/rss.js`、`lib/score.js`、`lib/settings.js`、`lib/subs.js` 与 `content/overlay.js` 已删除，避免遗留提示词、RSS 和旧生成路径进入 v1.0。

## 打包命令

仅重新打包使用 `npm run package`；执行单测、静态检查、打包与产物检查使用 `npm run release`。
