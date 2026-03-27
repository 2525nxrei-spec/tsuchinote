/**
 * functions/api/farms/[farmId]/weather/ のテスト
 * 天気API + モックモード
 */

import { describe, it, expect } from 'vitest';
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

  it('APIキー未設定時はモック天気データを返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id, name, latitude')) {
          return { id: 'FARM001', name: 'テスト畑', latitude: 35.6, longitude: 139.7, address: '東京都' };
        }
        return null;
      },
    });
    // OPENWEATHER_API_KEYが空なのでモックモード
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.location).toBe('東京都');
    expect(body.data.current).toBeTruthy();
    expect(body.data.current.temp).toBe(22);
    expect(body.data.forecast).toHaveLength(5);
    expect(body.data.alerts).toEqual([]);
  });
});
