/**
 * functions/api/subscription/ のAPIエンドポイントテスト
 * ステータス取得、チェックアウト、解約、Stripe公開鍵
 */

import { describe, it, expect } from 'vitest';
import { onRequestGet as statusHandler } from '../functions/api/subscription/status.js';
import { onRequestPost as checkoutHandler } from '../functions/api/subscription/checkout.js';
import { onRequestPost as cancelHandler } from '../functions/api/subscription/cancel.js';
import { onRequestGet as stripeKeyHandler } from '../functions/api/subscription/stripe-key.js';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';
import { createJwt } from '../functions/lib/utils.js';

const JWT_SECRET = 'test-secret-key-for-vitest-12345';

async function makeToken(userId = 'USER001') {
  return createJwt(
    { sub: userId, plan: 'free', exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  );
}

// --- ステータス取得 ---
describe('GET /api/subscription/status', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/status');
    const res = await statusHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('モックモードでfreeプランを返す', async () => {
    const token = await makeToken();
    const env = createMockEnv(); // STRIPE_SECRET_KEY空 = モックモード
    const request = new Request('https://tsuchinote.com/api/subscription/status', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await statusHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.plan).toBe('free');
    expect(body.data.subscription).toBeNull();
  });
});

// --- チェックアウト ---
describe('POST /api/subscription/checkout', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'light' }),
    });
    const res = await checkoutHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('無効なプランで500', async () => {
    const token = await makeToken();
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'invalid' }),
    });
    const res = await checkoutHandler({ request, env });
    expect(res.status).toBe(500);
  });

  it('モックモードでモックセッションを返す', async () => {
    const token = await makeToken();
    const env = createMockEnv();
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
    expect(body.data.clientSecret).toBeTruthy();
  });
});

// --- 解約 ---
describe('POST /api/subscription/cancel', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/cancel', {
      method: 'POST',
    });
    const res = await cancelHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('モックモードで即キャンセル', async () => {
    const token = await makeToken();
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/cancel', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cancelHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.success).toBe(true);
    expect(body.data.plan).toBe('free');
  });
});

// --- Stripe公開鍵 ---
describe('GET /api/subscription/stripe-key', () => {
  it('公開鍵が設定されていれば返す', async () => {
    const env = createMockEnv();
    env.STRIPE_PUBLISHABLE_KEY = 'pk_test_abc123';
    const request = new Request('https://tsuchinote.com/api/subscription/stripe-key');
    const res = await stripeKeyHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.publishableKey).toBe('pk_test_abc123');
  });

  it('公開鍵が未設定で500', async () => {
    const env = createMockEnv();
    env.STRIPE_PUBLISHABLE_KEY = '';
    const request = new Request('https://tsuchinote.com/api/subscription/stripe-key');
    const res = await stripeKeyHandler({ request, env });
    expect(res.status).toBe(500);
  });
});
