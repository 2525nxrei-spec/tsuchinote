/**
 * ツチノート API — 認証モジュール
 * register / login / getProfile
 */

import { generateUlid, hashPassword, verifyPassword, createJwt, jsonResponse, errorResponse } from './index.js';

/** ソルト生成 */
function generateSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** JWT発行ヘルパー */
async function issueToken(user, secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    plan: user.plan,
    exp: now + 60 * 60 * 24 * 7, // 7日間有効
  };
  return createJwt(payload, secret);
}

/** POST /api/auth/register */
export async function handleRegister(request, env) {
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
  if (!env.JWT_SECRET) {
    return errorResponse('サーバー設定エラー: JWT_SECRETが未設定です', 500);
  }
  const secret = env.JWT_SECRET;
  const token = await issueToken(user, secret);

  return jsonResponse({ token, user }, 201);
}

/** POST /api/auth/login */
export async function handleLogin(request, env) {
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
  const token = await issueToken(user, secret);

  return jsonResponse({
    token,
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
  });
}

/** PUT /api/auth/profile */
export async function handleUpdateProfile(request, userId, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const { name } = body;
  if (!name) return errorResponse('name は必須です');

  await env.DB.prepare(
    'UPDATE users SET name = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).bind(name, userId).run();

  const updated = await env.DB.prepare(
    'SELECT id, email, name, plan FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!updated) return errorResponse('ユーザーが見つかりません', 404);

  return jsonResponse({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    plan: updated.plan,
  });
}

/** GET /api/auth/profile */
export async function handleGetProfile(userId, env) {
  const user = await env.DB.prepare(
    'SELECT id, email, name, plan, stripe_customer_id, created_at FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    return errorResponse('ユーザーが見つかりません', 404);
  }

  return jsonResponse({
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    hasStripe: !!user.stripe_customer_id,
    createdAt: user.created_at,
  });
}
