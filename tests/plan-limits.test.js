/**
 * プラン制限テスト
 * - AI提案回数制限（free=1回/日, light=3回/日, pro=無制限）
 * - JWT vs DB プラン同期
 * - 天気予報日数の出し分け
 * - Stripe APIキー未設定時の適切なエラー
 * - 全APIエンドポイントのJSON応答
 */

import { describe, it, expect, vi } from 'vitest';
import { onRequestGet as todayHandler } from '../functions/api/farms/[farmId]/suggestions/today.js';
import { onRequestGet as weatherHandler } from '../functions/api/farms/[farmId]/weather/index.js';
import { onRequestPost as farmsCreateHandler } from '../functions/api/farms/index.js';
import { onRequestPost as cropsCreateHandler } from '../functions/api/farms/[farmId]/crops/index.js';
import { onRequestPost as checkoutHandler } from '../functions/api/subscription/checkout.js';
import { onRequestGet as statusHandler } from '../functions/api/subscription/status.js';
import { onRequestPost as cancelHandler } from '../functions/api/subscription/cancel.js';
import { onRequestGet as stripeKeyHandler } from '../functions/api/subscription/stripe-key.js';
import { onRequestGet as historyHandler } from '../functions/api/farms/[farmId]/suggestions/history.js';
import { stripeRequest } from '../functions/lib/stripe-helper.js';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';
import { createJwt } from '../functions/lib/utils.js';

const JWT_SECRET = 'test-secret-key-for-vitest-12345';

async function makeToken(userId = 'USER001', plan = 'free') {
  return createJwt(
    { sub: userId, plan, exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  );
}

/**
 * suggestionsの回数制限テスト用のモック環境を生成
 * @param {string} plan - ユーザーのDBプラン
 * @param {number} existingCount - 当日の既存提案数
 * @param {boolean} hasCacheForFarm - この畑のキャッシュがあるか
 */
function createSuggestionEnv(plan, existingCount, hasCacheForFarm = false) {
  let callCount = 0;
  return createMockEnv({
    first: (sql, args) => {
      callCount++;
      // 畑の所有権チェック
      if (sql.includes('SELECT id, name, latitude')) {
        return { id: 'FARM001', name: 'テスト畑', latitude: 35.6, longitude: 139.7, address: '東京都' };
      }
      // ユーザーのプラン取得
      if (sql.includes('SELECT plan FROM users')) {
        return { plan };
      }
      // 当日の提案数カウント
      if (sql.includes('COUNT(*)')) {
        return { cnt: existingCount };
      }
      // この畑のキャッシュチェック
      if (sql.includes('SELECT items, weather_summary FROM suggestions')) {
        if (hasCacheForFarm) {
          return {
            items: JSON.stringify([{ priority: 'high', icon: '💧', title: 'キャッシュ提案', description: 'テスト', crop: null }]),
            weather_summary: '晴れ 22℃',
          };
        }
        return null;
      }
      // weather_cache
      return null;
    },
    all: () => ({ results: [] }),
  });
}

// === AI提案回数制限テスト ===
describe('AI提案回数制限（プラン別）', () => {
  it('freeプラン: 1日1回まで許可（0回目 → 成功）', async () => {
    const token = await makeToken('USER001', 'free');
    const env = createSuggestionEnv('free', 0);
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.remaining).toBe(0); // 1-1=0
  });

  it('freeプラン: 上限到達で429エラー（既に1回）', async () => {
    const token = await makeToken('USER001', 'free');
    const env = createSuggestionEnv('free', 1);
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(429);
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('上限');
  });

  it('lightプラン: 1日3回まで許可（2回目 → 成功）', async () => {
    const token = await makeToken('USER001', 'light');
    const env = createSuggestionEnv('light', 2);
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.remaining).toBe(0); // 3-3=0
  });

  it('lightプラン: 上限到達で429エラー（既に3回）', async () => {
    const token = await makeToken('USER001', 'light');
    const env = createSuggestionEnv('light', 3);
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(429);
  });

  it('proプラン: 無制限（10回目でも成功）', async () => {
    const token = await makeToken('USER001', 'pro');
    const env = createSuggestionEnv('pro', 10);
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.remaining).toBeNull(); // proは無制限
  });

  it('proプラン: 100回目でも成功（本当に無制限）', async () => {
    const token = await makeToken('USER001', 'pro');
    const env = createSuggestionEnv('pro', 100);
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
  });
});

// === JWT vs DB プラン同期テスト ===
describe('JWT内のplanとDB上のplanが異なる場合にDB優先', () => {
  it('JWTはfreeだがDBはpro → proの制限が適用される', async () => {
    // JWTにはfreeと書かれているが、DBにはproと登録されている
    const token = await makeToken('USER001', 'free');
    const env = createSuggestionEnv('pro', 5); // DBはpro
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    // proなら5回目でも成功するはず
    expect(res.status).toBe(200);
  });

  it('JWTはproだがDBはfree → freeの制限が適用される', async () => {
    // JWTにはproと書かれているが、DBにはfreeと登録されている
    const token = await makeToken('USER001', 'pro');
    const env = createSuggestionEnv('free', 1); // DBはfree
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    // freeなら1回目で上限 → 429
    expect(res.status).toBe(429);
  });

  it('天気APIでもJWTではなくDBのプランが使われる', async () => {
    // JWTはfreeだが、DBではlightに変更済み
    const token = await makeToken('USER001', 'free');
    let callCount = 0;
    const env = createMockEnv({
      first: (sql) => {
        callCount++;
        if (sql.includes('SELECT id, name, latitude')) {
          return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '東京' };
        }
        if (sql.includes('SELECT plan FROM users')) {
          return { plan: 'light' }; // DBはlight
        }
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    // lightプランなら5日分の予報
    expect(body.data.forecast.length).toBe(5);
  });
});

// === 天気予報日数テスト ===
describe('天気予報日数のプラン別出し分け', () => {
  function createWeatherEnv(plan) {
    let callCount = 0;
    return createMockEnv({
      first: (sql) => {
        callCount++;
        if (sql.includes('SELECT id, name, latitude')) {
          return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '東京' };
        }
        if (sql.includes('SELECT plan FROM users')) {
          return { plan };
        }
        return null;
      },
    });
  }

  it('freeプラン: 天気予報3日分', async () => {
    const token = await makeToken();
    const env = createWeatherEnv('free');
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.forecast.length).toBeLessThanOrEqual(3);
  });

  it('lightプラン: 天気予報5日分', async () => {
    const token = await makeToken();
    const env = createWeatherEnv('light');
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.forecast.length).toBe(5);
  });

  it('proプラン: 天気予報5日分', async () => {
    const token = await makeToken();
    const env = createWeatherEnv('pro');
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.forecast.length).toBe(5);
  });
});

// === Stripe APIキー未設定時のテスト ===
describe('Stripe APIキー未設定時の適切なエラーレスポンス', () => {
  it('stripeRequest: キー未設定で例外がスローされる', async () => {
    const env = { STRIPE_SECRET_KEY: '' };
    await expect(
      stripeRequest('/checkout/sessions', 'POST', {}, env)
    ).rejects.toThrow('STRIPE_SECRET_KEY');
  });

  it('checkout: モックモード（キー未設定）でモックレスポンスが返る', async () => {
    const token = await makeToken();
    const env = createMockEnv();
    // STRIPE_SECRET_KEYが空 → isMockMode=true → モックレスポンス
    const request = new Request('https://tsuchinote.com/api/subscription/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'light' }),
    });
    const res = await checkoutHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.mock).toBe(true);
  });

  it('status: モックモード（キー未設定）でJSON応答', async () => {
    const token = await makeToken();
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/status', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await statusHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.ok).toBe(true);
  });
});

// === 全APIエンドポイントのJSON応答テスト ===
describe('全APIエンドポイントが常にJSON形式で応答', () => {
  async function assertJsonResponse(response) {
    const contentType = response.headers.get('Content-Type');
    expect(contentType).toContain('application/json');
    const text = await response.text();
    expect(() => JSON.parse(text)).not.toThrow();
  }

  it('suggestions/today: 認証エラーもJSON', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today');
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    await assertJsonResponse(res);
  });

  it('suggestions/today: 成功時もJSON', async () => {
    const token = await makeToken();
    const env = createSuggestionEnv('free', 0);
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    await assertJsonResponse(res);
  });

  it('suggestions/today: 回数制限エラーもJSON', async () => {
    const token = await makeToken();
    const env = createSuggestionEnv('free', 1);
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    await assertJsonResponse(res);
  });

  it('suggestions/history: 認証エラーもJSON', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/history');
    const res = await historyHandler({ request, env, params: { farmId: 'FARM001' } });
    await assertJsonResponse(res);
  });

  it('weather: 認証エラーもJSON', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather');
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    await assertJsonResponse(res);
  });

  it('checkout: 認証エラーもJSON', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'light' }),
    });
    const res = await checkoutHandler({ request, env });
    await assertJsonResponse(res);
  });

  it('status: 認証エラーもJSON', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/status');
    const res = await statusHandler({ request, env });
    await assertJsonResponse(res);
  });

  it('cancel: 認証エラーもJSON', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/cancel', {
      method: 'POST',
    });
    const res = await cancelHandler({ request, env });
    await assertJsonResponse(res);
  });

  it('stripe-key: 未設定エラーもJSON', async () => {
    const env = createMockEnv();
    env.STRIPE_PUBLISHABLE_KEY = '';
    const request = new Request('https://tsuchinote.com/api/subscription/stripe-key');
    const res = await stripeKeyHandler({ request, env });
    await assertJsonResponse(res);
  });
});

// === 畑作成・作物登録でもJWTではなくDBのプランが使われるテスト ===
describe('畑作成: JWT内のplanとDB上のplanが異なる場合にDB優先', () => {
  it('JWTはproだがDBはfree → freeの制限（1畑）が適用される', async () => {
    // JWTにはproと書かれているが、DBにはfreeと登録されている
    const token = await makeToken('USER001', 'pro');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT plan FROM users')) return { plan: 'free' }; // DBはfree
        if (sql.includes('COUNT(*)')) return { cnt: 1 }; // 既に1畑
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '2つ目の畑' }),
    });
    const res = await farmsCreateHandler({ request, env });
    // freeなら1畑上限 → 403
    expect(res.status).toBe(403);
  });

  it('JWTはfreeだがDBはpro → proの制限（5畑）が適用される', async () => {
    const token = await makeToken('USER001', 'free');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT plan FROM users')) return { plan: 'pro' }; // DBはpro
        if (sql.includes('COUNT(*)')) return { cnt: 4 }; // 既に4畑
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '5つ目の畑' }),
    });
    const res = await farmsCreateHandler({ request, env });
    // proなら5畑まで → 201
    expect(res.status).toBe(201);
  });
});

describe('作物登録: JWT内のplanとDB上のplanが異なる場合にDB優先', () => {
  it('JWTはproだがDBはfree → freeの制限（5品目）が適用される', async () => {
    const token = await makeToken('USER001', 'pro');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id FROM farms')) return { id: 'FARM001' };
        if (sql.includes('SELECT plan FROM users')) return { plan: 'free' }; // DBはfree
        if (sql.includes('COUNT(*)')) return { cnt: 5 }; // 既に5品目
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '6番目の品目' }),
    });
    const res = await cropsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    // freeなら5品目上限 → 403
    expect(res.status).toBe(403);
  });

  it('JWTはfreeだがDBはpro → proは無制限で201', async () => {
    const token = await makeToken('USER001', 'free');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id FROM farms')) return { id: 'FARM001' };
        if (sql.includes('SELECT plan FROM users')) return { plan: 'pro' }; // DBはpro
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '何品目でもOK' }),
    });
    const res = await cropsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    // proなら無制限 → 201
    expect(res.status).toBe(201);
  });
});
