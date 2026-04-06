/**
 * POST /api/auth/register — ユーザー登録
 */

import { generateUlid, hashPassword, createJwt, jsonResponse, errorResponse, generateSalt } from '../../lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const { email, password, name } = body;
  if (!email || !password || !name) {
    return errorResponse('email, password, name は必須です');
  }

  // メールアドレス簡易バリデーション
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorResponse('メールアドレスの形式が正しくありません');
  }
  if (password.length < 8) {
    return errorResponse('パスワードは8文字以上にしてください');
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return errorResponse('パスワードは英字と数字の両方を含めてください');
  }
  if (name.length > 50) {
    return errorResponse('表示名は50文字以内にしてください');
  }

  // メールアドレス正規化
  const emailLower = email.toLowerCase().trim();

  // 重複チェック
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(emailLower).first();
  if (existing) {
    return errorResponse('このメールアドレスは既に登録されています', 409);
  }

  // ユーザー作成
  const id = generateUlid();
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, salt, name, plan, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'free', ?, ?)`
  ).bind(id, emailLower, passwordHash, salt, name, now, now).run();

  const user = { id, email: emailLower, name, plan: 'free' };
  if (!env.JWT_SECRET) {
    return errorResponse('サーバー設定エラー: JWT_SECRETが未設定です', 500);
  }
  const secret = env.JWT_SECRET;
  const jwtNow = Math.floor(Date.now() / 1000);
  const token = await createJwt({
    sub: user.id,
    email: user.email,
    plan: user.plan,
    exp: jwtNow + 60 * 60 * 24,
  }, secret);

  return jsonResponse({ token, user }, 201);
}
