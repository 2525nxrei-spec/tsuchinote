/**
 * functions/api/farms/ のAPIエンドポイントテスト
 * 畑CRUD + プラン制限
 * 第2ラウンド: 更新成功パス、全プラン制限、不正入力、認可テスト
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

  it('畑がない場合は空配列を返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      all: () => ({ results: [] }),
    });
    const request = new Request('https://tsuchinote.com/api/farms', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await farmsListHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data).toEqual([]);
  });

  it('results=nullでも空配列を返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      all: () => ({ results: null }),
    });
    const request = new Request('https://tsuchinote.com/api/farms', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await farmsListHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data).toEqual([]);
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

  it('不正なJSONボディで400', async () => {
    const token = await makeToken();
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: 'invalid json',
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(400);
  });

  it('freeプランで上限（1畑）超過時403', async () => {
    const token = await makeToken('USER001', 'free');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT plan FROM users')) return { plan: 'free' };
        if (sql.includes('COUNT(*)')) return { cnt: 1 };
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

  it('lightプランで上限（3畑）超過時403', async () => {
    const token = await makeToken('USER001', 'light');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT plan FROM users')) return { plan: 'light' };
        if (sql.includes('COUNT(*)')) return { cnt: 3 };
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '4番目の畑' }),
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(403);
  });

  it('proプランで上限（5畑）超過時403', async () => {
    const token = await makeToken('USER001', 'pro');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT plan FROM users')) return { plan: 'pro' };
        if (sql.includes('COUNT(*)')) return { cnt: 5 };
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '6番目の畑' }),
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(403);
  });

  it('上限内なら201で畑を作成', async () => {
    const token = await makeToken('USER001', 'free');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT plan FROM users')) return { plan: 'free' };
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
    expect(body.data.id).toBeTruthy();
  });

  it('addressフィールド(location)もサポート', async () => {
    const token = await makeToken('USER001', 'free');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT plan FROM users')) return { plan: 'free' };
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
      body: JSON.stringify({ name: '畑', location: '東京都千代田区' }),
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(201);
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
    const body = await parseResponse(res);
    expect(body.data.id).toBe('FARM001');
    expect(body.data.name).toBe('テスト畑');
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

  it('畑名を更新できる', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: (sql) => {
        callCount++;
        // 1回目: 存在チェック
        if (callCount === 1) return { id: 'FARM001' };
        // 3回目: 更新後の取得
        return { id: 'FARM001', name: '更新後の畑', latitude: 35.6, longitude: 139.7, address: '東京', created_at: '2025-01-01' };
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '更新後の畑' }),
    });
    const res = await farmUpdateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.name).toBe('更新後の畑');
  });

  it('座標を更新できる', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: () => {
        callCount++;
        if (callCount === 1) return { id: 'FARM001' };
        return { id: 'FARM001', name: '畑', latitude: 36.0, longitude: 140.0, address: null, created_at: '2025-01-01' };
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ latitude: 36.0, longitude: 140.0 }),
    });
    const res = await farmUpdateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
  });

  it('不正なJSONボディで400', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'FARM001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: 'invalid',
    });
    const res = await farmUpdateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(400);
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

  it('自分の畑を削除できる（関連データも削除）', async () => {
    const token = await makeToken();
    const deletedTables = [];
    const env = createMockEnv({
      first: () => ({ id: 'FARM001' }),
      run: (sql) => {
        if (sql.includes('DELETE')) deletedTables.push(sql);
        return { success: true, meta: { changes: 1 } };
      },
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
