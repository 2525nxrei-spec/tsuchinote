/**
 * GET  /api/farms/:farmId/records — 作業記録一覧取得
 * POST /api/farms/:farmId/records — 作業記録作成
 */

import { requireAuth } from '../../../../lib/auth-helper.js';
import { generateUlid, jsonResponse, errorResponse } from '../../../../lib/utils.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const farmId = params.farmId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const month = url.searchParams.get('month');

  let sql = `
    SELECT w.id, w.farm_id, w.crop_id, w.date, w.content, w.completed, w.created_at,
           f.name as farm_name, c.name as crop_name
    FROM work_logs w
    LEFT JOIN farms f ON w.farm_id = f.id
    LEFT JOIN crops c ON w.crop_id = c.id
    WHERE w.user_id = ?`;
  const binds = [userId];

  if (farmId) {
    sql += ' AND w.farm_id = ?';
    binds.push(farmId);
  }
  if (date) {
    sql += ' AND w.date = ?';
    binds.push(date);
  }
  if (month) {
    sql += " AND w.date LIKE ?";
    binds.push(`${month}%`);
  }

  sql += ' ORDER BY w.date DESC, w.created_at DESC';

  const { results } = await env.DB.prepare(sql).bind(...binds).all();

  const records = (results || []).map(r => ({
    id: r.id,
    farmId: r.farm_id,
    farmName: r.farm_name,
    cropId: r.crop_id,
    cropName: r.crop_name,
    date: r.date,
    content: r.content,
    completed: !!r.completed,
    createdAt: r.created_at,
  }));

  return jsonResponse(records);
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const farmId = params.farmId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const { cropId, date, content } = body;
  if (!content) return errorResponse('content は必須です');

  // 畑の所有権チェック
  const farm = await env.DB.prepare(
    'SELECT id FROM farms WHERE id = ? AND user_id = ?'
  ).bind(farmId, userId).first();
  if (!farm) return errorResponse('畑が見つかりません', 404);

  const id = generateUlid();
  const recordDate = date || new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO work_logs (id, user_id, farm_id, crop_id, date, content, completed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  ).bind(id, userId, farmId, cropId || null, recordDate, content, now).run();

  return jsonResponse({ id, farmId, cropId, date: recordDate, content, completed: false, createdAt: now }, 201);
}
