/**
 * DELETE /api/auth/account — アカウント削除
 * パスワード確認後、ユーザーデータを完全削除
 */

import { requireAuth } from '../../lib/auth-helper.js';
import { verifyPassword, jsonResponse, errorResponse } from '../../lib/utils.js';

export async function onRequestDelete(context) {
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

  const { password } = body;
  if (!password) {
    return errorResponse('パスワードの入力が必要です');
  }

  // パスワード検証
  const user = await env.DB.prepare(
    'SELECT id, password_hash, salt, stripe_customer_id FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    return errorResponse('ユーザーが見つかりません', 404);
  }

  const isValid = await verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) {
    return errorResponse('パスワードが正しくありません', 401);
  }

  // 関連データの完全カスケード削除（子テーブルから順に削除）
  await env.DB.batch([
    env.DB.prepare('DELETE FROM work_logs WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM suggestions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM crops WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM farms WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);

  return jsonResponse({ message: 'アカウントを削除しました。ご利用ありがとうございました。' });
}
