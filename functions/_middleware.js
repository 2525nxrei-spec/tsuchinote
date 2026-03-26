/**
 * ツチノート — グローバルミドルウェア
 * CORS処理 + エラーハンドリングを全APIルートに適用
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

/** ステータスに応じた親切なエラーメッセージ */
function friendlyErrorMessage(status) {
  switch (status) {
    case 400: return '入力内容に誤りがあります。内容を確認してもう一度お試しください。';
    case 401: return 'ログインが必要です。再度ログインしてください。';
    case 403: return 'この操作を行う権限がありません。';
    case 404: return 'お探しのデータが見つかりませんでした。';
    case 429: return 'リクエストが多すぎます。しばらく待ってからお試しください。';
    case 500: return 'サーバーで問題が発生しました。しばらくしてからもう一度お試しください。解決しない場合は support@tsuchinote.com までご連絡ください。';
    case 502: return 'サーバーが一時的に利用できません。しばらくしてからお試しください。';
    case 503: return 'サービスがメンテナンス中です。しばらくお待ちください。';
    default:  return '予期しないエラーが発生しました。ページを再読み込みしてお試しください。';
  }
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

    // エラーの種類に応じてステータスを判定
    const status = err.status || 500;
    const userMessage = friendlyErrorMessage(status);

    return withCors(new Response(
      JSON.stringify({
        ok: false,
        error: userMessage,
        // 開発環境でのみ詳細を出す（本番ではerr.messageは含めない）
        detail: process.env.NODE_ENV === 'development' ? err.message : undefined
      }),
      { status: status, headers: { 'Content-Type': 'application/json' } }
    ));
  }
}
