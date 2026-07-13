import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const require = createRequire(import.meta.url);
const searchPaths = [root, ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)];
let playwrightPath;
try {
  playwrightPath = require.resolve('playwright', { paths: searchPaths });
} catch {
  throw new Error('生成商店素材需要 Playwright；可临时安装后运行本脚本');
}
const { chromium } = require(playwrightPath);
const outDir = path.join(root, 'docs', 'assets', 'store');
await mkdir(outDir, { recursive: true });

const server = createServer(async (req, res) => {
  const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = requestPath === '/' ? 'scripts/store-preview.html' : requestPath.slice(1);
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const data = await import('node:fs/promises').then(({ readFile }) => readFile(file));
    const ext = path.extname(file);
    const type = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : ext === '.png' ? 'image/png' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }).end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || defaultChromiumPath(),
});
const context = await browser.newContext({ colorScheme: 'dark', deviceScaleFactor: 1 });
await context.addInitScript({ content: chromeMock() });

const outputs = [
  ['overlay', 1280, 800, 'screenshot-overlay.png'],
  ['queue', 1280, 800, 'screenshot-queue.png'],
  ['daily', 1280, 800, 'screenshot-daily.png'],
  ['settings', 1280, 800, 'screenshot-settings.png'],
  ['promo-small', 440, 280, 'promo-small.png'],
  ['promo-marquee', 1400, 560, 'promo-marquee.png'],
];

try {
  for (const [scene, width, height, filename] of outputs) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    await page.goto(`http://127.0.0.1:${port}/scripts/store-preview.html?scene=${scene}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(scene === 'daily' ? 700 : 350);
    await page.screenshot({ path: path.join(outDir, filename), fullPage: false });
    await page.close();
    console.log(`已生成 docs/assets/store/${filename}`);
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

function chromeMock() {
  const queue = [
    { id: 'q1', status: 'new', titleZh: '怎样让效率系统保持有用，而不是变成另一份工作？', bodyZh: '楼主发现维护系统本身逐渐占用更多时间。', freshAngle: '区分维护成本与重新决策成本', commentsReviewed: 12, tips: ['给出一个具体删减动作'], draft: '我后来给系统加了一个很笨的规则：如果某个分类连续两周没帮我做决定，就直接删掉。真正累人的往往不是记录，而是每次都要重新判断该放哪里。', post: { id: 'q1', subreddit: 'productivity', recommendScore: 82, url: 'https://www.reddit.com/r/productivity/comments/q1/' } },
    { id: 'q2', status: 'later', titleZh: '哪个 Mac 小工具真正改变了你的日常工作流？', bodyZh: '寻找解决具体小问题、能长期保留的轻量工具。', draft: '对我来说关键不是功能多，而是能不能在两秒内用上。', post: { id: 'q2', subreddit: 'macapps', recommendScore: 78, url: 'https://www.reddit.com/r/macapps/comments/q2/' } },
    { id: 'q3', status: 'skipped', titleZh: '你后来才意识到应该更早学会的普通技能是什么？', post: { id: 'q3', subreddit: 'AskReddit', recommendScore: 64, url: 'https://www.reddit.com/r/AskReddit/comments/q3/' } },
  ];
  const daily = { date: '2026-07-13', status: 'pending', candidates: [
    { sub: 'macapps', title: '你真正长期留下来的小工具有什么共同点？', body: '我最近清理了一轮应用，发现留下来的反而都只解决一个很具体的问题。你们长期使用的小工具，最关键的特点是什么？', reason: '从真实清理经历切入，容易得到具体回答。' },
    { sub: 'productivity', title: '什么时候“减少步骤”反而让系统更难用了？', body: '我把一个流程砍得很短，结果每次都要重新想该怎么做。现在怀疑稳定规则比步骤少更重要。你们遇到过类似情况吗？', reason: '有明确矛盾点，适合经验讨论。' },
    { sub: 'AskReddit', title: '你一直保留的“笨办法”是什么？', body: '有些方法看起来不聪明，但因为随手就能做，最后比复杂系统更可靠。你有什么一直没换掉的笨办法？', reason: '问题简单但能引出个人故事。' },
  ]};
  const settings = { followEnabled: true, scoringMode: 'local', minScore: 58, apiBase: 'https://api.deepseek.com/v1', apiKey: 'sk-demo-not-real', aiDataConsent: true, model: 'deepseek-chat', language: 'zh', persona: '普通人，随口聊，不营销，有点具体经验', cruiseSpeed: 'normal' };
  return `
    globalThis.chrome = {
      storage: { onChanged: { addListener() {} }, local: { async get() { return {}; }, async set() {} } },
      runtime: {
        onMessage: { addListener() {} },
        async sendMessage(message) {
          if (message.type === 'RRH_GET_SETTINGS') return { ok: true, settings: ${JSON.stringify(settings)} };
          if (message.type === 'RRH_GET_QUEUE') return { ok: true, queue: ${JSON.stringify(queue)}, pending: 2 };
          if (message.type === 'RRH_ENSURE_DAILY') return { ok: true, post: ${JSON.stringify(daily)} };
          if (message.type === 'RRH_SAVE_SETTINGS') return { ok: true, settings: ${JSON.stringify(settings)} };
          return { ok: true };
        }
      },
      tabs: { async query() { return [{ id: 1, url: 'https://www.reddit.com/r/macapps/' }]; }, async sendMessage() { return { ok: true, cruiseOn: false }; } },
      scripting: { async executeScript() {}, async insertCSS() {} }
    };
  `;
}

function defaultChromiumPath() {
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return undefined;
}
