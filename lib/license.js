// Pro 判定集中于此。客户端代码可被修改绕过是已接受的产品边界，不做混淆。
export const PUBLIC_KEY_JWK = { kty: 'OKP', crv: 'Ed25519', x: 'BsMVzk67eC7Mu9LWyk44G63AqCGdL7X3kre5mL83pS8' };
const decode = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function verifyLicense(key, options = {}) {
  const parts = String(key || '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'RRH1') throw new Error('激活码格式错误');
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(decode(parts[1]))); } catch { throw new Error('激活码载荷损坏'); }
  const subtle = options.subtle || crypto.subtle;
  const publicKey = await subtle.importKey('jwk', options.publicKeyJwk || PUBLIC_KEY_JWK, { name: 'Ed25519' }, false, ['verify']);
  const ok = await subtle.verify('Ed25519', publicKey, decode(parts[2]), new TextEncoder().encode(canonicalJson(payload)));
  if (!ok) throw new Error('激活码签名无效');
  if (payload.ed !== 'pro') throw new Error('激活码版本不受支持');
  if (payload.exp && payload.exp * 1000 < (options.now ?? Date.now())) throw new Error('激活码已过期');
  return { key, edition: 'pro', issuedAt: payload.iat * 1000, expiry: payload.exp ? payload.exp * 1000 : null, licenseId: payload.lid };
}
export const isPro = (license) => license?.edition === 'pro' && (!license.expiry || license.expiry > Date.now());
