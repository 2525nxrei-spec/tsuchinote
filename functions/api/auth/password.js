/**
 * PUT /api/auth/password — パスワード変更
 * 現在のパスワードを検証し、新しいパスワードに更新
 */

import { requireAuth } from '../../lib/auth-helper.js';
import { hashPassword, verifyPassword, jsonResponse, errorResponse } from '../../lib/utils.js';

/** ソルト生成 */
function generateSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPut(context) {
  const { request, env } = context;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const { current_password, new_password } = body;
  if (!current_password || !new_password) {
    return errorResponse('現在のパスワードと新しいパスワードは必須です');
  }

  if (new_password.length < 8) {
    return errorResponse('新しいパスワードは8文字以上で設定してください');
  }

  // 英数字混在チェック（推奨）
  if (!/[a-zA-Z]/.test(new_password) || !/[0-9]/.test(new_password)) {
    return errorResponse('パスワードは英字と数字の両方を含めてください');
  }

  // 現在のパスワードを検証
  const user = await env.DB.prepare(
    'SELECT id, password_hash, salt FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    return errorResponse('ユーザーが見つかりません', 404);
  }

  const isValid = await verifyPassword(current_password, user.password_hash, user.salt);
  if (!isValid) {
    return errorResponse('現在のパスワードが正しくありません', 401);
  }

  // 新しいパスワードでハッシュ生成
  const newSalt = generateSalt();
  const newHash = await hashPassword(new_password, newSalt);

  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, salt = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(newHash, newSalt, userId).run();

  return jsonResponse({ message: 'パスワードを変更しました' });
}
