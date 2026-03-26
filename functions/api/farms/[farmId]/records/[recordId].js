/**
 * PUT    /api/farms/:farmId/records/:recordId — 作業記録更新
 * DELETE /api/farms/:farmId/records/:recordId — 作業記録削除
 */

import { requireAuth } from '../../../../lib/auth-helper.js';
import { jsonResponse, errorResponse } from '../../../../lib/utils.js';

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const recordId = params.recordId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const existing = await env.DB.prepare(
    'SELECT id FROM work_logs WHERE id = ? AND user_id = ?'
  ).bind(recordId, userId).first();
  if (!existing) return errorResponse('記録が見つかりません', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const { content, date, cropId } = body;
  await env.DB.prepare(
    `UPDATE work_logs SET
       content = COALESCE(?, content),
       date = COALESCE(?, date),
       crop_id = COALESCE(?, crop_id)
     WHERE id = ? AND user_id = ?`
  ).bind(content || null, date || null, cropId || null, recordId, userId).run();

  return jsonResponse({ updated: true });
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const recordId = params.recordId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const existing = await env.DB.prepare(
    'SELECT id FROM work_logs WHERE id = ? AND user_id = ?'
  ).bind(recordId, userId).first();
  if (!existing) return errorResponse('記録が見つかりません', 404);

  await env.DB.prepare('DELETE FROM work_logs WHERE id = ?').bind(recordId).run();
  return jsonResponse({ deleted: true });
}
