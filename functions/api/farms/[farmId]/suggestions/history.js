/**
 * GET /api/farms/:farmId/suggestions/history — AI提案履歴取得
 */

import { requireAuth } from '../../../../lib/auth-helper.js';
import { jsonResponse, errorResponse } from '../../../../lib/utils.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const farmId = params.farmId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const farm = await env.DB.prepare(
    'SELECT id FROM farms WHERE id = ? AND user_id = ?'
  ).bind(farmId, userId).first();
  if (!farm) return errorResponse('畑が見つかりません', 404);

  const { results } = await env.DB.prepare(
    `SELECT date, items, weather_summary, created_at
     FROM suggestions WHERE user_id = ? AND farm_id = ?
     ORDER BY date DESC LIMIT 30`
  ).bind(userId, farmId).all();

  const parsed = (results || []).map(r => ({
    date: r.date,
    items: JSON.parse(r.items),
    weatherSummary: r.weather_summary,
    createdAt: r.created_at,
  }));

  return jsonResponse(parsed);
}
