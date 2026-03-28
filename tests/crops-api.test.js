/**
 * functions/api/farms/[farmId]/crops/ のAPIエンドポイントテスト
 * 作物CRUD + プラン制限
 */

import { describe, it, expect } from 'vitest';
import { onRequestGet as cropsListHandler, onRequestPost as cropsCreateHandler } from '../functions/api/farms/[farmId]/crops/index.js';
import { onRequestPut as cropUpdateHandler, onRequestDelete as cropDeleteHandler } from '../functions/api/farms/[farmId]/crops/[cropId].js';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';
import { createJwt } from '../functions/lib/utils.js';

const JWT_SECRET = 'test-secret-key-for-vitest-12345';

async function makeToken(userId = 'USER001', plan = 'free') {
  return createJwt(
    { sub: userId, plan, exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  );
}

// --- 作物一覧 ---
describe('GET /api/farms/:farmId/crops', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops');
    const res = await cropsListHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(401);
  });

  it('認証済みで作物一覧を返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      all: () => ({
        results: [
          {
            id: 'CROP001', farm_id: 'FARM001', crop_type: 'tomato',
            name: 'トマト', planted_at: '2025-04-01', status: 'growing',
            notes: null, created_at: '2025-01-01', updated_at: '2025-01-01',
            master_name: 'トマト', category: '果菜類', growing_days: 90,
            min_temp: 15, max_temp: 35, frost_sensitive: 1,
            water_needs: 'medium', master_stages: JSON.stringify([
              { name: '発芽期', start_day: 0, end_day: 7 },
              { name: '成長期', start_day: 8, end_day: 60 },
              { name: '収穫期', start_day: 61, end_day: 90 },
            ]),
          },
        ],
      }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cropsListHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('トマト');
    expect(body.data[0].currentStage).toBeTruthy();
    expect(body.data[0].estimatedHarvest).toBeTruthy();
  });
});

// --- 作物登録 ---
describe('POST /api/farms/:farmId/crops', () => {
  it('名前なしで400', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'FARM001' }), // 畑存在
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const res = await cropsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(400);
  });

  it('畑が存在しない場合404', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => null,
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM999/crops', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name: 'トマト' }),
    });
    const res = await cropsCreateHandler({ request, env, params: { farmId: 'FARM999' } });
    expect(res.status).toBe(404);
  });

  it('freeプランで上限（5品目）超過時403', async () => {
    const token = await makeToken('USER001', 'free');
    const env = createMockEnv({
      first: (sql, args) => {
        if (sql.includes('SELECT id FROM farms')) return { id: 'FARM001' };
        if (sql.includes('SELECT plan FROM users')) return { plan: 'free' };
        if (sql.includes('COUNT(*)')) return { cnt: 5 };
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '6番目の品目' }),
    });
    const res = await cropsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(403);
  });

  it('正常登録で201', async () => {
    const token = await makeToken('USER001', 'pro');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id FROM farms')) return { id: 'FARM001' };
        if (sql.includes('SELECT plan FROM users')) return { plan: 'pro' };
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name: 'キュウリ', cropType: 'cucumber', plantedAt: '2025-05-01' }),
    });
    const res = await cropsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(201);
    const body = await parseResponse(res);
    expect(body.data.name).toBe('キュウリ');
    expect(body.data.status).toBe('planning');
  });
});

// --- 作物更新 ---
describe('PUT /api/farms/:farmId/crops/:cropId', () => {
  it('存在しない作物で404', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops/CROP999', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '更新' }),
    });
    const res = await cropUpdateHandler({ request, env, params: { farmId: 'FARM001', cropId: 'CROP999' } });
    expect(res.status).toBe(404);
  });

  it('存在する作物を更新できる', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'CROP001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops/CROP001', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '更新トマト', status: 'growing' }),
    });
    const res = await cropUpdateHandler({ request, env, params: { farmId: 'FARM001', cropId: 'CROP001' } });
    expect(res.status).toBe(200);
  });
});

// --- 作物削除 ---
describe('DELETE /api/farms/:farmId/crops/:cropId', () => {
  it('存在しない作物で404', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops/CROP999', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cropDeleteHandler({ request, env, params: { farmId: 'FARM001', cropId: 'CROP999' } });
    expect(res.status).toBe(404);
  });

  it('存在する作物を削除できる', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'CROP001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops/CROP001', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cropDeleteHandler({ request, env, params: { farmId: 'FARM001', cropId: 'CROP001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.deleted).toBe(true);
  });
});
