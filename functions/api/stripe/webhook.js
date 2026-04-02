/**
 * POST /api/stripe/webhook — Stripe Webhookイベント処理
 * 認証不要（Stripe署名検証で保護）
 */

import {
  isMockMode,
  verifyWebhookSignature,
  resolvePlanFromPriceId,
} from '../../lib/stripe-helper.js';
import { jsonResponse, errorResponse, generateUlid } from '../../lib/utils.js';

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
  const stripeEventId = event.id;

  // 冪等性チェック: 同一イベントの重複処理を防止
  try {
    const existing = await env.DB.prepare(
      'SELECT id FROM webhooks_log WHERE stripe_event_id = ?'
    ).bind(stripeEventId).first();

    if (existing) {
      console.log(`Webhook重複スキップ: ${stripeEventId}`);
      return { received: true, type: eventType, duplicate: true };
    }
  } catch (err) {
    // テーブルが存在しない場合は無視して処理を続行
    console.warn('webhooks_logテーブルの参照に失敗（テーブル未作成の可能性）:', err.message);
  }

  let result;
  switch (eventType) {
    case 'checkout.session.completed':
      result = await handleCheckoutCompleted(event.data.object, env);
      break;
    case 'customer.subscription.updated':
      result = await handleSubscriptionUpdated(event.data.object, env);
      break;
    case 'customer.subscription.deleted':
      result = await handleSubscriptionDeleted(event.data.object, env);
      break;
    case 'invoice.payment_succeeded':
      result = await handlePaymentSucceeded(event.data.object, env);
      break;
    case 'invoice.payment_failed':
      result = handlePaymentFailed(event.data.object);
      break;
    default:
      result = { received: true, type: eventType, handled: false };
  }

  // 処理ログをwebhooks_logに保存
  try {
    await env.DB.prepare(
      'INSERT INTO webhooks_log (id, event_type, stripe_event_id, payload, processed_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      generateUlid(),
      eventType,
      stripeEventId,
      payload,
      new Date().toISOString()
    ).run();
  } catch (err) {
    // テーブルが存在しない場合は無視（ログ保存失敗でも処理結果は返す）
    console.warn('webhooks_logへの書き込みに失敗:', err.message);
  }

  return result;
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
        cancel_at_period_end = 0,
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
        cancel_at_period_end = ?,
        updated_at = datetime('now')
    WHERE stripe_customer_id = ? OR stripe_subscription_id = ?
  `).bind(effectivePlan, subscription.cancel_at_period_end ? 1 : 0, customerId, subscriptionId).run();

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

async function handlePaymentSucceeded(invoice, env) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;
  const amountPaid = invoice.amount_paid;

  await env.DB.prepare(`
    UPDATE users
    SET updated_at = datetime('now')
    WHERE stripe_customer_id = ?
  `).bind(customerId).run();

  console.log(`支払い成功: customer=${customerId}, subscription=${subscriptionId}, amount=${amountPaid}円`);

  return {
    received: true,
    type: 'invoice.payment_succeeded',
    handled: true,
    customerId,
    subscriptionId,
    amountPaid,
  };
}

function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;
  const attemptCount = invoice.attempt_count;
  const invoiceId = invoice.id;

  console.error(`支払い失敗: customer=${customerId}, attempt=${attemptCount}, invoice=${invoiceId}`);

  return {
    received: true,
    type: 'invoice.payment_failed',
    handled: true,
    customerId,
    attemptCount,
    invoiceId,
  };
}
