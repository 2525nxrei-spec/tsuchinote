/**
 * ツチノート API — 畑管理モジュール
 * CRUD + プラン制限
 */

import { generateUlid, jsonResponse, errorResponse } from './index.js';

// プランごとの畑上限数
const FARM_LIMITS = { free: 1, light: 1, pro: 5 };

/** 畑ルーティング */
export async function handleFarms(request, env, userId, userPlan, path) {
  const method = request.method;

  // /api/farms — 一覧 or 作成
  if (path === '/api/farms') {
    if (method === 'GET') return listFarms(userId, env);
    if (method === 'POST') return createFarm(request, env, userId, userPlan);
    return errorResponse('許可されていないメソッドです', 405);
  }

  // /api/farms/:id — 更新 or 削除
  const match = path.match(/^\/api\/farms\/([\w-]+)$/);
  if (match) {
    const farmId = match[1];
    if (method === 'GET') return getFarm(userId, farmId, env);
    if (method === 'PUT') return updateFarm(request, env, userId, farmId);
    if (method === 'DELETE') return deleteFarm(env, userId, farmId);
    return errorResponse('許可されていないメソッドです', 405);
  }

  return errorResponse('エンドポイントが見つかりません', 404);
}

/** 畑一覧取得 */
async function listFarms(userId, env) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, latitude, longitude, address, created_at FROM farms WHERE user_id = ? ORDER BY created_at'
  ).bind(userId).all();

  return jsonResponse(results || []);
}

/** 畑詳細取得 */
async function getFarm(userId, farmId, env) {
  const farm = await env.DB.prepare(
    'SELECT id, name, latitude, longitude, address, created_at FROM farms WHERE id = ? AND user_id = ?'
  ).bind(farmId, userId).first();

  if (!farm) return errorResponse('畑が見つかりません', 404);
  return jsonResponse(farm);
}

/** 畑作成 */
async function createFarm(request, env, userId, userPlan) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const { name, latitude, longitude } = body;
  const address = body.address || body.location || null;
  if (!name) return errorResponse('畑の名前は必須です');

  // プラン制限チェック
  const limit = FARM_LIMITS[userPlan] || 1;
  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM farms WHERE user_id = ?'
  ).bind(userId).first();

  if (countResult.cnt >= limit) {
    return errorResponse(`現在のプラン（${userPlan}）では畑は${limit}つまでです。プランをアップグレードしてください。`, 403);
  }

  const id = generateUlid();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO farms (id, user_id, name, latitude, longitude, address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, name, latitude || null, longitude || null, address || null, now).run();

  return jsonResponse({ id, name, latitude, longitude, address, created_at: now }, 201);
}

/** 畑更新 */
async function updateFarm(request, env, userId, farmId) {
  // 所有権チェック
  const existing = await env.DB.prepare(
    'SELECT id FROM farms WHERE id = ? AND user_id = ?'
  ).bind(farmId, userId).first();
  if (!existing) return errorResponse('畑が見つかりません', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const { name, latitude, longitude } = body;
  const address = body.address || body.location || null;
  await env.DB.prepare(
    `UPDATE farms SET
       name = COALESCE(?, name),
       latitude = COALESCE(?, latitude),
       longitude = COALESCE(?, longitude),
       address = COALESCE(?, address)
     WHERE id = ? AND user_id = ?`
  ).bind(name || null, latitude ?? null, longitude ?? null, address || null, farmId, userId).run();

  // 更新後のデータを返す
  const updated = await env.DB.prepare(
    'SELECT id, name, latitude, longitude, address, created_at FROM farms WHERE id = ?'
  ).bind(farmId).first();

  return jsonResponse(updated);
}

/** 畑削除（関連する作物・記録も削除） */
async function deleteFarm(env, userId, farmId) {
  const existing = await env.DB.prepare(
    'SELECT id FROM farms WHERE id = ? AND user_id = ?'
  ).bind(farmId, userId).first();
  if (!existing) return errorResponse('畑が見つかりません', 404);

  // 関連データを削除（作業記録 → 作物 → 提案 → 畑）
  await env.DB.prepare('DELETE FROM work_logs WHERE farm_id = ?').bind(farmId).run();
  await env.DB.prepare('DELETE FROM crops WHERE farm_id = ?').bind(farmId).run();
  await env.DB.prepare('DELETE FROM suggestions WHERE farm_id = ?').bind(farmId).run();
  await env.DB.prepare('DELETE FROM farms WHERE id = ? AND user_id = ?').bind(farmId, userId).run();

  return jsonResponse({ deleted: true });
}
