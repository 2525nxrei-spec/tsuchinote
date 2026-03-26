/**
 * PUT /api/farms/:farmId/records/:recordId/complete — 完了フラグトグル
 */

import { requireAuth } from '../../../../../lib/auth-helper.js';
import { jsonResponse, errorResponse } from '../../../../../lib/utils.js';

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const recordId = params.recordId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const record = await env.DB.prepare(
    'SELECT id, completed FROM work_logs WHERE id = ? AND user_id = ?'
  ).bind(recordId, userId).first();
  if (!record) return errorResponse('記録が見つかりません', 404);

  const newStatus = record.completed ? 0 : 1;
  await env.DB.prepare(
    'UPDATE work_logs SET completed = ? WHERE id = ?'
  ).bind(newStatus, recordId).run();

  return jsonResponse({ id: recordId, completed: !!newStatus });
}
