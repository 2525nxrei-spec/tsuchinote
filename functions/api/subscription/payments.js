/**
 * GET /api/subscription/payments — 支払い履歴取得
 * 認証必須。StripeのInvoice APIから支払い済みインボイスを取得して返す
 */

import { requireAuth } from '../../lib/auth-helper.js';
import {
  isMockMode,
  stripeRequest,
  resolvePlanFromPriceId,
} from '../../lib/stripe-helper.js';
import { jsonResponse, errorResponse } from '../../lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { userId } = auth;

  try {
    // モックモード（STRIPE_SECRET_KEY未設定時）
    if (isMockMode(env)) {
      return jsonResponse({ payments: [], mock: true });
    }

    // DBからstripe_customer_idを取得
    const user = await env.DB.prepare(
      'SELECT stripe_customer_id FROM users WHERE id = ?'
    ).bind(userId).first();

    if (!user?.stripe_customer_id) {
      return jsonResponse({ payments: [] });
    }

    // Stripe APIから支払い履歴を取得（最新20件）
    const customerId = encodeURIComponent(user.stripe_customer_id);
    const invoicesData = await stripeRequest(
      `/invoices?customer=${customerId}&limit=20&status=paid`,
      'GET',
      null,
      env
    );

    const invoices = invoicesData.data || [];

    // プラン名の日本語マッピング
    const planNameMap = {
      light: 'ライトプラン',
      pro: 'プロプラン',
    };

    // フロントエンドが期待する形式に変換
    const payments = invoices.map((invoice) => {
      const lineItem = invoice.lines?.data?.[0];
      const priceId = lineItem?.price?.id || '';
      const planKey = resolvePlanFromPriceId(priceId, env);

      return {
        date: invoice.created ? new Date(invoice.created * 1000).toISOString() : null,
        planName: planNameMap[planKey] || planKey,
        amount: invoice.amount_paid || 0,
        status: invoice.status === 'paid' ? 'succeeded' : invoice.status,
        invoiceId: invoice.id,
        invoicePdf: invoice.invoice_pdf || null,
      };
    });

    return jsonResponse({ payments });
  } catch (err) {
    console.error('支払い履歴取得エラー:', err.message);
    return errorResponse('支払い履歴の取得に失敗しました', 500);
  }
}
