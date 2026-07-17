import { assemblePrompt } from './prompts/index.js';
import { chatCompletion } from './ai-client.js';

export const PIPELINE_PARAMS = Object.freeze({
  reply: { temperature: 0.8, max_tokens: 2000 },
  post: { temperature: 0.9, max_tokens: 2500 },
  translate: { temperature: 0.2, max_tokens: 3000 },
  polish: { temperature: 0.6, max_tokens: 1500 },
});
export function buildPipelineRequest(type, context, state, isPro = false) {
  if (!PIPELINE_PARAMS[type]) throw new Error('未知生成管线');
  const override = isPro ? state.settings?.promptOverrides?.[type] : null;
  const system = assemblePrompt(type, context, override);
  const params = { ...PIPELINE_PARAMS[type] };
  if (type === 'translate') params.max_tokens = Math.min(3000, Math.max(300, Math.ceil(String(context.source_text || '').length / 4) * 2));
  return { model: state.settings.ai.model, messages: [{ role: 'system', content: system }, { role: 'user', content: type === 'translate' ? String(context.source_text || '') : 'Generate the requested JSON now.' }], ...params, response_format: { type: 'json_object' } };
}
export async function runPipeline(type, context, state, isPro = false, deps = {}) {
  const request = buildPipelineRequest(type, context, state, isPro);
  const result = await (deps.chatCompletion || chatCompletion)(state.settings.ai, request);
  if (!isPro && type === 'reply' && Array.isArray(result.data.drafts)) result.data.drafts = result.data.drafts.slice(0, 1);
  return result;
}
