/**
 * エッジケース・異常系テスト（横断的）
 * 第2ラウンド: 不正JSON、空ボディ、期限切れトークン、認可テスト
 */

import { describe, it, expect, vi } from 'vitest';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';
import { createJwt } from '../functions/lib/utils.js';

// --- ハンドラーインポート ---
import { onRequestPost as loginHandler } from '../functions/api/auth/login.js';
import { onRequestPost as registerHandler } from '../functions/api/auth/register.js';
import { onRequestGet as profileGetHandler } from '../functions/api/auth/profile.js';
import { onRequestGet as farmsListHandler, onRequestPost as farmsCreateHandler } from '../functions/api/farms/index.js';
import { onRequestGet as farmGetHandler, onRequestPut as farmUpdateHandler, onRequestDelete as farmDeleteHandler } from '../functions/api/farms/[farmId]/index.js';
import { onRequestGet as cropsListHandler, onRequestPost as cropsCreateHandler } from '../functions/api/farms/[farmId]/crops/index.js';
import { onRequestPut as cropUpdateHandler, onRequestDelete as cropDeleteHandler } from '../functions/api/farms/[farmId]/crops/[cropId].js';
import { onRequestGet as recordsListHandler, onRequestPost as recordsCreateHandler } from '../functions/api/farms/[farmId]/records/index.js';
import { onRequestPut as recordUpdateHandler, onRequestDelete as recordDeleteHandler } from '../functions/api/farms/[farmId]/records/[recordId].js';
import { onRequestPut as completeToggleHandler } from '../functions/api/farms/[farmId]/records/[recordId]/complete.js';
import { onRequestGet as weatherHandler } from '../functions/api/farms/[farmId]/weather/index.js';
import { onRequestGet as todayHandler } from '../functions/api/farms/[farmId]/suggestions/today.js';
import { onRequestGet as historyHandler } from '../functions/api/farms/[farmId]/suggestions/history.js';
import { onRequestPost as webhookHandler } from '../functions/api/stripe/webhook.js';

const JWT_SECRET = 'test-secret-key-for-vitest-12345';

async function makeToken(userId = 'USER001', plan = 'free', expired = false) {
  const exp = expired
    ? Math.floor(Date.now() / 1000) - 3600
    : Math.floor(Date.now() / 1000) + 3600;
  return createJwt({ sub: userId, plan, exp }, JWT_SECRET);
}

// ========== 期限切れトークンテスト ==========
describe('期限切れトークンで全APIが401を返す', () => {
  it('GET /api/farms - 期限切れトークンで401', async () => {
    const token = await makeToken('USER001', 'free', true);
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await farmsListHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('POST /api/farms - 期限切れトークンで401', async () => {
    const token = await makeToken('USER001', 'free', true);
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: 'テスト畑' }),
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('GET /api/farms/:farmId/crops - 期限切れトークンで401', async () => {
    const token = await makeToken('USER001', 'free', true);
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cropsListHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(401);
  });

  it('GET /api/farms/:farmId/records - 期限切れトークンで401', async () => {
    const token = await makeToken('USER001', 'free', true);
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await recordsListHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(401);
  });

  it('GET /api/farms/:farmId/weather - 期限切れトークンで401', async () => {
    const token = await makeToken('USER001', 'free', true);
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(401);
  });

  it('GET /api/farms/:farmId/suggestions/today - 期限切れトークンで401', async () => {
    const token = await makeToken('USER001', 'free', true);
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/profile - 期限切れトークンで401', async () => {
    const token = await makeToken('USER001', 'free', true);
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/auth/profile', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await profileGetHandler({ request, env });
    expect(res.status).toBe(401);
  });
});

// ========== 認可テスト（他人のデータへのアクセス） ==========
describe('認可テスト: 他人のデータにアクセスできない', () => {
  it('他人の畑詳細を取得できない（404）', async () => {
    const token = await makeToken('USER002', 'free');
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM_OTHER', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await farmGetHandler({ request, env, params: { farmId: 'FARM_OTHER' } });
    expect(res.status).toBe(404);
  });

  it('他人の畑を更新できない（404）', async () => {
    const token = await makeToken('USER002', 'free');
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM_OTHER', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '乗っ取り' }),
    });
    const res = await farmUpdateHandler({ request, env, params: { farmId: 'FARM_OTHER' } });
    expect(res.status).toBe(404);
  });

  it('他人の畑を削除できない（404）', async () => {
    const token = await makeToken('USER002', 'free');
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM_OTHER', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await farmDeleteHandler({ request, env, params: { farmId: 'FARM_OTHER' } });
    expect(res.status).toBe(404);
  });

  it('他人の作物を更新できない（404）', async () => {
    const token = await makeToken('USER002', 'free');
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops/CROP_OTHER', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: '乗っ取り' }),
    });
    const res = await cropUpdateHandler({ request, env, params: { farmId: 'FARM001', cropId: 'CROP_OTHER' } });
    expect(res.status).toBe(404);
  });

  it('他人の作物を削除できない（404）', async () => {
    const token = await makeToken('USER002', 'free');
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops/CROP_OTHER', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cropDeleteHandler({ request, env, params: { farmId: 'FARM001', cropId: 'CROP_OTHER' } });
    expect(res.status).toBe(404);
  });

  it('他人の作業記録を更新できない（404）', async () => {
    const token = await makeToken('USER002', 'free');
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records/REC_OTHER', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ content: '改ざん' }),
    });
    const res = await recordUpdateHandler({ request, env, params: { farmId: 'FARM001', recordId: 'REC_OTHER' } });
    expect(res.status).toBe(404);
  });

  it('他人の作業記録を削除できない（404）', async () => {
    const token = await makeToken('USER002', 'free');
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records/REC_OTHER', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await recordDeleteHandler({ request, env, params: { farmId: 'FARM001', recordId: 'REC_OTHER' } });
    expect(res.status).toBe(404);
  });

  it('他人の記録の完了トグルができない（404）', async () => {
    const token = await makeToken('USER002', 'free');
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records/REC_OTHER/complete', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await completeToggleHandler({ request, env, params: { farmId: 'FARM001', recordId: 'REC_OTHER' } });
    expect(res.status).toBe(404);
  });

  it('他人の畑の天気情報を取得できない（404）', async () => {
    const token = await makeToken('USER002', 'free');
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM_OTHER/weather', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await weatherHandler({ request, env, params: { farmId: 'FARM_OTHER' } });
    expect(res.status).toBe(404);
  });

  it('他人の畑の提案を取得できない（404）', async () => {
    const token = await makeToken('USER002', 'free');
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM_OTHER/suggestions/today', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await todayHandler({ request, env, params: { farmId: 'FARM_OTHER' } });
    expect(res.status).toBe(404);
  });

  it('他人の畑の提案履歴を取得できない（404）', async () => {
    const token = await makeToken('USER002', 'free');
    const env = createMockEnv({ first: () => null });
    const request = new Request('https://tsuchinote.com/api/farms/FARM_OTHER/suggestions/history', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await historyHandler({ request, env, params: { farmId: 'FARM_OTHER' } });
    expect(res.status).toBe(404);
  });
});

// ========== 不正JSON・空ボディテスト ==========
describe('不正JSON・空ボディで適切なエラーを返す', () => {
  it('POST /api/auth/register - 空ボディで400', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    const res = await registerHandler({ request, env });
    expect(res.status).toBe(400);
  });

  it('POST /api/farms - 空ボディで400', async () => {
    const token = await makeToken();
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: '',
    });
    const res = await farmsCreateHandler({ request, env });
    expect(res.status).toBe(400);
  });

  it('POST /api/farms/:farmId/crops - 不正JSONで400', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'FARM001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: '{broken json',
    });
    const res = await cropsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(400);
  });

  it('POST /api/farms/:farmId/records - 不正JSONで400', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'FARM001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: 'not valid json',
    });
    const res = await recordsCreateHandler({ request, env, params: { farmId: 'FARM001' } });
    expect(res.status).toBe(400);
  });

  it('PUT /api/farms/:farmId/records/:recordId - 不正JSONで400', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'REC001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/records/REC001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: '{{invalid}}',
    });
    const res = await recordUpdateHandler({ request, env, params: { farmId: 'FARM001', recordId: 'REC001' } });
    expect(res.status).toBe(400);
  });

  it('PUT /api/farms/:farmId/crops/:cropId - 不正JSONで400', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ id: 'CROP001' }),
    });
    const request = new Request('https://tsuchinote.com/api/farms/FARM001/crops/CROP001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: 'xyz',
    });
    const res = await cropUpdateHandler({ request, env, params: { farmId: 'FARM001', cropId: 'CROP001' } });
    expect(res.status).toBe(400);
  });

  it('POST /api/stripe/webhook - typeフィールドなしのJSONで200(handled=false)', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { object: {} } }),
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.handled).toBe(false);
  });
});

// ========== 改ざんされたトークン ==========
describe('改ざんトークンテスト', () => {
  it('署名を改ざんしたトークンで401', async () => {
    const token = await makeToken('USER001', 'free');
    // 署名部分の中間文字を確実に改ざん（末尾1文字だけだとBase64パディングビットで同一バイト列になる場合がある）
    const parts = token.split('.');
    const sig = parts[2];
    const midIdx = Math.floor(sig.length / 2);
    const midChar = sig[midIdx];
    const replacement = midChar === 'x' ? 'Y' : 'x';
    parts[2] = sig.slice(0, midIdx) + replacement + sig.slice(midIdx + 1);
    const tampered = parts.join('.');
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms', {
      headers: { 'Authorization': `Bearer ${tampered}` },
    });
    const res = await farmsListHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('ペイロードを改ざんしたトークンで401', async () => {
    const token = await makeToken('USER001', 'free');
    const parts = token.split('.');
    parts[1] = parts[1].slice(0, -2) + 'XX';
    const tampered = parts.join('.');
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms', {
      headers: { 'Authorization': `Bearer ${tampered}` },
    });
    const res = await farmsListHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('空文字トークンで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms', {
      headers: { 'Authorization': 'Bearer ' },
    });
    const res = await farmsListHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('Bearer以外のスキームで401', async () => {
    const token = await makeToken('USER001', 'free');
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/farms', {
      headers: { 'Authorization': `Basic ${token}` },
    });
    const res = await farmsListHandler({ request, env });
    expect(res.status).toBe(401);
  });
});
