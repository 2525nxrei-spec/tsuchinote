/**
 * POST /api/auth/register — ユーザー登録
 */

import { generateUlid, hashPassword, createJwt, jsonResponse, errorResponse } from '../../lib/utils.js';

/** ソルト生成 */
function generateSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
  if (password.length < 6) {
    return errorResponse('パスワードは6文字以上にしてください');
  }

  // 重複チェック
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
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
  ).bind(id, email, passwordHash, salt, name, now, now).run();

  const user = { id, email, name, plan: 'free' };
  const secret = env.JWT_SECRET || 'tsuchi-note-dev-secret';
  const jwtNow = Math.floor(Date.now() / 1000);
  const token = await createJwt({
    sub: user.id,
    email: user.email,
    plan: user.plan,
    exp: jwtNow + 60 * 60 * 24 * 7,
  }, secret);

  return jsonResponse({ token, user }, 201);
}
