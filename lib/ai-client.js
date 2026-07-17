const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseJsonResponse(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }
  const error = new Error('服务返回的 JSON 无法解析');
  error.raw = raw;
  error.retryable = true;
  throw error;
}

export function buildChatCompletionsUrl(baseUrl) {
  const parsed = new URL(String(baseUrl || 'https://api.deepseek.com'));
  if (parsed.protocol !== 'https:') throw new Error('AI Base URL 必须使用 HTTPS');
  parsed.hash = '';
  parsed.search = '';
  const path = parsed.pathname.replace(/\/$/, '');
  parsed.pathname = `${path}${/\/v1$/.test(path) ? '' : '/v1'}/chat/completions`;
  return parsed.href;
}

export async function chatCompletion(config, request, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const wait = deps.sleep || sleep;
  const url = buildChatCompletionsUrl(config.baseUrl);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify(request), signal: controller.signal });
      if (!response.ok) {
        const message = (await response.text()).slice(0, 400);
        if (response.status === 400 && request.response_format) {
          const fallback = { ...request }; delete fallback.response_format;
          return chatCompletion(config, fallback, deps);
        }
        const error = new Error(`AI 服务错误 ${response.status}${message ? `：${message}` : ''}`);
        error.status = response.status;
        throw error;
      }
      const body = await response.json();
      const raw = body?.choices?.[0]?.message?.content || '';
      return { data: parseJsonResponse(raw), raw, usage: body.usage || {} };
    } catch (error) {
      lastError = error;
      if (!(error.status === 429 || error.status >= 500) || attempt === 2) throw error;
      await wait(600 * (2 ** attempt));
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}
