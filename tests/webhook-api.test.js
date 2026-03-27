/**
 * functions/api/stripe/webhook.js のテスト
 * Stripe Webhookイベント処理（外部API呼び出しなし）
 * 第2ラウンド: 署名検証・全イベント・異常系を網羅
 */

import { describe, it, expect } from 'vitest';
import { onRequestPost as webhookHandler } from '../functions/api/stripe/webhook.js';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';

// --- 基本イベント処理（モックモード=署名検証スキップ） ---
describe('POST /api/stripe/webhook - 基本イベント処理', () => {
  it('checkout.session.completedイベントを処理', async () => {
    const env = createMockEnv();
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'USER001',
          customer: 'cus_test123',
          subscription: 'sub_test123',
          metadata: { user_id: 'USER001', plan_id: 'light' },
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
    expect(body.data.handled).toBe(true);
    expect(body.data.type).toBe('checkout.session.completed');
    expect(body.data.userId).toBe('USER001');
    expect(body.data.plan).toBe('light');
  });

  it('checkout.session.completedでmetadata.user_idからユーザー特定', async () => {
    const env = createMockEnv();
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: null,
          customer: 'cus_test999',
          subscription: 'sub_test999',
          metadata: { user_id: 'USER_META', plan_id: 'pro' },
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
    expect(body.data.handled).toBe(true);
    expect(body.data.userId).toBe('USER_META');
    expect(body.data.plan).toBe('pro');
  });

  it('checkout.session.completedでユーザーID特定不可時400', async () => {
    const env = createMockEnv();
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: null,
          customer: 'cus_test123',
          subscription: 'sub_test123',
          metadata: {},
        },
      },
    };
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(400);
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
  });

  it('customer.subscription.updatedイベントを処理（active）', async () => {
    const env = createMockEnv();
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test123',
          customer: 'cus_test123',
          status: 'active',
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
    expect(body.data.handled).toBe(true);
    expect(body.data.plan).toBe('pro');
    expect(body.data.status).toBe('active');
  });

  it('customer.subscription.updatedで非activeステータスはfreeに', async () => {
    const env = createMockEnv();
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test123',
          customer: 'cus_test123',
          status: 'past_due',
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
    expect(body.data.status).toBe('past_due');
  });

  it('customer.subscription.updatedでlightプラン', async () => {
    const env = createMockEnv();
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test123',
          customer: 'cus_test123',
          status: 'active',
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
    expect(body.data.plan).toBe('light');
  });

  it('customer.subscription.deletedイベントでfreeに降格', async () => {
    const env = createMockEnv();
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test123',
          customer: 'cus_test123',
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
    expect(body.data.handled).toBe(true);
    expect(body.data.plan).toBe('free');
  });

  it('未知のイベントタイプはhandled=false', async () => {
    const env = createMockEnv();
    for (const eventType of ['payment_intent.succeeded', 'invoice.payment_failed', 'charge.refunded']) {
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
});

// --- 署名検証（STRIPE_SECRET_KEY設定時） ---
describe('POST /api/stripe/webhook - 署名検証', () => {
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

  it('Stripe-Signatureヘッダーなしで400', async () => {
    const env = createMockEnv();
    env.STRIPE_SECRET_KEY = 'sk_test_real_key';
    const payload = JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'USER001', customer: 'cus_1', subscription: 'sub_1', metadata: {} } },
    });
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(400);
    const body = await parseResponse(res);
    expect(body.error).toContain('Stripe-Signature');
  });

  it('不正な署名で400', async () => {
    const env = createMockEnv();
    env.STRIPE_SECRET_KEY = 'sk_test_real_key';
    const payload = JSON.stringify({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1' } },
    });
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': 't=1234567890,v1=invalidsignature',
      },
      body: payload,
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(400);
  });

  it('正しい署名で200', async () => {
    const webhookSecret = 'whsec_test123';
    const env = createMockEnv();
    env.STRIPE_SECRET_KEY = 'sk_test_real_key';
    env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    const event = {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_123', customer: 'cus_123' } },
    };
    const payload = JSON.stringify(event);
    const signature = await createValidSignature(payload, webhookSecret);
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature,
      },
      body: payload,
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.handled).toBe(true);
  });
});

// --- 異常系 ---
describe('POST /api/stripe/webhook - 異常系', () => {
  it('不正なJSONで400', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json at all',
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(400);
  });

  it('空のリクエストボディで400', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(400);
  });
});
