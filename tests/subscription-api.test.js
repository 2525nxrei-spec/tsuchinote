/**
 * functions/api/subscription/ のAPIエンドポイントテスト
 * ステータス取得、チェックアウト、解約、Stripe公開鍵
 * 第2ラウンド: 本番Stripeモード・エッジケース・異常系を網羅
 */

import { describe, it, expect, vi } from 'vitest';
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
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/status', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await statusHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.plan).toBe('free');
    expect(body.data.subscription).toBeNull();
  });

  it('本番モード: サブスクなしユーザー', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({
        plan: 'free',
        stripe_subscription_id: null,
        stripe_customer_id: null,
      }),
    });
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    const request = new Request('https://tsuchinote.com/api/subscription/status', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await statusHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.plan).toBe('free');
    expect(body.data.subscription).toBeNull();
  });

  it('本番モード: ユーザー不在で500', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    const request = new Request('https://tsuchinote.com/api/subscription/status', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await statusHandler({ request, env });
    expect(res.status).toBe(500);
  });

  it('本番モード: Stripe API取得成功', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({
        plan: 'light',
        stripe_subscription_id: 'sub_abc123',
        stripe_customer_id: 'cus_abc123',
      }),
    });
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    // fetchをモック
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'sub_abc123',
        status: 'active',
        current_period_end: 1735689600,
        cancel_at_period_end: false,
      }),
    });
    const request = new Request('https://tsuchinote.com/api/subscription/status', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await statusHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.plan).toBe('light');
    expect(body.data.subscription).toBeTruthy();
    expect(body.data.subscription.status).toBe('active');
    globalThis.fetch = origFetch;
  });

  it('本番モード: Stripe API取得失敗でもステータスは返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({
        plan: 'pro',
        stripe_subscription_id: 'sub_broken',
        stripe_customer_id: 'cus_broken',
      }),
    });
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'subscription not found' } }),
    });
    const request = new Request('https://tsuchinote.com/api/subscription/status', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await statusHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.plan).toBe('pro');
    expect(body.data.subscription.status).toBe('unknown');
    globalThis.fetch = origFetch;
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

  it('モックモードでlightプランのモックセッションを返す', async () => {
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

  it('モックモードでproプランのモックセッションを返す', async () => {
    const token = await makeToken();
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'pro' }),
    });
    const res = await checkoutHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.mock).toBe(true);
  });

  it('plan_idフィールドでも受け付ける', async () => {
    const token = await makeToken();
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan_id: 'light' }),
    });
    const res = await checkoutHandler({ request, env });
    expect(res.status).toBe(200);
  });

  it('不正なJSONボディで400', async () => {
    const token = await makeToken();
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: 'not json',
    });
    const res = await checkoutHandler({ request, env });
    expect(res.status).toBe(400);
  });

  it('本番モード: Stripe Checkout Session作成成功', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ email: 'user@test.com', stripe_customer_id: 'cus_existing' }),
    });
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    env.STRIPE_PRICE_LIGHT = 'price_light_123';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'cs_test_session', client_secret: 'cs_secret_abc' }),
    });
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
    expect(body.data.clientSecret).toBe('cs_secret_abc');
    expect(body.data.session_id).toBe('cs_test_session');
    globalThis.fetch = origFetch;
  });

  it('本番モード: ユーザー不在で500', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    const request = new Request('https://tsuchinote.com/api/subscription/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'light' }),
    });
    const res = await checkoutHandler({ request, env });
    expect(res.status).toBe(500);
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

  it('本番モード: ユーザー不在で500', async () => {
    const token = await makeToken();
    const env = createMockEnv({ first: () => null });
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    const request = new Request('https://tsuchinote.com/api/subscription/cancel', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cancelHandler({ request, env });
    expect(res.status).toBe(500);
  });

  it('本番モード: サブスクなしで500', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ stripe_subscription_id: null }),
    });
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    const request = new Request('https://tsuchinote.com/api/subscription/cancel', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cancelHandler({ request, env });
    expect(res.status).toBe(500);
  });

  it('本番モード: Stripe APIで期間終了キャンセル成功', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ stripe_subscription_id: 'sub_cancel_test' }),
    });
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'sub_cancel_test',
        current_period_end: 1735689600,
        items: { data: [{ price: { id: 'price_test_light' } }] },
      }),
    });
    const request = new Request('https://tsuchinote.com/api/subscription/cancel', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cancelHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.success).toBe(true);
    expect(body.data.cancel_at).toBeTruthy();
    globalThis.fetch = origFetch;
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
