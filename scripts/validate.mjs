import { readFile, access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const packageMeta = JSON.parse(await readFile('package.json', 'utf8'));

if (manifest.manifest_version !== 3) throw new Error('manifest_version 必须为 3');
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('version 必须为 x.y.z');
if (manifest.version !== packageMeta.version) throw new Error('manifest 与 package 版本必须一致');

const referenced = new Set([
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
]);

for (const entry of manifest.content_scripts || []) {
  for (const path of entry.js || []) referenced.add(path);
  for (const path of entry.css || []) referenced.add(path);
}

for (const path of referenced) {
  if (!path) continue;
  await access(path, constants.R_OK);
}

const forbidden = [
  /AIza[0-9A-Za-z_-]{35}/,
  /sk-[A-Za-z0-9]{20,}/,
  /gh[opusr]_[A-Za-z0-9]{20,}/,
];
const files = [
  ...referenced,
  'manifest.json',
  'package.json',
  'README.md',
  'PRIVACY.md',
  'docs/index.html',
  'docs/privacy.html',
  'docs/privacy-edge.html',
  'docs/support.html',
  'docs/site.css',
  'release-docs/store-listing.md',
  'release-docs/release-checklist.md',
];
for (const path of files) {
  if (!path || /\.(png|jpg|jpeg|gif|webp)$/i.test(path)) continue;
  const content = await readFile(path, 'utf8');
  if (forbidden.some((pattern) => pattern.test(content))) {
    throw new Error(`${path} 可能包含硬编码密钥`);
  }
}

const jsFiles = (await walk('.')).filter((path) => path.endsWith('.js') && !path.includes('/build/') && !path.includes('/node_modules/'));
const networkFiles=[];
for (const path of jsFiles) {
  const content = await readFile(path, 'utf8');
  if (/\bfetch\b/.test(content) && !path.startsWith('tests/')) networkFiles.push(path);
  if (/reddit[^\n]{0,200}method\s*:\s*['"](?:POST|PUT|DELETE|PATCH)['"]/i.test(content) || /method\s*:\s*['"](?:POST|PUT|DELETE|PATCH)['"][^\n]{0,200}reddit/i.test(content)) throw new Error(`${path} 包含 Reddit 写请求`);
}
const allowedNetworkFiles=new Set(['lib/ai-client.js','lib/reddit-client.js']);
for(const path of networkFiles)if(!allowedNetworkFiles.has(path))throw new Error(`${path} 包含规格外网络请求`);
if ((manifest.host_permissions || []).some((origin) => !/^https:\/\/(?:www|old)\.reddit\.com\/\*$/.test(origin) && origin !== 'https://api.deepseek.com/*')) throw new Error('host_permissions 超出 Reddit 与默认 AI 服务范围');
if (JSON.stringify(manifest.optional_host_permissions || []) !== JSON.stringify(['https://*/*'])) throw new Error('optional_host_permissions 必须仅用于用户 AI Base URL');
if (/chrome\.notifications/.test(await readFile('background.js','utf8'))) throw new Error('监控不得发送系统通知');

async function walk(dir) {
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(['.git','.agents','.private','node_modules','build','releases'].includes(entry.name))continue;
    const path=`${dir}/${entry.name}`;
    if(entry.isDirectory())out.push(...await walk(path));else out.push(path.replace(/^\.\//,''));
  }
  return out;
}

console.log(`校验通过：manifest ${manifest.version}，${referenced.size} 个引用文件可读。`);
