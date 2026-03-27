/**
 * functions/lib/stripe-helper.js のテスト
 * Stripeヘルパー関数のテスト（外部APIは呼ばない）
 */

import { describe, it, expect } from 'vitest';
import {
  isMockMode,
  PLAN_MAP,
  resolvePlanFromPriceId,
  verifyWebhookSignature,
} from '../functions/lib/stripe-helper.js';

describe('isMockMode', () => {
  it('STRIPE_SECRET_KEYが未設定ならtrue', () => {
    expect(isMockMode({})).toBe(true);
    expect(isMockMode({ STRIPE_SECRET_KEY: '' })).toBe(true);
  });

  it('STRIPE_SECRET_KEYが設定されていればfalse', () => {
    expect(isMockMode({ STRIPE_SECRET_KEY: 'sk_test_123' })).toBe(false);
  });
});

describe('PLAN_MAP', () => {
  it('light と pro のマッピングが存在する', () => {
    expect(PLAN_MAP.light).toBe('STRIPE_PRICE_LIGHT');
    expect(PLAN_MAP.pro).toBe('STRIPE_PRICE_PRO');
  });

  it('存在しないプランはundefined', () => {
    expect(PLAN_MAP.free).toBeUndefined();
    expect(PLAN_MAP.enterprise).toBeUndefined();
  });
});

describe('resolvePlanFromPriceId', () => {
  const env = {
    STRIPE_PRICE_LIGHT: 'price_test_light',
    STRIPE_PRICE_PRO: 'price_test_pro',
  };

  it('Light Price IDからlightを返す', () => {
    expect(resolvePlanFromPriceId('price_test_light', env)).toBe('light');
  });

  it('Pro Price IDからproを返す', () => {
    expect(resolvePlanFromPriceId('price_test_pro', env)).toBe('pro');
  });

  it('不明なPrice IDはfreeを返す', () => {
    expect(resolvePlanFromPriceId('price_unknown', env)).toBe('free');
  });

  it('env未設定時はコード内定数にフォールバック', () => {
    // stripe-helper.js内の定数を使う
    expect(resolvePlanFromPriceId('price_1TF9k09Fc8HnuaokrMmKlFo4', {})).toBe('light');
    expect(resolvePlanFromPriceId('price_1TFA2Y9Fc8Hnuaokitufi136', {})).toBe('pro');
  });
});

describe('verifyWebhookSignature', () => {
  it('signatureヘッダーが不正ならfalseを返す', async () => {
    expect(await verifyWebhookSignature('payload', 'invalid', 'secret')).toBe(false);
    expect(await verifyWebhookSignature('payload', '', 'secret')).toBe(false);
  });

  it('タイムスタンプが古すぎる場合falseを返す', async () => {
    // 10分前のタイムスタンプ（許容は5分）
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const sig = `t=${oldTimestamp},v1=fakesig`;
    expect(await verifyWebhookSignature('payload', sig, 'secret')).toBe(false);
  });

  it('正しい署名で検証成功', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = '{"test": true}';
    const secret = 'whsec_test_secret';
    const signedPayload = `${timestamp}.${payload}`;

    // HMAC-SHA256で署名を計算
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const expectedSig = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const header = `t=${timestamp},v1=${expectedSig}`;
    const result = await verifyWebhookSignature(payload, header, secret);
    expect(result).toBe(true);
  });

  it('改竄されたペイロードで検証失敗', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = 'whsec_test';
    const signedPayload = `${timestamp}.original`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const sig = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const header = `t=${timestamp},v1=${sig}`;
    // 改竄されたペイロード
    const result = await verifyWebhookSignature('tampered', header, secret);
    expect(result).toBe(false);
  });
});
