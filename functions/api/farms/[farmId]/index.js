/**
 * GET    /api/farms/:farmId — 畑詳細取得
 * PUT    /api/farms/:farmId — 畑更新
 * DELETE /api/farms/:farmId — 畑削除
 */

import { requireAuth } from '../../../lib/auth-helper.js';
import { jsonResponse, errorResponse } from '../../../lib/utils.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const farmId = params.farmId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const farm = await env.DB.prepare(
    'SELECT id, name, latitude, longitude, address, created_at FROM farms WHERE id = ? AND user_id = ?'
  ).bind(farmId, userId).first();

  if (!farm) return errorResponse('畑が見つかりません', 404);
  return jsonResponse(farm);
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const farmId = params.farmId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const existing = await env.DB.prepare(
    'SELECT id FROM farms WHERE id = ? AND user_id = ?'
  ).bind(farmId, userId).first();
  if (!existing) return errorResponse('畑が見つかりません', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const { name, latitude, longitude } = body;
  const address = body.address || body.location || null;
  await env.DB.prepare(
    `UPDATE farms SET
       name = COALESCE(?, name),
       latitude = COALESCE(?, latitude),
       longitude = COALESCE(?, longitude),
       address = COALESCE(?, address)
     WHERE id = ? AND user_id = ?`
  ).bind(name || null, latitude ?? null, longitude ?? null, address || null, farmId, userId).run();

  const updated = await env.DB.prepare(
    'SELECT id, name, latitude, longitude, address, created_at FROM farms WHERE id = ?'
  ).bind(farmId).first();

  return jsonResponse(updated);
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const farmId = params.farmId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const existing = await env.DB.prepare(
    'SELECT id FROM farms WHERE id = ? AND user_id = ?'
  ).bind(farmId, userId).first();
  if (!existing) return errorResponse('畑が見つかりません', 404);

  // 関連データを削除（作業記録 → 作物 → 提案 → 畑）
  await env.DB.prepare('DELETE FROM work_logs WHERE farm_id = ?').bind(farmId).run();
  await env.DB.prepare('DELETE FROM crops WHERE farm_id = ?').bind(farmId).run();
  await env.DB.prepare('DELETE FROM suggestions WHERE farm_id = ?').bind(farmId).run();
  await env.DB.prepare('DELETE FROM farms WHERE id = ? AND user_id = ?').bind(farmId, userId).run();

  return jsonResponse({ deleted: true });
}
