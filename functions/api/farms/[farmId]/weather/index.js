/**
 * GET /api/farms/:farmId/weather — 天気情報取得
 * プランに応じた予報日数制限: free=3日, light/pro=5日
 */

import { requireAuth } from '../../../../lib/auth-helper.js';
import { getForecast } from '../../../../lib/weather-helper.js';
import { jsonResponse, errorResponse } from '../../../../lib/utils.js';

/** プランごとの天気予報日数 */
const PLAN_FORECAST_DAYS = {
  free: 3,
  light: 5,
  pro: 5,
};

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
    // DBからプランを都度取得（修正2: JWTのplan同期問題対応）
    const userRow = await env.DB.prepare(
      'SELECT plan FROM users WHERE id = ?'
    ).bind(userId).first();
    const plan = userRow ? userRow.plan : 'free';
    const forecastDays = PLAN_FORECAST_DAYS[plan] ?? 3;

    const data = await getForecast(farm, env);

    // プランに応じて予報日数を制限
    if (data.forecast && data.forecast.length > forecastDays) {
      data.forecast = data.forecast.slice(0, forecastDays);
    }

    return jsonResponse(data);
  } catch (err) {
    console.error('天気取得エラー:', err);
    return errorResponse('天気情報の取得に失敗しました', 500);
  }
}
