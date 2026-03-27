/**
 * functions/api/stripe/webhook.js のテスト
 * Stripe Webhookイベント処理（外部API呼び出しなし）
 */

import { describe, it, expect } from 'vitest';
import { onRequestPost as webhookHandler } from '../functions/api/stripe/webhook.js';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';

describe('POST /api/stripe/webhook', () => {
  it('checkout.session.completedイベントを処理', async () => {
    const env = createMockEnv();
    // モックモード（STRIPE_SECRET_KEY空）なので署名検証スキップ
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
  });

  it('customer.subscription.updatedイベントを処理', async () => {
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
    const event = {
      type: 'payment_intent.succeeded',
      data: { object: {} },
    };
    const request = new Request('https://tsuchinote.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const res = await webhookHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.handled).toBe(false);
  });

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
});
