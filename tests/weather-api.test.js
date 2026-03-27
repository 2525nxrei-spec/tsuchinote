/**
 * functions/api/farms/[farmId]/weather/ のテスト
 * 天気API + モックモード + エラーハンドリング
 * 第2ラウンド: 天気ヘルパーのフォールバック・アラート生成をテスト
 */

import { describe, it, expect, vi } from 'vitest';
import { onRequestGet as weatherHandler } from '../functions/api/farms/[farmId]/weather/index.js';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';
import { createJwt } from '../functions/lib/utils.js';

const JWT_SECRET = 'test-secret-key-for-vitest-12345';

async function makeToken(userId = 'USER001') {
  return createJwt(
    { sub: userId, plan: 'free', exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  );
}

describe('GET /api/farms/:farmId/weather', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather');
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(401);
  });

  it('畑が存在しない場合404', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(404);
  });

  it('APIキー未設定時はモック天気データを返す（freeプラン=3日分）', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id, name, latitude')) {
          return { id: 'FARM001', name: 'テスト畑', latitude: 35.6, longitude: 139.7, address: '東京都' };
        }
        if (sql.includes('SELECT plan FROM users')) {
          return { plan: 'free' };
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
    expect(body.data.location).toBe('東京都');
    expect(body.data.current).toBeTruthy();
    expect(body.data.current.temp).toBe(22);
    expect(body.data.current.humidity).toBe(55);
    expect(body.data.current.weather).toBe('晴れ');
    expect(body.data.forecast).toHaveLength(3); // freeプランは3日分
    expect(body.data.alerts).toEqual([]);
  });

  it('モック天気データの各forecastエントリの構造が正しい', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id, name, latitude')) {
          return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '大阪府' };
        }
        if (sql.includes('SELECT plan FROM users')) {
          return { plan: 'free' };
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
    for (const f of body.data.forecast) {
      expect(f.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof f.temp_min).toBe('number');
      expect(typeof f.temp_max).toBe('number');
      expect(typeof f.weather).toBe('string');
      expect(typeof f.icon).toBe('string');
      expect(typeof f.precipitation).toBe('number');
    }
  });

  it('OpenWeatherMap APIキャッシュヒットでキャッシュを使用', async () => {
    const token = await makeToken();
    const cachedData = {
      location: '東京都',
      current: { temp: 20, temp_min: 15, temp_max: 25, humidity: 60, weather: '曇り', icon: 'cloudy', wind_speed: 2.0 },
      forecast: [{ date: '2025-07-01', temp_min: 15, temp_max: 25, weather: '曇り', icon: 'cloudy', precipitation: 30 }],
      alerts: [],
    };
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id, name, latitude')) {
          return { id: 'FARM001', name: '畑', latitude: 35.68, longitude: 139.65, address: '東京都' };
        }
        if (sql.includes('SELECT plan FROM users')) {
          return { plan: 'free' };
        }
        // weather_cache
        if (sql.includes('weather_cache')) {
          return { data: JSON.stringify(cachedData) };
        }
        return null;
      },
    });
    env.OPENWEATHER_API_KEY = 'test-api-key';
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.current.temp).toBe(20);
    expect(body.data.current.weather).toBe('曇り');
  });

  it('OpenWeatherMap APIエラー時にモックにフォールバック', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id, name, latitude')) {
          return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '東京' };
        }
        if (sql.includes('SELECT plan FROM users')) {
          return { plan: 'free' };
        }
        return null; // キャッシュなし
      },
    });
    env.OPENWEATHER_API_KEY = 'test-api-key';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    // モックデータにフォールバック
    expect(body.data.location).toBe('東京都');
    expect(body.data.current.temp).toBe(22);
    globalThis.fetch = origFetch;
  });

  it('OpenWeatherMap API成功時にデータ変換して返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id, name, latitude')) {
          return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '東京' };
        }
        if (sql.includes('SELECT plan FROM users')) {
          return { plan: 'free' };
        }
        return null; // キャッシュなし
      },
    });
    env.OPENWEATHER_API_KEY = 'test-api-key';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        list: [
          {
            dt_txt: '2025-07-01 12:00:00',
            main: { temp: 28, temp_min: 25, temp_max: 30, humidity: 70 },
            weather: [{ main: 'Rain' }],
            wind: { speed: 5.0 },
            rain: { '3h': 2.5 },
          },
          {
            dt_txt: '2025-07-01 15:00:00',
            main: { temp: 26, temp_min: 24, temp_max: 28, humidity: 75 },
            weather: [{ main: 'Rain' }],
            wind: { speed: 4.0 },
            rain: { '3h': 1.0 },
          },
          {
            dt_txt: '2025-07-02 12:00:00',
            main: { temp: 32, temp_min: 28, temp_max: 36, humidity: 50 },
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
    expect(body.data.current.weather).toBe('雨');
    expect(body.data.forecast.length).toBeGreaterThan(0);
    // 猛暑日アラート（temp_max >= 35）
    const heatAlert = body.data.alerts.find(a => a.type === 'heat');
    expect(heatAlert).toBeTruthy();
    globalThis.fetch = origFetch;
  });

  it('getForecast内で例外が投げられた場合500', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id, name, latitude')) {
          return { id: 'FARM001', name: '畑', latitude: 35.6, longitude: 139.7, address: '東京' };
        }
        if (sql.includes('SELECT plan FROM users')) {
          return { plan: 'free' };
        }
        // weather_cacheのクエリで例外
        throw new Error('DB error');
      },
    });
    env.OPENWEATHER_API_KEY = 'test-key';
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(500);
  });
});
