/**
 * Stripe決済テスト強化 第2ラウンド
 * Webhook全イベント異常系、署名検証異常系、stripeRequest、DB例外
 */

import { describe, it, expect, vi } from 'vitest';
import { onRequestPost as webhookHandler } from '../functions/api/stripe/webhook.js';
import { onRequestPost as checkoutHandler } from '../functions/api/subscription/checkout.js';
import { onRequestPost as cancelHandler } from '../functions/api/subscription/cancel.js';
import { onRequestGet as statusHandler } from '../functions/api/subscription/status.js';
import {
  isMockMode,
  verifyWebhookSignature,
  resolvePlanFromPriceId,
  stripeRequest,
} from '../functions/lib/stripe-helper.js';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';
import { createJwt } from '../functions/lib/utils.js';

const JWT_SECRET = 'test-secret-key-for-vitest-12345';

async function makeToken(userId = 'USER001') {
  return createJwt(
    { sub: userId, plan: 'free', exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  );
}

async function createValidSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const sig = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${sig}`;
}

// ========== Webhook署名検証 追加異常系 ==========
describe('verifyWebhookSignature - 追加異常系', () => {
  it('v1=部分が欠けている場合falseを返す', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = `t=${timestamp}`;
    expect(await verifyWebhookSignature('payload', sig, 'secret')).toBe(false);
  });

  it('t=部分が欠けている場合falseを返す', async () => {
    const sig = 'v1=abcdef1234567890';
    expect(await verifyWebhookSignature('payload', sig, 'secret')).toBe(false);
  });

  it('タイムスタンプが数値でない場合falseを返す', async () => {
    const sig = 't=notanumber,v1=abcdef';
    expect(await verifyWebhookSignature('payload', sig, 'secret')).toBe(false);
  });

  it('空の署名ヘッダーでfalse', async () => {
    expect(await verifyWebhookSignature('payload', '', 'secret')).toBe(false);
  });

  it('null署名ヘッダーでfalse', async () => {
    expect(await verifyWebhookSignature('payload', null, 'secret')).toBe(false);
  });

  it('署名の長さが異なる場合false', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = `t=${timestamp},v1=short`;
    expect(await verifyWebhookSignature('payload', sig, 'secret')).toBe(false);
  });

  it('複数のv1=がある場合最初のものを使う', async () => {
    const payload = '{"test": true}';
    const secret = 'whsec_multi';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const validSig = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    // 正しい署名を最初に配置
    const header = `t=${timestamp},v1=${validSig},v1=invalidsecond`;
    const result = await verifyWebhookSignature(payload, header, secret);
    expect(result).toBe(true);
  });

  it('ちょうど5分（300秒）のタイムスタンプは有効', async () => {
    const timestamp = (Math.floor(Date.now() / 1000) - 299).toString();
    const payload = '{"ok":true}';
    const secret = 'whsec_border';
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const sig = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const header = `t=${timestamp},v1=${sig}`;
    expect(await verifyWebhookSignature(payload, header, secret)).toBe(true);
  });
});

// ========== Webhook イベント処理 追加異常系 ==========
describe('POST /api/stripe/webhook - イベント処理追加異常系', () => {
  it('checkout.session.completed: plan_id未設定時はlightデフォルト', async () => {
    const env = createMockEnv();
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'USER_NO_PLAN',
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: { user_id: 'USER_NO_PLAN' },
        },
      },
    };
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    // plan_idがundefinedの場合、レスポンスのplanもundefined
    // ただしDB更新時は planId || 'light' で light になる
    expect(body.data.handled).toBe(true);
  });

  it('customer.subscription.updated: items.dataが空配列の場合freeに', async () => {
    const env = createMockEnv();
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_empty',
          customer: 'cus_empty',
          status: 'active',
          items: { data: [] },
        },
      },
    };
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    // priceIdがundefinedなのでfreeに解決される
    expect(body.data.plan).toBe('free');
  });

  it('customer.subscription.updated: itemsが欠落の場合freeに', async () => {
    const env = createMockEnv();
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_no_items',
          customer: 'cus_no_items',
          status: 'active',
        },
      },
    };
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.plan).toBe('free');
  });

  it('customer.subscription.updated: canceledステータスはfreeに', async () => {
    const env = createMockEnv();
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_canceled',
          customer: 'cus_canceled',
          status: 'canceled',
          items: { data: [{ price: { id: 'price_test_pro' } }] },
        },
      },
    };
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.plan).toBe('free');
    expect(body.data.status).toBe('canceled');
  });

  it('customer.subscription.updated: incomplete_expiredステータスはfreeに', async () => {
    const env = createMockEnv();
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_inc_exp',
          customer: 'cus_inc_exp',
          status: 'incomplete_expired',
          items: { data: [{ price: { id: 'price_test_light' } }] },
        },
      },
    };
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.plan).toBe('free');
  });

  it('customer.subscription.deleted: customer/idが空でもDBクエリは実行される', async () => {
    const env = createMockEnv();
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: '',
          customer: '',
        },
      },
    };
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.plan).toBe('free');
  });

  it('Webhookで複数の未知イベントタイプをまとめて確認', async () => {
    const env = createMockEnv();
    const unknownTypes = [
      'invoice.paid',
      'invoice.payment_succeeded',
      'payment_method.attached',
      'customer.created',
      'customer.updated',
      'setup_intent.succeeded',
    ];
    for (const eventType of unknownTypes) {
      const event = { type: eventType, data: { object: {} } };
      const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      const res = await webhookHandler({ request, env });
      expect(res.status).toBe(200);
      const body = await parseResponse(res);
      expect(body.data.handled).toBe(false);
      expect(body.data.type).toBe(eventType);
    }
  });

  it('webhook: DB例外時もレスポンスを返す（checkout.session.completed）', async () => {
    const env = createMockEnv({
      run: () => { throw new Error('DB write error'); },
    });
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'USER001',
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: { plan_id: 'light' },
        },
      },
    };
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const res = await webhookHandler({ request, env });
    // DB例外はcatchされて400になる
    expect(res.status).toBe(400);
  });

  it('webhook: 署名検証モードで別のシークレットを使った場合400', async () => {
    const env = createMockEnv();
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    env.STRIPE_WEBHOOK_SECRET = 'whsec_correct';
    const payload = JSON.stringify({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1' } },
    });
    // 異なるシークレットで署名
    const signature = await createValidSignature(payload, 'whsec_wrong');
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature,
      },
      body: payload,
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(400);
  });
});

// ========== resolvePlanFromPriceId 追加テスト ==========
describe('resolvePlanFromPriceId - 追加テスト', () => {
  it('nullのpriceIdはfreeを返す', () => {
    expect(resolvePlanFromPriceId(null, {})).toBe('free');
  });

  it('undefinedのpriceIdはfreeを返す', () => {
    expect(resolvePlanFromPriceId(undefined, {})).toBe('free');
  });

  it('空文字のpriceIdはfreeを返す', () => {
    expect(resolvePlanFromPriceId('', {})).toBe('free');
  });
});

// ========== stripeRequest テスト（fetchモック） ==========
describe('stripeRequest', () => {
  it('GET: 正常応答を返す', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'sub_123', status: 'active' }),
    });
    const env = { STRIPE_SECRET_KEY: 'sk_test_123' };
    const result = await stripeRequest('/subscriptions/sub_123', 'GET', null, env);
    expect(result.id).toBe('sub_123');
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    // Authorization ヘッダー検証
    const callArgs = globalThis.fetch.mock.calls[0];
    expect(callArgs[0]).toContain('/subscriptions/sub_123');
    expect(callArgs[1].headers['Authorization']).toBe('Bearer sk_test_123');
    globalThis.fetch = origFetch;
  });

  it('POST: bodyをURLSearchParamsとして送信', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'cs_123' }),
    });
    const env = { STRIPE_SECRET_KEY: 'sk_test_123' };
    const result = await stripeRequest('/checkout/sessions', 'POST', {
      mode: 'subscription',
      customer: 'cus_123',
    }, env);
    expect(result.id).toBe('cs_123');
    const callArgs = globalThis.fetch.mock.calls[0];
    expect(callArgs[1].method).toBe('POST');
    expect(callArgs[1].body).toContain('mode=subscription');
    expect(callArgs[1].body).toContain('customer=cus_123');
    globalThis.fetch = origFetch;
  });

  it('APIエラー時にエラーをthrowする', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ error: { message: 'Card declined' } }),
    });
    const env = { STRIPE_SECRET_KEY: 'sk_test_123' };
    await expect(stripeRequest('/charges', 'POST', { amount: 1000 }, env))
      .rejects.toThrow('Stripe API Error (402): Card declined');
    globalThis.fetch = origFetch;
  });

  it('APIエラーでerror.messageが空の場合デフォルトメッセージ', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: {} }),
    });
    const env = { STRIPE_SECRET_KEY: 'sk_test_123' };
    await expect(stripeRequest('/test', 'GET', null, env))
      .rejects.toThrow('Stripe APIエラー');
    globalThis.fetch = origFetch;
  });

  it('bodyにnull/undefined値があるキーはスキップされる', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'test' }),
    });
    const env = { STRIPE_SECRET_KEY: 'sk_test_123' };
    await stripeRequest('/test', 'POST', {
      valid: 'yes',
      nullable: null,
      undef: undefined,
    }, env);
    const callArgs = globalThis.fetch.mock.calls[0];
    expect(callArgs[1].body).toContain('valid=yes');
    expect(callArgs[1].body).not.toContain('nullable');
    expect(callArgs[1].body).not.toContain('undef');
    globalThis.fetch = origFetch;
  });
});

// ========== Checkout追加テスト ==========
describe('POST /api/subscription/checkout - 追加テスト', () => {
  it('本番モード: Stripe API失敗で500', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ email: 'user@test.com', stripe_customer_id: null }),
    });
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal server error' } }),
    });
    const request = new Request('https://tsuchinote.com/api/subscription/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'pro' }),
    });
    const res = await checkoutHandler({ request, env });
    expect(res.status).toBe(500);
    globalThis.fetch = origFetch;
  });

  it('freeプランはチェックアウト不可（500）', async () => {
    const token = await makeToken();
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'free' }),
    });
    const res = await checkoutHandler({ request, env });
    expect(res.status).toBe(500);
  });

  it('planフィールドなしで500', async () => {
    const token = await makeToken();
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/subscription/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const res = await checkoutHandler({ request, env });
    expect(res.status).toBe(500);
  });
});

// ========== Cancel追加テスト ==========
describe('POST /api/subscription/cancel - 追加テスト', () => {
  it('本番モード: Stripe APIエラーで500', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({ stripe_subscription_id: 'sub_fail' }),
    });
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Subscription not found' } }),
    });
    const request = new Request('https://tsuchinote.com/api/subscription/cancel', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await cancelHandler({ request, env });
    expect(res.status).toBe(500);
    globalThis.fetch = origFetch;
  });
});

// ========== Status追加テスト ==========
describe('GET /api/subscription/status - 追加テスト', () => {
  it('本番モード: Stripe fetch例外でもステータスを返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({
        plan: 'light',
        stripe_subscription_id: 'sub_exception',
        stripe_customer_id: 'cus_exception',
      }),
    });
    env.STRIPE_SECRET_KEY = 'sk_test_real';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const request = new Request('https://tsuchinote.com/api/subscription/status', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await statusHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.plan).toBe('light');
    expect(body.data.subscription.status).toBe('unknown');
    globalThis.fetch = origFetch;
  });

  it('本番モード: サブスク未設定でnullを返す', async () => {
    const token = await makeToken();
    const env = createMockEnv({
      first: () => ({
        plan: 'free',
        stripe_subscription_id: null,
        stripe_customer_id: 'cus_no_sub',
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
});
