/**
 * ツチノート — グローバルミドルウェア
 * CORS処理を全APIルートに適用
 */

/** CORSヘッダー付与 */
function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', 'https://tsuchinote.com');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function onRequest(context) {
  // OPTIONS プリフライト
  if (context.request.method === 'OPTIONS') {
    return withCors(new Response(null, { status: 204 }));
  }

  try {
    const response = await context.next();
    return withCors(response);
  } catch (err) {
    console.error('Unhandled error:', err);
    return withCors(new Response(
      JSON.stringify({ ok: false, error: 'サーバー内部エラーが発生しました' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    ));
  }
}
