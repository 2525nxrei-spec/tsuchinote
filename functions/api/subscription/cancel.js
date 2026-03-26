/**
 * POST /api/subscription/cancel — サブスクリプション解約
 */

import { requireAuth } from '../../lib/auth-helper.js';
import {
  isMockMode,
  stripeRequest,
  resolvePlanFromPriceId,
} from '../../lib/stripe-helper.js';
import { jsonResponse, errorResponse } from '../../lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  try {
    // モックモード: planを即座にfreeに変更
    if (isMockMode(env)) {
      await env.DB.prepare(`
        UPDATE users
        SET plan = 'free',
            stripe_subscription_id = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(userId).run();

      return jsonResponse({
        success: true,
        message: 'モックモード: サブスクリプションを即時キャンセルしました',
        plan: 'free',
      });
    }

    const user = await env.DB.prepare(
      'SELECT stripe_subscription_id FROM users WHERE id = ?'
    ).bind(userId).first();

    if (!user) {
      throw new Error(`ユーザーが見つかりません: ${userId}`);
    }

    if (!user.stripe_subscription_id) {
      throw new Error('アクティブなサブスクリプションがありません');
    }

    // 期間終了時にキャンセル
    const subscription = await stripeRequest(
      `/subscriptions/${user.stripe_subscription_id}`,
      'POST',
      { cancel_at_period_end: 'true' },
      env
    );

    return jsonResponse({
      success: true,
      message: '現在の請求期間終了時にキャンセルされます',
      cancel_at: new Date(subscription.current_period_end * 1000).toISOString(),
      plan: subscription.items?.data?.[0]?.price?.id
        ? resolvePlanFromPriceId(subscription.items.data[0].price.id, env)
        : 'unknown',
    });
  } catch (err) {
    return errorResponse(err.message, 400);
  }
}
