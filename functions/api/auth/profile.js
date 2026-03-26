/**
 * GET /api/auth/profile — プロフィール取得
 * PUT /api/auth/profile — プロフィール更新
 */

import { requireAuth } from '../../lib/auth-helper.js';
import { jsonResponse, errorResponse } from '../../lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

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
