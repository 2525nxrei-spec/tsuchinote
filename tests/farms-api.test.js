/**
 * functions/api/farms/ のAPIエンドポイントテスト
 * 畑CRUD + プラン制限
 */

import { describe, it, expect } from 'vitest';
import { onRequestGet as farmsListHandler, onRequestPost as farmsCreateHandler } from '../functions/api/farms/index.js';
import { onRequestGet as farmGetHandler, onRequestPut as farmUpdateHandler, onRequestDelete as farmDeleteHandler } from '../functions/api/farms/[farmId]/index.js';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';
import { createJwt } from '../functions/lib/utils.js';

const JWT_SECRET = 'test-secret-key-for-vitest-12345';

async function makeToken(userId = 'USER001', plan = 'free') {
  return createJwt(
    { sub: userId, plan, exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  );
}

// --- 畑一覧 ---
describe('GET /api/farms', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms');
    const res = await farmsListHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('認証済みで畑一覧を返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      all: () => ({
        results: [
          { id: 'FARM001', name: '家庭菜園', latitude: 35.6, longitude: 139.7, address: '東京都', created_at: '2025-01-01' },
        ],
      }),
    });
    const request = new Request('https://tsuchinote.com/api/farms', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await farmsListHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('家庭菜園');
  });
});

// --- 畑作成 ---
describe('POST /api/farms', () => {
  it('名前なしで400', async () => {
    const token = await makeToken();
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(400);
  });

  it('freeプランで上限（1畑）超過時403', async () => {
    const token = await makeToken('USER001', 'free');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { cnt: 1 }; // 既に1畑
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '新しい畑' }),
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(403);
  });

  it('上限内なら201で畑を作成', async () => {
    const token = await makeToken('USER001', 'free');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { cnt: 0 };
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '最初の畑', latitude: 35.6, longitude: 139.7 }),
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(201);
    const body = await parseResponse(res);
    expect(body.data.name).toBe('最初の畑');
  });
});

// --- 畑詳細 ---
describe('GET /api/farms/:farmId', () => {
  it('存在しない畑で404', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await farmGetHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(404);
  });

  it('自分の畑なら200で返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'FARM001', name: 'テスト畑', latitude: 35.6, longitude: 139.7, address: null, created_at: '2025-01-01' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await farmGetHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
  });
});

// --- 畑更新 ---
describe('PUT /api/farms/:farmId', () => {
  it('存在しない畑で404', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '更新' }),
    });
    const res = await farmUpdateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(404);
  });
});

// --- 畑削除 ---
describe('DELETE /api/farms/:farmId', () => {
  it('存在しない畑で404', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await farmDeleteHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(404);
  });

  it('自分の畑を削除できる', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'FARM001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await farmDeleteHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.deleted).toBe(true);
  });
});
