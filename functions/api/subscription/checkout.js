/**
 * POST /api/subscription/checkout — Stripe Checkout Session作成
 */

import { requireAuth } from '../../lib/auth-helper.js';
import {
  isMockMode,
  stripeRequest,
  PLAN_MAP,
  STRIPE_PRICE_LIGHT,
  STRIPE_PRICE_PRO,
} from '../../lib/stripe-helper.js';
import { jsonResponse, errorResponse } from '../../lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse('リクエストボディが不正です');
    }

    const planId = body.plan_id || body.plan;

    // プランの検証
    if (!PLAN_MAP[planId]) {
      throw new Error(`無効なプランID: ${planId}。"light" または "pro" を指定してください。`);
    }

    // モックモード
    if (isMockMode(env)) {
      return jsonResponse({
        url: 'https://tsuchinote.com/app.html?payment=success&session_id=mock_session_123',
        session_id: 'mock_session_123',
        mock: true,
      });
    }

    // ユーザー情報をDBから取得
    const user = await env.DB.prepare(
      'SELECT email, stripe_customer_id FROM users WHERE id = ?'
    ).bind(userId).first();

    if (!user) {
      throw new Error(`ユーザーが見つかりません: ${userId}`);
    }

    const appUrl = env.APP_URL || 'https://tsuchinote.com';

    // 環境変数にPrice IDがあればそちらを優先、なければコード内定数を使用
    const fallbackPrice = planId === 'light' ? STRIPE_PRICE_LIGHT : STRIPE_PRICE_PRO;
    const priceId = env[PLAN_MAP[planId]] || fallbackPrice;
    if (!priceId) {
      throw new Error(`Stripe Price IDが設定されていません: ${PLAN_MAP[planId]}`);
    }

    // リダイレクト型 Stripe Checkout
    const params = {
      'mode': 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'success_url': `${appUrl}/app.html?payment=success&session_id={CHECKOUT_SESSION_ID}#/settings`,
      'cancel_url': `${appUrl}/app.html?payment=cancel#/settings`,
      'client_reference_id': userId,
      'locale': 'ja',
      'metadata[user_id]': userId,
      'metadata[plan_id]': planId,
    };

    if (user.stripe_customer_id) {
      params.customer = user.stripe_customer_id;
    } else if (user.email) {
      params.customer_email = user.email;
    }

    const session = await stripeRequest('/checkout/sessions', 'POST', params, env);

    return jsonResponse({
      url: session.url,
      session_id: session.id,
    });
  } catch (err) {
    console.error('Checkoutエラー:', err.message);
    return errorResponse('決済セッションの作成に失敗しました', 500);
  }
}
