/**
 * ツチノート — 共通ユーティリティ
 * Pages Functions 用
 */

/** ULID生成（簡易実装 — crypto.getRandomValues使用） */
export function generateUlid() {
  const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const now = Date.now();
  let id = '';
  // タイムスタンプ部 (10文字)
  let t = now;
  for (let i = 9; i >= 0; i--) {
    id = ENCODING[t % 32] + id;
    t = Math.floor(t / 32);
  }
  // ランダム部 (16文字)
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    id += ENCODING[b % 32];
  }
  return id;
}

/** PBKDF2 SHA-256 パスワードハッシュ（100,000回イテレーション） */
export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 旧方式SHA-256ハッシュ（互換用） */
async function hashPasswordLegacy(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(password + salt);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** パスワード検証（タイミングセーフ比較、旧SHA-256互換モード付き） */
export async function verifyPassword(password, hash, salt) {
  // まずPBKDF2で検証
  const computed = await hashPassword(password, salt);
  if (computed.length === hash.length) {
    let result = 0;
    for (let i = 0; i < computed.length; i++) {
      result |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
    }
    if (result === 0) return true;
  }
  // PBKDF2で不一致の場合、旧SHA-256方式で検証（既存ユーザー互換）
  const legacy = await hashPasswordLegacy(password, salt);
  if (legacy.length !== hash.length) return false;
  let legacyResult = 0;
  for (let i = 0; i < legacy.length; i++) {
    legacyResult |= legacy.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return legacyResult === 0;
}

/** JWT生成 (HS256) */
export async function createJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = new TextEncoder();

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const body = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${body}.${sigB64}`;
}

/** JWT検証 */
export async function verifyJwt(token, secret) {
  try {
    const [headerB64, payloadB64, sigB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !sigB64) return null;

    const enc = new TextEncoder();
    const body = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);

    // Base64URL → Base64
    const sigStr = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = sigStr + '='.repeat((4 - sigStr.length % 4) % 4);
    const sigBytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));

    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(body));
    if (!valid) return null;

    const payloadStr = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const payloadPadded = payloadStr + '='.repeat((4 - payloadStr.length % 4) % 4);
    const payload = JSON.parse(atob(payloadPadded));

    // 有効期限チェック
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

/** 成功レスポンス */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** エラーレスポンス */
export function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** ソルト生成（16バイトのランダムhex文字列） */
export function generateSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
