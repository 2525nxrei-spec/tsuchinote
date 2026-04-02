/**
 * POST /api/subscription/portal — Stripe Customer Portal Session作成
 */

import { requireAuth } from '../../lib/auth-helper.js';
import { isMockMode, stripeRequest } from '../../lib/stripe-helper.js';
import { jsonResponse, errorResponse } from '../../lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  try {
    // ユーザーのstripe_customer_idをDBから取得
    const user = await env.DB.prepare(
      'SELECT stripe_customer_id FROM users WHERE id = ?'
    ).bind(userId).first();

    if (!user || !user.stripe_customer_id) {
      return errorResponse('サブスクリプション情報がありません', 400);
    }

    // モックモード
    if (isMockMode(env)) {
      return jsonResponse({
        portal_url: 'https://billing.stripe.com/mock-portal',
        mock: true,
      });
    }

    const appUrl = env.APP_URL || 'https://tsuchinote.com';

    const session = await stripeRequest('/billing_portal/sessions', 'POST', {
      customer: user.stripe_customer_id,
      return_url: `${appUrl}/#/settings`,
    }, env);

    return jsonResponse({ portal_url: session.url });
  } catch (err) {
    console.error('Portalエラー:', err.message);
    return errorResponse('ポータルの作成に失敗しました', 500);
  }
}
