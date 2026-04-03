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

  // 各フィールドをundefined（未指定）の場合は現在値を維持、null指定時はクリア可能にする
  const sets = [];
  const binds = [];

  if (content !== undefined) { sets.push('content = ?'); binds.push(content); }
  if (date !== undefined) { sets.push('date = ?'); binds.push(date); }
  if (cropId !== undefined) { sets.push('crop_id = ?'); binds.push(cropId); }

  if (sets.length === 0) {
    return jsonResponse({ updated: true }); // 更新なし
  }

  binds.push(recordId, userId);
  await env.DB.prepare(
    `UPDATE work_logs SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`
  ).bind(...binds).run();

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
