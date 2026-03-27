/**
 * functions/api/farms/[farmId]/records/ のAPIエンドポイントテスト
 * 作業記録CRUD + 完了トグル
 */

import { describe, it, expect } from 'vitest';
import { onRequestGet as recordsListHandler, onRequestPost as recordsCreateHandler } from '../functions/api/farms/[farmId]/records/index.js';
import { onRequestPut as recordUpdateHandler, onRequestDelete as recordDeleteHandler } from '../functions/api/farms/[farmId]/records/[recordId].js';
import { onRequestPut as completeToggleHandler } from '../functions/api/farms/[farmId]/records/[recordId]/complete.js';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';
import { createJwt } from '../functions/lib/utils.js';

const JWT_SECRET = 'test-secret-key-for-vitest-12345';

async function makeToken(userId = 'USER001') {
  return createJwt(
    { sub: userId, plan: 'free', exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  );
}

// --- 作業記録一覧 ---
describe('GET /api/farms/:farmId/records', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records');
    const res = await recordsListHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(401);
  });

  it('認証済みで記録一覧を返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      all: () => ({
        results: [
          {
            id: 'REC001', farm_id: 'FARM001', crop_id: null,
            date: '2025-06-01', content: '水やり実施', completed: 0,
            created_at: '2025-06-01T08:00:00Z',
            farm_name: '家庭菜園', crop_name: null,
          },
        ],
      }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await recordsListHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].content).toBe('水やり実施');
    expect(body.data[0].completed).toBe(false);
  });
});

// --- 作業記録作成 ---
describe('POST /api/farms/:farmId/records', () => {
  it('contentなしで400', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'FARM001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const res = await recordsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(400);
  });

  it('畑が存在しない場合404', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM999/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ content: '水やり' }),
    });
    const res = await recordsCreateHandler({ request, env, params: { farmId: 'FARM999' } });
    expect(res.status).toBe(404);
  });

  it('正常作成で201', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'FARM001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ content: '肥料散布', date: '2025-06-15' }),
    });
    const res = await recordsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(201);
    const body = await parseResponse(res);
    expect(body.data.content).toBe('肥料散布');
    expect(body.data.completed).toBe(false);
  });
});

// --- 作業記録更新 ---
describe('PUT /api/farms/:farmId/records/:recordId', () => {
  it('存在しない記録で404', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records/REC999', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ content: '更新' }),
    });
    const res = await recordUpdateHandler({ request, env, params: { farmId: 'FARM001', recordId: 'REC999' } });
    expect(res.status).toBe(404);
  });

  it('存在する記録を更新できる', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'REC001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records/REC001', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ content: '更新内容' }),
    });
    const res = await recordUpdateHandler({ request, env, params: { farmId: 'FARM001', recordId: 'REC001' } });
    expect(res.status).toBe(200);
  });
});

// --- 作業記録削除 ---
describe('DELETE /api/farms/:farmId/records/:recordId', () => {
  it('存在しない記録で404', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records/REC999', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await recordDeleteHandler({ request, env, params: { farmId: 'FARM001', recordId: 'REC999' } });
    expect(res.status).toBe(404);
  });

  it('存在する記録を削除できる', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'REC001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records/REC001', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await recordDeleteHandler({ request, env, params: { farmId: 'FARM001', recordId: 'REC001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.deleted).toBe(true);
  });
});

// --- 完了トグル ---
describe('PUT /api/farms/:farmId/records/:recordId/complete', () => {
  it('存在しない記録で404', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records/REC999/complete', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await completeToggleHandler({ request, env, params: { farmId: 'FARM001', recordId: 'REC999' } });
    expect(res.status).toBe(404);
  });

  it('未完了→完了にトグル', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'REC001', completed: 0 }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records/REC001/complete', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await completeToggleHandler({ request, env, params: { farmId: 'FARM001', recordId: 'REC001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.completed).toBe(true);
  });

  it('完了→未完了にトグル', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'REC001', completed: 1 }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records/REC001/complete', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await completeToggleHandler({ request, env, params: { farmId: 'FARM001', recordId: 'REC001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.completed).toBe(false);
  });
});
