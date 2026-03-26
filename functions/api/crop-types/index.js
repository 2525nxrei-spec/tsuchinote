/**
 * GET /api/crop-types — 品目マスタ取得
 */

import { requireAuth } from '../../lib/auth-helper.js';
import { jsonResponse } from '../../lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  const { results } = await env.DB.prepare(
    'SELECT id, name, category, growing_days, min_temp, max_temp, frost_sensitive, water_needs, stages FROM crop_master ORDER BY category, name'
  ).all();

  const parsed = (results || []).map(r => ({
    ...r,
    stages: r.stages ? JSON.parse(r.stages) : [],
  }));

  return jsonResponse(parsed);
}
