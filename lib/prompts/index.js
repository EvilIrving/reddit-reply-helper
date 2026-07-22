import * as reply from './reply.js';
import * as post from './post.js';
import * as translate from './translate.js';
import * as polish from './polish.js';
import { SAFETY_RULES } from './safety.js';

export const PROMPTS = { reply, post, translate, polish };
export function assemblePrompt(pipeline, variables = {}, override = null) {
  const source = override?.text ?? PROMPTS[pipeline]?.template;
  if (!source) throw new Error(`未知管线：${pipeline}`);
  const rendered = source.replace(/{{([a-z_]+)}}/g, (_, key) => {
    if (variables[key] == null) console.warn(`[RRH] 未定义模板变量: ${key}`);
    return String(variables[key] ?? '');
  });
  return `${rendered.trim()}\n\n${SAFETY_RULES}`;
}
