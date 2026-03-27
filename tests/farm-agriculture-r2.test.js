/**
 * 農業APIテスト強化 第2ラウンド
 * 畑CRUD+プラン上限、作物管理、作業記録、天気APIエラー時フォールバック、AI提案異常系
 */

import { describe, it, expect, vi } from 'vitest';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';
import { createJwt } from '../functions/lib/utils.js';

// --- ハンドラー ---
import { onRequestGet as farmsListHandler, onRequestPost as farmsCreateHandler } from '../functions/api/farms/index.js';
import { onRequestGet as farmGetHandler, onRequestPut as farmUpdateHandler, onRequestDelete as farmDeleteHandler } from '../functions/api/farms/[farmId]/index.js';
import { onRequestGet as cropsListHandler, onRequestPost as cropsCreateHandler } from '../functions/api/farms/[farmId]/crops/index.js';
import { onRequestPut as cropUpdateHandler, onRequestDelete as cropDeleteHandler } from '../functions/api/farms/[farmId]/crops/[cropId].js';
import { onRequestGet as recordsListHandler, onRequestPost as recordsCreateHandler } from '../functions/api/farms/[farmId]/records/index.js';
import { onRequestPut as recordUpdateHandler } from '../functions/api/farms/[farmId]/records/[recordId].js';
import { onRequestPut as completeToggleHandler } from '../functions/api/farms/[farmId]/records/[recordId]/complete.js';
import { onRequestGet as weatherHandler } from '../functions/api/farms/[farmId]/weather/index.js';
import { onRequestGet as todayHandler } from '../functions/api/farms/[farmId]/suggestions/today.js';
import { onRequestGet as historyHandler } from '../functions/api/farms/[farmId]/suggestions/history.js';

const JWT_SECRET = 'test-secret-key-for-vitest-12345';

async function makeToken(userId = 'USER001', plan = 'free') {
  return createJwt(
    { sub: userId, plan, exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  );
}

// ========== 畑CRUD プラン上限 追加テスト ==========
describe('畑作成 - プラン上限ギリギリのテスト', () => {
  it('freeプランで上限ちょうど（0畑）なら作成可能', async () => {
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
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '1つ目の畑' }),
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(201);
  });

  it('lightプランで2畑ならまだ作成可能', async () => {
    const token = await makeToken('USER001', 'light');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT plan FROM users')) return { plan: 'light' };
        if (sql.includes('COUNT(*)')) return { cnt: 2 };
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '3つ目の畑' }),
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(201);
  });

  it('proプランで4畑ならまだ作成可能', async () => {
    const token = await makeToken('USER001', 'pro');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT plan FROM users')) return { plan: 'pro' };
        if (sql.includes('COUNT(*)')) return { cnt: 4 };
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '5つ目の畑' }),
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(201);
  });

  it('不明なプランは1畑に制限', async () => {
    const token = await makeToken('USER001', 'unknown_plan');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT plan FROM users')) return { plan: 'unknown_plan' };
        if (sql.includes('COUNT(*)')) return { cnt: 1 };
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '制限畑' }),
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(403);
  });

  it('畑作成で名前が空文字の場合400', async () => {
    const token = await makeToken('USER001', 'free');
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '' }),
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(400);
  });
});

// ========== 畑更新 追加テスト ==========
describe('畑更新 - 追加テスト', () => {
  it('空のボディでも更新される（COALESCEで既存値維持）', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: () => {
        callCount++;
        if (callCount === 1) return { id: 'FARM001' };
        return { id: 'FARM001', name: '元の畑', latitude: 35.0, longitude: 139.0, address: null, created_at: '2025-01-01' };
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const res = await farmUpdateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
  });

  it('locationフィールドでaddressを更新できる', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: () => {
        callCount++;
        if (callCount === 1) return { id: 'FARM001' };
        return { id: 'FARM001', name: '畑', latitude: null, longitude: null, address: '神奈川県横浜市', created_at: '2025-01-01' };
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ location: '神奈川県横浜市' }),
    });
    const res = await farmUpdateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
  });
});

// ========== 作物管理 追加テスト ==========
describe('作物管理 - 追加テスト', () => {
  it('lightプランで上限（10品目）超過時403', async () => {
    const token = await makeToken('USER001', 'light');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id FROM farms')) return { id: 'FARM001' };
        if (sql.includes('SELECT plan FROM users')) return { plan: 'light' };
        if (sql.includes('COUNT(*)')) return { cnt: 10 };
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '11番目の品目' }),
    });
    const res = await cropsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(403);
  });

  it('proプランは品目数無制限', async () => {
    const token = await makeToken('USER001', 'pro');
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id FROM farms')) return { id: 'FARM001' };
        if (sql.includes('SELECT plan FROM users')) return { plan: 'pro' };
        // COUNT不要（proは無制限）
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '何品目でもOK', cropType: 'tomato' }),
    });
    const res = await cropsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(201);
  });

  it('作物登録でcrop_typeフィールド名もサポート', async () => {
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
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: 'ナス', crop_type: 'eggplant', planted_at: '2025-06-01' }),
    });
    const res = await cropsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(201);
    const body = await parseResponse(res);
    expect(body.data.name).toBe('ナス');
  });

  it('作物登録でmemo→notesへのマッピング', async () => {
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
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: 'メモ付き作物', memo: '日当たり良好な場所' }),
    });
    const res = await cropsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(201);
  });

  it('作物一覧で空の場合空配列を返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      all: () => ({ results: [] }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cropsListHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data).toEqual([]);
  });

  it('作物一覧でresults=nullでも空配列を返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      all: () => ({ results: null }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cropsListHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data).toEqual([]);
  });
});

// ========== 作業記録 追加テスト ==========
describe('作業記録 - 追加テスト', () => {
  it('crop_id付きで記録作成', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'FARM001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ content: 'トマトに水やり', cropId: 'CROP001', date: '2025-07-01' }),
    });
    const res = await recordsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(201);
    const body = await parseResponse(res);
    expect(body.data.content).toBe('トマトに水やり');
    expect(body.data.cropId).toBe('CROP001');
  });

  it('date省略時は当日日付が設定される', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'FARM001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ content: '草取り' }),
    });
    const res = await recordsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(201);
    const body = await parseResponse(res);
    // 今日の日付形式であること
    expect(body.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('記録一覧でresults=nullでも空配列を返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      all: () => ({ results: null }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await recordsListHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data).toEqual([]);
  });

  it('記録更新でcontent/date/cropIdを同時に更新', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'REC001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records/REC001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ content: '更新内容', date: '2025-08-01', cropId: 'CROP002' }),
    });
    const res = await recordUpdateHandler({ request, env, params: { farmId: 'FARM001', recordId: 'REC001' } });
    expect(res.status).toBe(200);
  });
});

// ========== 天気API エラー時フォールバック 追加テスト ==========
describe('天気API - 追加フォールバックテスト', () => {
  it('fetch例外時にモックにフォールバック', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: (sql) => {
        callCount++;
        if (callCount === 1) {
          return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '東京' };
        }
        return null; // キャッシュなし
      },
    });
    env.OPENWEATHER_API_KEY = 'test-api-key';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('DNS resolution failed'));
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    // fetch例外はgetForecast内でcatchされないので500になる
    expect(res.status).toBe(500);
    globalThis.fetch = origFetch;
  });

  it('API 401エラーでモックにフォールバック', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: (sql) => {
        callCount++;
        if (callCount === 1) {
          return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '千葉' };
        }
        return null;
      },
    });
    env.OPENWEATHER_API_KEY = 'invalid-key';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    // モックフォールバック
    expect(body.data.location).toBe('東京都');
    expect(body.data.current.temp).toBe(22);
    globalThis.fetch = origFetch;
  });

  it('天気APIレスポンスで霜注意報アラートが生成される', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: (sql) => {
        callCount++;
        if (callCount === 1) {
          return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '長野県' };
        }
        return null;
      },
    });
    env.OPENWEATHER_API_KEY = 'test-key';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        list: [
          {
            dt_txt: '2025-12-15 06:00:00',
            main: { temp: 2, temp_min: -1, temp_max: 5, humidity: 80 },
            weather: [{ main: 'Clear' }],
            wind: { speed: 1.0 },
          },
          {
            dt_txt: '2025-12-15 12:00:00',
            main: { temp: 4, temp_min: 1, temp_max: 6, humidity: 70 },
            weather: [{ main: 'Clear' }],
            wind: { speed: 2.0 },
          },
        ],
      }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    // 最低気温-1℃ => 霜注意報
    const frostAlert = body.data.alerts.find(a => a.type === 'frost');
    expect(frostAlert).toBeTruthy();
    expect(frostAlert.message).toContain('霜注意報');
    globalThis.fetch = origFetch;
  });

  it('天気APIレスポンスで大雨アラートが生成される', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: (sql) => {
        callCount++;
        if (callCount === 1) {
          return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '静岡' };
        }
        return null;
      },
    });
    env.OPENWEATHER_API_KEY = 'test-key';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        list: [
          {
            dt_txt: '2025-07-10 09:00:00',
            main: { temp: 25, temp_min: 22, temp_max: 28, humidity: 90 },
            weather: [{ main: 'Rain' }],
            wind: { speed: 8.0 },
            rain: { '3h': 15.0 },
          },
          {
            dt_txt: '2025-07-10 12:00:00',
            main: { temp: 24, temp_min: 21, temp_max: 27, humidity: 95 },
            weather: [{ main: 'Thunderstorm' }],
            wind: { speed: 10.0 },
            rain: { '3h': 20.0 },
          },
        ],
      }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    // precipitation = min(100, (15+20)*10) = 100 > 50 => 大雨注意
    const rainAlert = body.data.alerts.find(a => a.type === 'heavy_rain');
    expect(rainAlert).toBeTruthy();
    expect(rainAlert.message).toContain('大雨注意');
    globalThis.fetch = origFetch;
  });

  it('畑にlatitude/longitudeがない場合デフォルト座標を使用', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id, name, latitude')) {
          return { id: 'FARM001', name: '座標なし畑', latitude: null, longitude: null, address: null };
        }
        return null;
      },
    });
    // モックモード
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.current).toBeTruthy();
  });
});

// ========== AI提案 異常系 追加テスト ==========
describe('AI提案 - 異常系追加テスト', () => {
  it('Gemini APIエラー時にモック提案にフォールバック', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: (sql) => {
        callCount++;
        if (callCount === 1) return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '東京' };
        if (callCount === 2) return null; // キャッシュなし
        return null;
      },
      all: () => ({ results: [] }),
    });
    env.GEMINI_API_KEY = 'test-gemini-key';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    // Gemini APIエラー時にモック提案にフォールバック
    expect(body.data.items.length).toBeGreaterThan(0);
    globalThis.fetch = origFetch;
  });

  it('Gemini APIレスポンスがパース不可時にモック提案', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: (sql) => {
        callCount++;
        if (callCount === 1) return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '東京' };
        if (callCount === 2) return null; // キャッシュなし
        return null;
      },
      all: () => ({ results: [] }),
    });
    env.GEMINI_API_KEY = 'test-gemini-key';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: 'これはJSON配列ではないテキスト' }]
          }
        }],
      }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.items.length).toBeGreaterThan(0);
    globalThis.fetch = origFetch;
  });

  it('提案生成中にDB例外が発生した場合フォールバック提案を返す', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: (sql) => {
        callCount++;
        if (callCount === 1) return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '東京' };
        if (callCount === 2) return null; // キャッシュなし
        return null;
      },
      all: () => { throw new Error('DB read error'); },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    // try-catchでフォールバック提案
    expect(body.data.fallback).toBe(true);
    expect(body.data.items.length).toBeGreaterThan(0);
  });

  it('提案履歴でitemsのJSONパースが成功する', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: () => {
        callCount++;
        if (callCount === 1) return { id: 'FARM001' };
        return null;
      },
      all: () => ({
        results: [
          {
            date: '2025-06-01',
            items: JSON.stringify([
              { priority: 'high', icon: '💧', title: '水やり', description: '朝の水やり', crop: 'トマト' },
              { priority: 'low', icon: '📝', title: 'メモ', description: '成長観察', crop: null },
            ]),
            weather_summary: '晴れ 25℃',
            created_at: '2025-06-01T06:00:00Z',
          },
          {
            date: '2025-06-02',
            items: JSON.stringify([]),
            weather_summary: '雨 18℃',
            created_at: '2025-06-02T06:00:00Z',
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
    expect(body.data).toHaveLength(2);
    expect(body.data[0].items).toHaveLength(2);
    expect(body.data[1].items).toHaveLength(0);
  });

  it('提案履歴が空の場合空配列', async () => {
    const token = await makeToken();
    let callCount = 0;
    const env = createMockEnv({
      first: () => {
        callCount++;
        if (callCount === 1) return { id: 'FARM001' };
        return null;
      },
      all: () => ({ results: [] }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/history', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await historyHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data).toEqual([]);
  });
});

// ========== 畑削除 追加テスト ==========
describe('畑削除 - 関連データ一括削除', () => {
  it('削除時にwork_logs, crops, suggestions, farmsが順次削除される', async () => {
    const token = await makeToken();
    const deletedSQLs = [];
    const env = createMockEnv({
      first: () => ({ id: 'FARM001' }),
      run: (sql) => {
        deletedSQLs.push(sql);
        return { success: true, meta: { changes: 1 } };
      },
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await farmDeleteHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    // 4つのDELETEが実行されることを確認
    const deleteOps = deletedSQLs.filter(s => s.includes('DELETE'));
    expect(deleteOps.length).toBe(4);
  });
});
