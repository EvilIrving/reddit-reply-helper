import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const sourceManifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const packageMeta = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

if (sourceManifest.version !== packageMeta.version) {
  throw new Error(`manifest 版本 ${sourceManifest.version} 与 package 版本 ${packageMeta.version} 不一致`);
}

const targets = ['chrome', 'edge', 'github'];
const commonFiles = [
  'background.js',
  'sidepanel.html',
  'sidepanel.css',
  'sidepanel-v1.css',
  'sidepanel.js',
  'content/content.css',
  'content/content.js',
  'content/overlay.js',
  'content/scrape.js',
  'content/translate.js',
  'lib',
  'icons',
  'LICENSE',
  'PRIVACY.md',
];

const buildRoot = path.join(root, 'build', 'package');
const releaseRoot = path.join(root, 'releases');
await rm(buildRoot, { recursive: true, force: true });
await mkdir(buildRoot, { recursive: true });
await mkdir(releaseRoot, { recursive: true });

for (const target of targets) {
  const overlayPath = path.join(root, 'manifests', 'platforms', `${target}.json`);
  const overlay = JSON.parse(await readFile(overlayPath, 'utf8'));
  const manifest = { ...sourceManifest, ...overlay };
  const stage = path.join(buildRoot, target);
  await mkdir(stage, { recursive: true });

  for (const entry of commonFiles) {
    await mkdir(path.dirname(path.join(stage, entry)), { recursive: true });
    await cp(path.join(root, entry), path.join(stage, entry), {
      recursive: true,
      filter: (source) => path.basename(source) !== '.DS_Store',
    });
  }
  await writeFile(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await validateStage(stage, manifest);

  const filename = `reddit-reply-helper-${target}-v${manifest.version}.zip`;
  const zipPath = path.join(releaseRoot, filename);
  await rm(zipPath, { force: true });
  execFileSync('zip', ['-X', '-q', '-r', zipPath, '.'], { cwd: stage });
  console.log(`已生成 releases/${filename}`);
}

async function validateStage(stage, manifest) {
  const referenced = new Set([
    manifest.background?.service_worker,
    manifest.side_panel?.default_path,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
  ]);
  for (const script of manifest.content_scripts || []) {
    for (const file of script.js || []) referenced.add(file);
    for (const file of script.css || []) referenced.add(file);
  }

  const panelHtml = await readFile(path.join(stage, manifest.side_panel.default_path), 'utf8');
  for (const match of panelHtml.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)) {
    if (!/^(?:https?:|data:|\/)/.test(match[1])) referenced.add(match[1]);
  }

  for (const file of referenced) {
    if (!file) continue;
    await readFile(path.join(stage, file));
  }
  for (const required of ['lib/prompts/reply.js', 'lib/prompts/post.js', 'lib/prompts/translate.js', 'lib/prompts/polish.js', 'lib/prompts/safety.js', 'lib/prompts/index.js', 'lib/license.js']) {
    await readFile(path.join(stage, required));
  }
}
