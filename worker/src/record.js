/**
 * ツチノート API — 作業記録モジュール
 * CRUD + カレンダー表示用データ
 */

import { generateUlid, jsonResponse, errorResponse } from './index.js';

/** 作業記録ルーティング — /api/farms/:farmId/records[/:recordId][/complete] */
export async function handleRecords(request, env, userId, path, url) {
  const method = request.method;

  // PUT /api/farms/:farmId/records/:recordId/complete — 完了トグル
  const completeMatch = path.match(/^\/api\/farms\/([\w-]+)\/records\/([\w-]+)\/complete$/);
  if (completeMatch && method === 'PUT') {
    return completeRecord(env, userId, completeMatch[2]);
  }

  // /api/farms/:farmId/records — 一覧 or 作成
  const listMatch = path.match(/^\/api\/farms\/([\w-]+)\/records$/);
  if (listMatch) {
    const farmId = listMatch[1];
    if (method === 'GET') {
      const date = url.searchParams.get('date');
      const month = url.searchParams.get('month');
      return listRecords(env, userId, farmId, date, month);
    }
    if (method === 'POST') {
      return createRecord(request, env, userId, farmId);
    }
  }

  // PUT /api/farms/:farmId/records/:recordId — 更新
  const itemMatch = path.match(/^\/api\/farms\/([\w-]+)\/records\/([\w-]+)$/);
  if (itemMatch && method === 'PUT') {
    return updateRecord(request, env, userId, itemMatch[2]);
  }

  // DELETE /api/farms/:farmId/records/:recordId
  if (itemMatch && method === 'DELETE') {
    return deleteRecord(env, userId, itemMatch[2]);
  }

  return errorResponse('エンドポイントが見つかりません', 404);
}

/** 作業記録一覧（フィルタ対応） */
async function listRecords(env, userId, farmId, date, month) {
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
    // month = "2026-03" のような形式
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

/** 作業記録 作成 — farmIdはURLパスから取得 */
async function createRecord(request, env, userId, farmId) {
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

/** 完了フラグトグル */
async function completeRecord(env, userId, recordId) {
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

/** 作業記録 更新 */
async function updateRecord(request, env, userId, recordId) {
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

/** 作業記録 削除 */
async function deleteRecord(env, userId, recordId) {
  const existing = await env.DB.prepare(
    'SELECT id FROM work_logs WHERE id = ? AND user_id = ?'
  ).bind(recordId, userId).first();
  if (!existing) return errorResponse('記録が見つかりません', 404);

  await env.DB.prepare('DELETE FROM work_logs WHERE id = ?').bind(recordId).run();
  return jsonResponse({ deleted: true });
}

/** 月間カレンダー用データ（記録がある日の一覧） */
async function getCalendar(env, userId, year, month) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const { results } = await env.DB.prepare(
    `SELECT date, COUNT(*) as count,
            SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed_count
     FROM work_logs
     WHERE user_id = ? AND date LIKE ?
     GROUP BY date
     ORDER BY date`
  ).bind(userId, `${monthStr}%`).all();

  const days = (results || []).map(r => ({
    date: r.date,
    count: r.count,
    completedCount: r.completed_count,
  }));

  return jsonResponse({ year, month, days });
}
