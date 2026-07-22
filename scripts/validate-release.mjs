import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const targets = ['chrome', 'edge', 'github'];
const forbidden = [/^\.git\//, /^scripts\//, /^docs\//, /^build\//, /\.DS_Store$/];

for (const target of targets) {
  const filename = `reddit-reply-helper-${target}-v${manifest.version}.zip`;
  const zipPath = path.join(root, 'releases', filename);
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((entry) => entry.replace(/^\.\//, ''));
  if (!entries.includes('manifest.json')) throw new Error(`${filename} 缺少 manifest.json`);
  for (const required of ['lib/prompts/reply.js', 'lib/prompts/post.js', 'lib/prompts/translate.js', 'lib/prompts/polish.js', 'lib/license.js']) {
    if (!entries.includes(required)) throw new Error(`${filename} 缺少发布文件：${required}`);
  }
  const leaked = entries.find((entry) => forbidden.some((pattern) => pattern.test(entry)));
  if (leaked) throw new Error(`${filename} 包含不应发布的文件：${leaked}`);

  const packedManifest = JSON.parse(
    execFileSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8' })
  );
  if (packedManifest.version !== manifest.version) {
    throw new Error(`${filename} 版本不一致`);
  }
  if (packedManifest.manifest_version !== 3) throw new Error(`${filename} 不是 MV3`);
  console.log(`产物通过：${filename}，${entries.length} 个条目`);
}
