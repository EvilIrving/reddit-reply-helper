import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const spec = await readFile(path.join(root, 'SPEC.md'), 'utf8');
const definitions = [
  ['reply', '#### 4.4.1 内置 System Prompt 模板'],
  ['post', '#### 内置 System Prompt 模板'],
  ['translate', '#### 内置 System Prompt 模板(Layer 1,完整交付版)', '### 4.6 管线三'],
  ['polish', '#### 内置 System Prompt 模板(Layer 1,完整交付版)', '### 4.7 管线四'],
];

function fencedAfter(heading, after = '') {
  const offset = after ? spec.indexOf(after) : 0;
  const headingAt = spec.indexOf(heading, offset);
  if (headingAt < 0) throw new Error(`未找到 ${heading}`);
  const open = spec.indexOf('```', headingAt);
  const bodyStart = spec.indexOf('\n', open) + 1;
  const close = spec.indexOf('\n```', bodyStart);
  if (open < 0 || close < 0) throw new Error(`${heading} 缺少代码块`);
  return spec.slice(bodyStart, close);
}

const templates = Object.fromEntries(definitions.map(([id, heading, after]) => [id, fencedAfter(heading, after)]));
const safety = fencedAfter('### 4.3 全局安全规则');
const target = path.join(root, 'lib', 'prompts');
await mkdir(target, { recursive: true });

for (const [id, template] of Object.entries(templates)) {
  const source = `export const promptVersion = 3;\nexport const template = ${JSON.stringify(template)};\n`;
  await writeFile(path.join(target, `${id}.js`), source);
}
const safetySource = `export const SAFETY_RULES = ${JSON.stringify(safety)};\n`;
await writeFile(path.join(target, 'safety.js'), safetySource);

const indexSource = `import * as reply from './reply.js';\nimport * as post from './post.js';\nimport * as translate from './translate.js';\nimport * as polish from './polish.js';\nimport { SAFETY_RULES } from './safety.js';\n\nexport const PROMPTS = { reply, post, translate, polish };\nexport function assemblePrompt(pipeline, variables = {}, override = null) {\n  const source = override?.text ?? PROMPTS[pipeline]?.template;\n  if (!source) throw new Error(\`未知管线：\${pipeline}\`);\n  const rendered = source.replace(/{{([a-z_]+)}}/g, (_, key) => {\n    if (variables[key] == null) console.warn(\`[RRH] 未定义模板变量: \${key}\`);\n    return String(variables[key] ?? '');\n  });\n  return \`\${rendered.trim()}\\n\\n\${SAFETY_RULES}\`;\n}\n`;
await writeFile(path.join(target, 'index.js'), indexSource);

const varsStart = spec.indexOf('### 4.2.1 模板变量总表');
const varsEnd = spec.indexOf('### 4.3 全局安全规则', varsStart);
let snapshot = '# Prompt 实现快照\n\n';
snapshot += `${spec.slice(varsStart, varsEnd).trim()}\n\n`;
for (const [id, template] of Object.entries(templates)) snapshot += `## ${id}\n\n\`\`\`\n${template}\n\`\`\`\n\n`;
snapshot += `## 全局安全尾段\n\n\`\`\`\n${safety}\n\`\`\`\n`;
await writeFile(path.join(root, 'PROMPTS.md'), snapshot);
console.log('已从 SPEC.md 同步四条模板和全局安全尾段。');
