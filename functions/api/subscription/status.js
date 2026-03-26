/**
 * GET /api/subscription/status — サブスクリプションステータス取得
 */

import { requireAuth } from '../../lib/auth-helper.js';
import { isMockMode, stripeRequest } from '../../lib/stripe-helper.js';
import { jsonResponse, errorResponse } from '../../lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  try {
    // モックモード
    if (isMockMode(env)) {
      return jsonResponse({
        plan: 'free',
        subscription: null,
        message: 'Stripeテストモード',
      });
    }

    const user = await env.DB.prepare(`
      SELECT plan, stripe_subscription_id, stripe_customer_id
      FROM users WHERE id = ?
    `).bind(userId).first();

    if (!user) {
      throw new Error(`ユーザーが見つかりません: ${userId}`);
    }

    const result = {
      plan: user.plan || 'free',
      subscription: null,
    };

    if (user.stripe_subscription_id) {
      try {
        const subscription = await stripeRequest(
          `/subscriptions/${user.stripe_subscription_id}`,
          'GET',
          null,
          env
        );
        result.subscription = {
          id: subscription.id,
          status: subscription.status,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: subscription.cancel_at_period_end,
          next_billing_date: new Date(subscription.current_period_end * 1000).toISOString(),
        };
      } catch (err) {
        result.subscription = {
          id: user.stripe_subscription_id,
          status: 'unknown',
          error: 'サブスクリプション詳細の取得に失敗しました',
        };
      }
    }

    return jsonResponse(result);
  } catch (err) {
    console.error('ステータス取得エラー:', err.message);
    return errorResponse('サブスクリプション情報の取得に失敗しました', 500);
  }
}
