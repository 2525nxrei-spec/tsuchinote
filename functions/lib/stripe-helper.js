/**
 * ツチノート — Stripe共通ヘルパー
 * Stripe REST API呼び出し、Webhook署名検証
 */

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/** 本番 Stripe Price ID */
export const STRIPE_PRICE_LIGHT = 'price_1TF9k09Fc8HnuaokrMmKlFo4';
export const STRIPE_PRICE_PRO = 'price_1TFA2Y9Fc8Hnuaokitufi136';

/** プランIDとStripe Price IDのマッピング（Light / Pro の2プラン） */
export const PLAN_MAP = {
  light: 'STRIPE_PRICE_LIGHT',
  pro: 'STRIPE_PRICE_PRO',
};

/** モックモードかどうか判定 */
export function isMockMode(env) {
  return !env.STRIPE_SECRET_KEY;
}

/** Stripe REST APIへのリクエストヘルパー */
export async function stripeRequest(path, method, body, env) {
  const url = `${STRIPE_API_BASE}${path}`;
  const headers = {
    'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const options = { method, headers };

  if (body && method !== 'GET') {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }
    options.body = params.toString();
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.error?.message || 'Stripe APIエラー';
    throw new Error(`Stripe API Error (${response.status}): ${errorMessage}`);
  }

  return data;
}

/** Webhook署名検証（HMAC-SHA256） */
export async function verifyWebhookSignature(payload, signatureHeader, secret) {
  try {
    const elements = signatureHeader.split(',');
    const timestampStr = elements.find(e => e.startsWith('t='));
    const signatureStr = elements.find(e => e.startsWith('v1='));

    if (!timestampStr || !signatureStr) return false;

    const timestamp = timestampStr.substring(2);
    const expectedSignature = signatureStr.substring(3);

    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp, 10)) > 300) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));

    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (computedSignature.length !== expectedSignature.length) return false;
    let result = 0;
    for (let i = 0; i < computedSignature.length; i++) {
      result |= computedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    return result === 0;
  } catch {
    return false;
  }
}

/** Stripe Price IDからプラン名を逆引き */
export function resolvePlanFromPriceId(priceId, env) {
  if (priceId === (env.STRIPE_PRICE_LIGHT || STRIPE_PRICE_LIGHT)) return 'light';
  if (priceId === (env.STRIPE_PRICE_PRO || STRIPE_PRICE_PRO)) return 'pro';
  return 'free';
}
