import { readFile, access } from 'node:fs/promises';
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

console.log(`校验通过：manifest ${manifest.version}，${referenced.size} 个引用文件可读。`);
