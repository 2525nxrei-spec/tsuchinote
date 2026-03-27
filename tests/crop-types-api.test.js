/**
 * functions/api/crop-types/index.js のテスト
 * 品目マスタ取得
 */

import { describe, it, expect } from 'vitest';
import { onRequestGet as cropTypesHandler } from '../functions/api/crop-types/index.js';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';
import { createJwt } from '../functions/lib/utils.js';

const JWT_SECRET = 'test-secret-key-for-vitest-12345';

async function makeToken(userId = 'USER001') {
  return createJwt(
    { sub: userId, plan: 'free', exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  );
}

describe('GET /api/crop-types', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/crop-types');
    const res = await cropTypesHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('認証済みで品目マスタ一覧を返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      all: () => ({
        results: [
          {
            id: 'tomato', name: 'トマト', category: '果菜類',
            growing_days: 90, min_temp: 15, max_temp: 35,
            frost_sensitive: 1, water_needs: 'medium',
            stages: JSON.stringify([
              { name: '発芽期', start_day: 0, end_day: 7 },
              { name: '成長期', start_day: 8, end_day: 60 },
            ]),
          },
          {
            id: 'lettuce', name: 'レタス', category: '葉菜類',
            growing_days: 60, min_temp: 10, max_temp: 25,
            frost_sensitive: 0, water_needs: 'high',
            stages: null,
          },
        ],
      }),
    });
    const request = new Request('https://tsuchinote.com/api/crop-types', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cropTypesHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].stages).toHaveLength(2);
    expect(body.data[1].stages).toEqual([]);
  });

  it('品目マスタが空の場合でも空配列を返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      all: () => ({ results: [] }),
    });
    const request = new Request('https://tsuchinote.com/api/crop-types', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cropTypesHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data).toEqual([]);
  });
});
