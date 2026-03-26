/**
 * GET /api/farms/:farmId/weather — 天気情報取得
 */

import { requireAuth } from '../../../../lib/auth-helper.js';
import { getForecast } from '../../../../lib/weather-helper.js';
import { jsonResponse, errorResponse } from '../../../../lib/utils.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const farmId = params.farmId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const farm = await env.DB.prepare(
    'SELECT id, name, latitude, longitude, address FROM farms WHERE id = ? AND user_id = ?'
  ).bind(farmId, userId).first();

  if (!farm) return errorResponse('畑が見つかりません', 404);

  try {
    const data = await getForecast(farm, env);
    return jsonResponse(data);
  } catch (err) {
    console.error('天気取得エラー:', err);
    return errorResponse('天気情報の取得に失敗しました', 500);
  }
}
