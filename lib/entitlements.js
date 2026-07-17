export const PRO_MESSAGE = 'Pro 功能需要激活码。添加微信 heyiwuyi，任意方式付款后即刻发码。早鸟买断 ¥99（前 50 名，之后 ¥199），永久使用，含后续全部更新。无订阅、无账号、数据全在你本机。';

export function sanitizeState(input, pro) {
  const next = structuredClone(input);
  next.todos = Array.isArray(next.todos) ? next.todos : [];
  if (!pro) {
    next.todos = next.todos.slice(0, 20);
    next.monitors = [];
    next.products = [];
    next.sentReplies = [];
    next.persona = { name: '', background: '', voice: '', taboos: '' };
    next.settings ||= {};
    next.settings.promptOverrides = { reply: null, post: null, translate: null, polish: null };
  } else {
    next.products = (next.products || []).slice(0, 10);
    let activeFound = false;
    next.products.forEach((product) => {
      product.active = Boolean(product.active && !activeFound);
      activeFound ||= product.active;
    });
    if (!activeFound && next.products[0]) next.products[0].active = true;
  }
  return next;
}
