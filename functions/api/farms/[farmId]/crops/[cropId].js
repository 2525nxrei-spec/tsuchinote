/**
 * PUT    /api/farms/:farmId/crops/:cropId — 作物更新
 * DELETE /api/farms/:farmId/crops/:cropId — 作物削除
 */

import { requireAuth } from '../../../../lib/auth-helper.js';
import { jsonResponse, errorResponse } from '../../../../lib/utils.js';

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const cropId = params.cropId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const existing = await env.DB.prepare(
    'SELECT id FROM crops WHERE id = ? AND user_id = ?'
  ).bind(cropId, userId).first();
  if (!existing) return errorResponse('作物が見つかりません', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const { name, status, plantedAt, notes } = body;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE crops SET
       name = COALESCE(?, name),
       status = COALESCE(?, status),
       planted_at = COALESCE(?, planted_at),
       notes = COALESCE(?, notes),
       updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).bind(name || null, status || null, plantedAt || null, notes || null, now, cropId, userId).run();

  return jsonResponse({ updated: true });
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const cropId = params.cropId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const existing = await env.DB.prepare(
    'SELECT id FROM crops WHERE id = ? AND user_id = ?'
  ).bind(cropId, userId).first();
  if (!existing) return errorResponse('作物が見つかりません', 404);

  await env.DB.prepare('DELETE FROM work_logs WHERE crop_id = ?').bind(cropId).run();
  await env.DB.prepare('DELETE FROM crops WHERE id = ? AND user_id = ?').bind(cropId, userId).run();

  return jsonResponse({ deleted: true });
}
