// ⚠️ 旧実装 — 本番はfunctions/を使用
/**
 * ツチノート API — 作物管理モジュール
 * CRUD + 生育ステージ自動判定 + 収穫予測
 */

import { generateUlid, jsonResponse, errorResponse } from './index.js';

// ライトプランの1畑あたり品目上限
const CROP_LIMIT_LIGHT = 5;

/** 作物ルーティング — /api/farms/:farmId/crops[/:cropId] */
export async function handleCrops(request, env, userId, userPlan, path) {
  const method = request.method;

  // /api/farms/:farmId/crops — 一覧 or 作成
  const listMatch = path.match(/^\/api\/farms\/([\w-]+)\/crops$/);
  if (listMatch) {
    const farmId = listMatch[1];
    if (method === 'GET') return listCrops(farmId, env, userId);
    if (method === 'POST') return createCrop(request, env, userId, userPlan, farmId);
    return errorResponse('許可されていないメソッドです', 405);
  }

  // /api/farms/:farmId/crops/:cropId — 更新 or 削除
  const itemMatch = path.match(/^\/api\/farms\/([\w-]+)\/crops\/([\w-]+)$/);
  if (itemMatch) {
    const cropId = itemMatch[2];
    if (method === 'PUT') return updateCrop(request, env, userId, cropId);
    if (method === 'DELETE') return deleteCrop(env, userId, cropId);
    return errorResponse('許可されていないメソッドです', 405);
  }

  return errorResponse('エンドポイントが見つかりません', 404);
}

/** 品目マスタ取得 */
export async function handleCropTypes(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, category, growing_days, min_temp, max_temp, frost_sensitive, water_needs, stages FROM crop_master ORDER BY category, name'
  ).all();

  // stages JSON を parse
  const parsed = (results || []).map(r => ({
    ...r,
    stages: r.stages ? JSON.parse(r.stages) : [],
  }));

  return jsonResponse(parsed);
}

/** 作物一覧（farmIdでフィルタ、crop_masterと結合） */
async function listCrops(farmId, env, userId) {
  let sql = `
    SELECT c.id, c.farm_id, c.crop_type, c.name, c.planted_at, c.status, c.notes, c.created_at, c.updated_at,
           m.name as master_name, m.category, m.growing_days, m.min_temp, m.max_temp, m.frost_sensitive, m.water_needs, m.stages as master_stages
    FROM crops c
    LEFT JOIN crop_master m ON c.crop_type = m.id
    WHERE c.user_id = ? AND c.farm_id = ?`;
  const binds = [userId, farmId];

  sql += ' ORDER BY c.created_at DESC';

  const stmt = env.DB.prepare(sql);
  const { results } = await stmt.bind(...binds).all();

  // 生育ステージ・収穫予測を付与
  const enriched = (results || []).map(crop => {
    const masterStages = crop.master_stages ? JSON.parse(crop.master_stages) : [];
    const stage = calculateStage(crop, masterStages);
    const harvest = estimateHarvest(crop, crop.growing_days);

    return {
      id: crop.id,
      farmId: crop.farm_id,
      cropType: crop.crop_type,
      name: crop.name,
      masterName: crop.master_name,
      category: crop.category,
      plantedAt: crop.planted_at,
      status: crop.status,
      notes: crop.notes,
      currentStage: stage,
      estimatedHarvest: harvest,
      frostSensitive: !!crop.frost_sensitive,
      waterNeeds: crop.water_needs,
      createdAt: crop.created_at,
      updatedAt: crop.updated_at,
    };
  });

  return jsonResponse(enriched);
}

/** 作物登録 — farmIdはURLパスから取得 */
async function createCrop(request, env, userId, userPlan, farmId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  // フロントは { name, planted_at, memo } を送る
  const name = body.name;
  const cropType = body.cropType || body.crop_type || body.name; // 品目名をcrop_typeとしても利用
  const plantedAt = body.plantedAt || body.planted_at || null;
  const notes = body.notes || body.memo || null;
  if (!name) return errorResponse('name は必須です');

  // 畑の所有権チェック
  const farm = await env.DB.prepare(
    'SELECT id FROM farms WHERE id = ? AND user_id = ?'
  ).bind(farmId, userId).first();
  if (!farm) return errorResponse('畑が見つかりません', 404);

  // ライトプランの品目数制限
  if (userPlan === 'light' || userPlan === 'free') {
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM crops WHERE farm_id = ? AND user_id = ?'
    ).bind(farmId, userId).first();
    if (countResult.cnt >= CROP_LIMIT_LIGHT) {
      return errorResponse(`現在のプランでは1つの畑に${CROP_LIMIT_LIGHT}品目までです`, 403);
    }
  }

  const id = generateUlid();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO crops (id, farm_id, user_id, crop_type, name, planted_at, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'planning', ?, ?, ?)`
  ).bind(id, farmId, userId, cropType || null, name, plantedAt || null, notes || null, now, now).run();

  return jsonResponse({ id, farmId, cropType, name, plantedAt, status: 'planning', notes, createdAt: now }, 201);
}

/** 作物更新 */
async function updateCrop(request, env, userId, cropId) {
  const existing = await env.DB.prepare(
    'SELECT id FROM crops WHERE id = ? AND user_id = ?'
  ).bind(cropId, userId).first();
  if (!existing) return errorResponse('作物が見つかりません', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const { name, status, plantedAt, notes } = body;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE crops SET
       name = COALESCE(?, name),
       status = COALESCE(?, status),
       planted_at = COALESCE(?, planted_at),
       notes = COALESCE(?, notes),
       updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).bind(name || null, status || null, plantedAt || null, notes || null, now, cropId, userId).run();

  return jsonResponse({ updated: true });
}

/** 作物削除 */
async function deleteCrop(env, userId, cropId) {
  const existing = await env.DB.prepare(
    'SELECT id FROM crops WHERE id = ? AND user_id = ?'
  ).bind(cropId, userId).first();
  if (!existing) return errorResponse('作物が見つかりません', 404);

  await env.DB.prepare('DELETE FROM work_logs WHERE crop_id = ?').bind(cropId).run();
  await env.DB.prepare('DELETE FROM crops WHERE id = ? AND user_id = ?').bind(cropId, userId).run();

  return jsonResponse({ deleted: true });
}

/**
 * 生育ステージ判定
 * planted_at からの経過日数で stages 配列から現在のステージを特定
 */
export function calculateStage(crop, stages) {
  if (!crop.planted_at || !stages || stages.length === 0) {
    return { name: '未設定', daysSincePlanting: null, progress: 0 };
  }

  const planted = new Date(crop.planted_at);
  const now = new Date();
  const daysSince = Math.floor((now - planted) / (1000 * 60 * 60 * 24));

  // stages = [{ name: "発芽期", start_day: 0, end_day: 7 }, ...]
  let currentStage = stages[stages.length - 1]; // デフォルトは最後のステージ
  for (const s of stages) {
    const startDay = s.start_day ?? s.startDay ?? 0;
    const endDay = s.end_day ?? s.endDay ?? 0;
    if (daysSince >= startDay && daysSince <= endDay) {
      currentStage = s;
      break;
    }
  }

  // 全体の進捗率
  const lastStage = stages[stages.length - 1];
  const totalDays = lastStage?.end_day ?? lastStage?.endDay ?? 1;
  const progress = Math.min(100, Math.round((daysSince / totalDays) * 100));

  return {
    name: currentStage.name,
    daysSincePlanting: daysSince,
    progress,
  };
}

/**
 * 収穫予測日を計算
 */
export function estimateHarvest(crop, growingDays) {
  if (!crop.planted_at || !growingDays) return null;

  const planted = new Date(crop.planted_at);
  const harvest = new Date(planted);
  harvest.setDate(harvest.getDate() + growingDays);

  const now = new Date();
  const daysRemaining = Math.ceil((harvest - now) / (1000 * 60 * 60 * 24));

  return {
    date: harvest.toISOString().split('T')[0],
    daysRemaining: Math.max(0, daysRemaining),
  };
}
