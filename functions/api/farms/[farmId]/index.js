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
  const address = body.address !== undefined ? body.address : (body.location !== undefined ? body.location : undefined);

  // 各フィールドをundefined（未指定）の場合は現在値を維持、null指定時はクリア可能にする
  const sets = [];
  const binds = [];

  if (name !== undefined) { sets.push('name = ?'); binds.push(name); }
  if (latitude !== undefined) { sets.push('latitude = ?'); binds.push(latitude); }
  if (longitude !== undefined) { sets.push('longitude = ?'); binds.push(longitude); }
  if (address !== undefined) { sets.push('address = ?'); binds.push(address); }

  if (sets.length === 0) {
    return errorResponse('更新するフィールドが指定されていません');
  }

  binds.push(farmId, userId);
  await env.DB.prepare(
    `UPDATE farms SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`
  ).bind(...binds).run();

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
