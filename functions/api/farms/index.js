/**
 * GET  /api/farms — 畑一覧取得
 * POST /api/farms — 畑作成
 */

import { requireAuth } from '../../lib/auth-helper.js';
import { generateUlid, jsonResponse, errorResponse } from '../../lib/utils.js';

// プランごとの畑上限数
// プランごとの畑上限数（設定画面の比較表と一致させる: Free=1, Light=3, Pro=5）
const FARM_LIMITS = { free: 1, light: 3, pro: 5 };

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const { results } = await env.DB.prepare(
    'SELECT id, name, latitude, longitude, address, created_at FROM farms WHERE user_id = ? ORDER BY created_at'
  ).bind(userId).all();

  return jsonResponse(results || []);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId, userPlan } = auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const { name, latitude, longitude } = body;
  const address = body.address || body.location || null;
  if (!name) return errorResponse('畑の名前は必須です');

  // プラン制限チェック
  const limit = FARM_LIMITS[userPlan] || 1;
  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM farms WHERE user_id = ?'
  ).bind(userId).first();

  if (countResult.cnt >= limit) {
    return errorResponse(`現在のプラン（${userPlan}）では畑は${limit}つまでです。プランをアップグレードしてください。`, 403);
  }

  const id = generateUlid();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO farms (id, user_id, name, latitude, longitude, address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, name, latitude || null, longitude || null, address || null, now).run();

  return jsonResponse({ id, name, latitude, longitude, address, created_at: now }, 201);
}
