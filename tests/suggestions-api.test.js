/**
 * functions/api/farms/[farmId]/suggestions/ のテスト
 * AI提案取得 + 提案履歴
 */

import { describe, it, expect } from 'vitest';
import { onRequestGet as todayHandler } from '../functions/api/farms/[farmId]/suggestions/today.js';
import { onRequestGet as historyHandler } from '../functions/api/farms/[farmId]/suggestions/history.js';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';
import { createJwt } from '../functions/lib/utils.js';

const JWT_SECRET = 'test-secret-key-for-vitest-12345';

async function makeToken(userId = 'USER001') {
  return createJwt(
    { sub: userId, plan: 'free', exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  );
}

// --- 今日の提案 ---
describe('GET /api/farms/:farmId/suggestions/today', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today');
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(401);
  });

  it('畑が存在しない場合404', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(404);
  });

  it('キャッシュが存在する場合はキャッシュを返す', async () => {
    const token = await makeToken();
    const today = new Date().toISOString().split('T')[0];
    let callCount = 0;

    const env = createMockEnv({
      first: (sql) => {
        callCount++;
        // 1回目: 畑チェック
        if (callCount === 1) {
          return { id: 'FARM001', name: 'テスト畑', latitude: 35.6, longitude: 139.7, address: '東京都' };
        }
        // 2回目: キャッシュチェック
        if (callCount === 2) {
          return {
            items: JSON.stringify([
              { priority: 'high', icon: '💧', title: 'テスト提案', description: 'テスト内容', crop: null }
            ]),
            weather_summary: '晴れ 22℃',
          };
        }
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.cached).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].title).toBe('テスト提案');
  });

  it('キャッシュなし+Gemini未設定でモック提案を返す', async () => {
    const token = await makeToken();
    let callCount = 0;

    const env = createMockEnv({
      first: (sql) => {
        callCount++;
        // 1回目: 畑チェック
        if (callCount === 1) {
          return { id: 'FARM001', name: 'テスト畑', latitude: 35.6, longitude: 139.7, address: '東京' };
        }
        // 2回目: suggestionsキャッシュ → なし
        if (callCount === 2) return null;
        // 3回目: weather_cache → なし（モックモード）
        return null;
      },
      all: () => ({ results: [] }), // 作物なし
    });
    // GEMINI_API_KEY未設定
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.cached).toBe(false);
  });
});

// --- 提案履歴 ---
describe('GET /api/farms/:farmId/suggestions/history', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/history');
    const res = await historyHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(401);
  });

  it('畑が存在しない場合404', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/history', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await historyHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(404);
  });

  it('履歴を返す', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: () => {
        callCount++;
        if (callCount === 1) return { id: 'FARM001' }; // 畑存在チェック
        return null;
      },
      all: () => ({
        results: [
          {
            date: '2025-06-01',
            items: JSON.stringify([{ title: '過去の提案' }]),
            weather_summary: '曇り 18℃',
            created_at: '2025-06-01T06:00:00Z',
          },
        ],
      }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/history', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await historyHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].items[0].title).toBe('過去の提案');
  });
});
