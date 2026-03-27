/**
 * ツチノート — グローバルミドルウェア
 * CORS処理 + セキュリティヘッダー + レート制限 + エラーハンドリング
 */

/** 許可するオリジン */
const ALLOWED_ORIGINS = [
  'https://tsuchinote.com',
  'http://localhost:8788',
];

/** CORSヘッダー付与 */
function withCors(response, origin) {
  const headers = new Headers(response.headers);
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** セキュリティヘッダーを付与 */
function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src https://js.stripe.com; connect-src 'self' https://api.stripe.com https://js.stripe.com");
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** インメモリレート制限（IP+パスベース、ログイン/登録用） */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX_AUTH = 10;
const RATE_LIMIT_MAX_GENERAL = 120;

function isRateLimited(ip, pathname) {
  const now = Date.now();
  const isAuthEndpoint = pathname.includes('/api/auth/login') || pathname.includes('/api/auth/register');
  const limit = isAuthEndpoint ? RATE_LIMIT_MAX_AUTH : RATE_LIMIT_MAX_GENERAL;
  const key = isAuthEndpoint ? `auth:${ip}` : `gen:${ip}`;

  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  if (entry.count > limit) return true;
  return false;
}

// 定期的に古いエントリをクリーンアップ（メモリリーク防止）
function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.start > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(key);
    }
  }
}

export async function onRequest(context) {
  const { request } = context;
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);

  // OPTIONS プリフライト
  if (request.method === 'OPTIONS') {
    return withCors(new Response(null, { status: 204 }), origin);
  }

  // レート制限チェック
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(clientIP, url.pathname)) {
    return withCors(
      new Response(JSON.stringify({ ok: false, error: 'リクエストが多すぎます。しばらく待ってからお試しください。' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
      origin
    );
  }

  // 定期クリーンアップ
  if (Math.random() < 0.01) cleanupRateLimit();

  try {
    const response = await context.next();

    // Webhookはストライプから直接呼ばれるのでCORS不要
    if (url.pathname === '/api/stripe/webhook') {
      return withSecurityHeaders(response);
    }

    return withSecurityHeaders(withCors(response, origin));
  } catch (err) {
    console.error('Unhandled error:', err);

    return withSecurityHeaders(withCors(new Response(
      JSON.stringify({
        ok: false,
        error: 'サーバーで問題が発生しました。しばらくしてからもう一度お試しください。',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    ), origin));
  }
}
