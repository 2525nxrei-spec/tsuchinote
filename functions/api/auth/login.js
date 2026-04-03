/**
 * POST /api/auth/login — ログイン
 */

import { verifyPassword, createJwt, jsonResponse, errorResponse } from '../../lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse('リクエストボディが不正です');
    }

    const { email, password } = body;
    if (!email || !password) {
      return errorResponse('email と password は必須です');
    }

    // メールアドレス正規化
    const emailLower = email.toLowerCase().trim();

    // DB接続チェック
    if (!env.DB) {
      console.error('Login: env.DB が未定義です');
      return errorResponse('データベース接続エラー', 500);
    }

    // ユーザー検索
    let user;
    try {
      user = await env.DB.prepare(
        'SELECT id, email, password_hash, salt, name, plan FROM users WHERE email = ?'
      ).bind(emailLower).first();
    } catch (dbErr) {
      console.error('Login DB検索エラー:', dbErr.message, dbErr.stack);
      return errorResponse('データベースエラーが発生しました', 500);
    }

    if (!user) {
      return errorResponse('メールアドレスまたはパスワードが正しくありません', 401);
    }

    // パスワードハッシュ・ソルトの存在チェック
    if (!user.password_hash || !user.salt) {
      console.error('Login: password_hash または salt が null です。user_id:', user.id);
      return errorResponse('アカウントデータに問題があります。管理者にお問い合わせください。', 500);
    }

    // パスワード検証
    let valid;
    try {
      valid = await verifyPassword(password, user.password_hash, user.salt);
    } catch (pwErr) {
      console.error('Login パスワード検証エラー:', pwErr.message, pwErr.stack);
      return errorResponse('パスワード検証中にエラーが発生しました', 500);
    }

    if (!valid) {
      return errorResponse('メールアドレスまたはパスワードが正しくありません', 401);
    }

    if (!env.JWT_SECRET) {
      return errorResponse('サーバー設定エラー: JWT_SECRETが未設定です', 500);
    }
    const secret = env.JWT_SECRET;
    const now = Math.floor(Date.now() / 1000);
    const token = await createJwt({
      sub: user.id,
      email: user.email,
      plan: user.plan,
      exp: now + 60 * 60 * 24,
    }, secret);

    return jsonResponse({
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
    });
  } catch (err) {
    console.error('Login 未捕捉エラー:', err.message, err.stack);
    return errorResponse('ログイン処理中にエラーが発生しました', 500);
  }
}
