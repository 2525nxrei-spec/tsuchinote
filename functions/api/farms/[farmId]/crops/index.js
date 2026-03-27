/**
 * GET  /api/farms/:farmId/crops — 作物一覧取得
 * POST /api/farms/:farmId/crops — 作物登録
 */

import { requireAuth } from '../../../../lib/auth-helper.js';
import { generateUlid, jsonResponse, errorResponse } from '../../../../lib/utils.js';
import { calculateStage, estimateHarvest } from '../../../../lib/crop-helper.js';

// プランごとの1畑あたり品目上限（設定画面の比較表と一致: Free=5, Light=10, Pro=無制限）
const CROP_LIMITS = { free: 5, light: 10 };

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const farmId = params.farmId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const sql = `
    SELECT c.id, c.farm_id, c.crop_type, c.name, c.planted_at, c.status, c.notes, c.created_at, c.updated_at,
           m.name as master_name, m.category, m.growing_days, m.min_temp, m.max_temp, m.frost_sensitive, m.water_needs, m.stages as master_stages
    FROM crops c
    LEFT JOIN crop_master m ON c.crop_type = m.id
    WHERE c.user_id = ? AND c.farm_id = ?
    ORDER BY c.created_at DESC`;

  const { results } = await env.DB.prepare(sql).bind(userId, farmId).all();

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

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const farmId = params.farmId;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  // DBからplanを都度取得（JWT依存を排除）
  const userRow = await env.DB.prepare('SELECT plan FROM users WHERE id = ?').bind(userId).first();
  const currentPlan = userRow ? userRow.plan : 'free';

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const name = body.name;
  const cropType = body.cropType || body.crop_type || body.name;
  const plantedAt = body.plantedAt || body.planted_at || null;
  const notes = body.notes || body.memo || null;
  if (!name) return errorResponse('name は必須です');

  // 畑の所有権チェック
  const farm = await env.DB.prepare(
    'SELECT id FROM farms WHERE id = ? AND user_id = ?'
  ).bind(farmId, userId).first();
  if (!farm) return errorResponse('畑が見つかりません', 404);

  // プランごとの品目数制限（proは無制限）
  const cropLimit = CROP_LIMITS[currentPlan];
  if (cropLimit) {
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM crops WHERE farm_id = ? AND user_id = ?'
    ).bind(farmId, userId).first();
    if (countResult.cnt >= cropLimit) {
      return errorResponse(`現在のプラン（${currentPlan}）では1つの畑に${cropLimit}品目までです。プランをアップグレードしてください。`, 403);
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
