/**
 * POST /api/auth/login — ログイン
 */

import { verifyPassword, createJwt, jsonResponse, errorResponse } from '../../lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

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

  // ユーザー検索
  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, salt, name, plan FROM users WHERE email = ?'
  ).bind(email).first();

  if (!user) {
    return errorResponse('メールアドレスまたはパスワードが正しくありません', 401);
  }

  // パスワード検証
  const valid = await verifyPassword(password, user.password_hash, user.salt);
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
    exp: now + 60 * 60 * 24 * 7,
  }, secret);

  return jsonResponse({
    token,
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
  });
}
