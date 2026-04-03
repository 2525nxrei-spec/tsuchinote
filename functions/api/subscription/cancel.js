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
    // モックモードではStripe APIが利用できないため決済操作を拒否
    if (isMockMode(env)) {
      return errorResponse('Stripe APIキーが未設定のため、解約処理を実行できません', 503);
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

    // DBのcancel_at_period_endフラグを更新
    await env.DB.prepare(
      'UPDATE users SET cancel_at_period_end = 1, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(userId).run();

    return jsonResponse({
      success: true,
      message: '現在の請求期間終了時にキャンセルされます',
      cancel_at: new Date(subscription.current_period_end * 1000).toISOString(),
      plan: subscription.items?.data?.[0]?.price?.id
        ? resolvePlanFromPriceId(subscription.items.data[0].price.id, env)
        : 'unknown',
    });
  } catch (err) {
    console.error('解約エラー:', err.message);
    return errorResponse('解約処理に失敗しました', 500);
  }
}
