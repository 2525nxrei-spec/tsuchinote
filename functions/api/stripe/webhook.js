/**
 * POST /api/stripe/webhook — Stripe Webhookイベント処理
 * 認証不要（Stripe署名検証で保護）
 */

import {
  isMockMode,
  verifyWebhookSignature,
  resolvePlanFromPriceId,
} from '../../lib/stripe-helper.js';
import { jsonResponse, errorResponse } from '../../lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const result = await handleWebhook(request, env);
    return jsonResponse(result);
  } catch (err) {
    return errorResponse(err.message, 400);
  }
}

async function handleWebhook(request, env) {
  const payload = await request.text();

  // 署名検証（モックモードではスキップ）
  if (!isMockMode(env)) {
    const signature = request.headers.get('Stripe-Signature');
    if (!signature) {
      throw new Error('Stripe-Signatureヘッダーがありません');
    }
    const isValid = await verifyWebhookSignature(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
    if (!isValid) {
      throw new Error('Webhook署名の検証に失敗しました');
    }
  }

  const event = JSON.parse(payload);
  const eventType = event.type;

  switch (eventType) {
    case 'checkout.session.completed':
      return await handleCheckoutCompleted(event.data.object, env);
    case 'customer.subscription.updated':
      return await handleSubscriptionUpdated(event.data.object, env);
    case 'customer.subscription.deleted':
      return await handleSubscriptionDeleted(event.data.object, env);
    default:
      return { received: true, type: eventType, handled: false };
  }
}

async function handleCheckoutCompleted(session, env) {
  const userId = session.client_reference_id || session.metadata?.user_id;
  const planId = session.metadata?.plan_id;

  if (!userId) {
    throw new Error('Webhook: ユーザーIDが特定できません');
  }

  await env.DB.prepare(`
    UPDATE users
    SET stripe_customer_id = ?,
        stripe_subscription_id = ?,
        plan = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    session.customer,
    session.subscription,
    planId || 'light',
    userId
  ).run();

  return {
    received: true,
    type: 'checkout.session.completed',
    handled: true,
    userId,
    plan: planId,
  };
}

async function handleSubscriptionUpdated(subscription, env) {
  const subscriptionId = subscription.id;
  const customerId = subscription.customer;

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = resolvePlanFromPriceId(priceId, env);
  const effectivePlan = subscription.status === 'active' ? plan : 'free';

  await env.DB.prepare(`
    UPDATE users
    SET plan = ?,
        updated_at = datetime('now')
    WHERE stripe_customer_id = ? OR stripe_subscription_id = ?
  `).bind(effectivePlan, customerId, subscriptionId).run();

  return {
    received: true,
    type: 'customer.subscription.updated',
    handled: true,
    plan: effectivePlan,
    status: subscription.status,
  };
}

async function handleSubscriptionDeleted(subscription, env) {
  const subscriptionId = subscription.id;
  const customerId = subscription.customer;

  await env.DB.prepare(`
    UPDATE users
    SET plan = 'free',
        stripe_subscription_id = NULL,
        updated_at = datetime('now')
    WHERE stripe_customer_id = ? OR stripe_subscription_id = ?
  `).bind(customerId, subscriptionId).run();

  return {
    received: true,
    type: 'customer.subscription.deleted',
    handled: true,
    plan: 'free',
  };
}
