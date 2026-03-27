// ⚠️ 旧実装 — 本番はfunctions/を使用
/**
 * ツチノート - Stripe決済モジュール
 * Cloudflare Workers環境でStripe REST APIを直接呼び出す
 * env.STRIPE_SECRET_KEYが空の場合はモックモードで動作
 */

// ============================================================
// 設定値
// ============================================================
const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/** 本番 Stripe Price ID */
const STRIPE_PRICE_LIGHT = 'price_1TF9k09Fc8HnuaokrMmKlFo4';
const STRIPE_PRICE_PRO = 'price_1TFA2Y9Fc8Hnuaokitufi136';

/** プランIDとStripe Price IDのマッピング（Light / Pro の2プラン） */
const PLAN_MAP = {
  light: 'STRIPE_PRICE_LIGHT',
  pro: 'STRIPE_PRICE_PRO',
};

// ============================================================
// ヘルパー関数
// ============================================================

/**
 * モックモードかどうか判定
 * @param {object} env - Workers環境変数
 * @returns {boolean}
 */
function isMockMode(env) {
  return !env.STRIPE_SECRET_KEY;
}

/**
 * Stripe REST APIへのリクエストヘルパー
 * @param {string} path - APIパス（例: "/checkout/sessions"）
 * @param {string} method - HTTPメソッド
 * @param {object|null} body - リクエストボディ（key-valueオブジェクト）
 * @param {object} env - Workers環境変数
 * @returns {Promise<object>} APIレスポンス
 */
async function stripeRequest(path, method, body, env) {
  const url = `${STRIPE_API_BASE}${path}`;
  const headers = {
    'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const options = { method, headers };

  // ボディをURLエンコード形式に変換
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

/**
 * Webhook署名検証（HMAC-SHA256）
 * Cloudflare Workers の Web Crypto API を使用
 * @param {string} payload - リクエストボディ（生テキスト）
 * @param {string} signatureHeader - Stripe-Signatureヘッダー値
 * @param {string} secret - Webhook署名シークレット
 * @returns {Promise<boolean>} 検証結果
 */
async function verifyWebhookSignature(payload, signatureHeader, secret) {
  try {
    // Stripe-Signatureヘッダーをパース（形式: t=timestamp,v1=signature）
    const elements = signatureHeader.split(',');
    const timestampStr = elements.find(e => e.startsWith('t='));
    const signatureStr = elements.find(e => e.startsWith('v1='));

    if (!timestampStr || !signatureStr) {
      return false;
    }

    const timestamp = timestampStr.substring(2);
    const expectedSignature = signatureStr.substring(3);

    // タイムスタンプの許容範囲チェック（5分以内）
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp, 10)) > 300) {
      return false;
    }

    // 署名対象文字列: "timestamp.payload"
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
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedPayload)
    );

    // 16進数文字列に変換
    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // タイミング攻撃対策のための定数時間比較
    if (computedSignature.length !== expectedSignature.length) {
      return false;
    }
    let result = 0;
    for (let i = 0; i < computedSignature.length; i++) {
      result |= computedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    return result === 0;
  } catch {
    return false;
  }
}

// ============================================================
// メインAPI関数
// ============================================================

/**
 * Stripe Checkout Sessionを作成
 * @param {string} userId - ユーザーID
 * @param {string} planId - プランID（"light" または "pro"）
 * @param {object} env - Workers環境変数
 * @returns {Promise<object>} { url, session_id }
 */
export async function createCheckout(userId, planId, env) {
  // プランの検証
  if (!PLAN_MAP[planId]) {
    throw new Error(`無効なプランID: ${planId}。"light" または "pro" を指定してください。`);
  }

  // モックモード
  if (isMockMode(env)) {
    return {
      url: '/#/settings?payment=mock_success',
      session_id: 'mock_session_123',
      payment_methods: ['card', 'paypay', 'apple_pay', 'google_pay'],
    };
  }

  // ユーザー情報をDBから取得
  const user = await env.DB.prepare(
    'SELECT email, stripe_customer_id FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    throw new Error(`ユーザーが見つかりません: ${userId}`);
  }

  // アプリのベースURL
  const appUrl = env.APP_URL || 'https://tsuchinote.com';

  // Checkout Session作成パラメータ
  // 環境変数にPrice IDがあればそちらを優先、なければコード内定数を使用
  const fallbackPrice = planId === 'light' ? STRIPE_PRICE_LIGHT : STRIPE_PRICE_PRO;
  const priceId = env[PLAN_MAP[planId]] || fallbackPrice;
  if (!priceId) {
    throw new Error(`Stripe Price IDが設定されていません: ${PLAN_MAP[planId]}`);
  }

  // payment_method_types を指定しない → Stripeダッシュボードで有効化した決済方法が全て自動表示
  // （card=クレカ/Apple Pay/Google Pay、paypay、konbini 等）
  const params = {
    'mode': 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'success_url': `${appUrl}/#/settings?payment=success`,
    'cancel_url': `${appUrl}/#/settings?payment=cancel`,
    'client_reference_id': userId,
    'locale': 'ja',
    'metadata[user_id]': userId,
    'metadata[plan_id]': planId,
  };

  // 既存のStripe Customerがあれば使用、なければメールアドレスを指定
  if (user.stripe_customer_id) {
    params.customer = user.stripe_customer_id;
  } else if (user.email) {
    params.customer_email = user.email;
  }

  const session = await stripeRequest('/checkout/sessions', 'POST', params, env);

  return {
    url: session.url,
    session_id: session.id,
  };
}

/**
 * Stripe Webhookイベントを処理
 * @param {Request} request - Webhookリクエスト
 * @param {object} env - Workers環境変数
 * @returns {Promise<object>} 処理結果
 */
export async function handleWebhook(request, env) {
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
      // 未対応のイベントは無視
      return { received: true, type: eventType, handled: false };
  }
}

/**
 * checkout.session.completed イベント処理
 * stripe_customer_id, stripe_subscription_id を保存し、planを更新
 */
async function handleCheckoutCompleted(session, env) {
  const userId = session.client_reference_id || session.metadata?.user_id;
  const planId = session.metadata?.plan_id;

  if (!userId) {
    throw new Error('Webhook: ユーザーIDが特定できません');
  }

  // ユーザー情報を更新
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

/**
 * customer.subscription.updated イベント処理
 * プランのアップグレード/ダウングレードに対応
 */
async function handleSubscriptionUpdated(subscription, env) {
  const subscriptionId = subscription.id;
  const customerId = subscription.customer;

  // サブスクリプションのPrice IDからプランを判定
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = resolvePlanFromPriceId(priceId, env);

  // ステータスがアクティブでない場合はfreeに戻す
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

/**
 * customer.subscription.deleted イベント処理
 * planを"free"に戻す
 */
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

/**
 * Stripe Price IDからプラン名を逆引き
 * @param {string} priceId - Stripe Price ID
 * @param {object} env - Workers環境変数
 * @returns {string} プラン名
 */
function resolvePlanFromPriceId(priceId, env) {
  // 環境変数またはコード内定数と照合
  if (priceId === (env.STRIPE_PRICE_LIGHT || STRIPE_PRICE_LIGHT)) return 'light';
  if (priceId === (env.STRIPE_PRICE_PRO || STRIPE_PRICE_PRO)) return 'pro';
  return 'free'; // 不明なPrice IDの場合はfreeに
}

/**
 * ユーザーの現在のプラン情報を取得
 * @param {string} userId - ユーザーID
 * @param {object} env - Workers環境変数
 * @returns {Promise<object>} プラン情報
 */
export async function getStatus(userId, env) {
  // モックモード
  if (isMockMode(env)) {
    return {
      plan: 'free',
      subscription: null,
      message: 'Stripeテストモード',
    };
  }

  // ユーザー情報を取得
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

  // サブスクリプション詳細をStripeから取得
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
        // 次回請求日をISO形式で返す
        next_billing_date: new Date(subscription.current_period_end * 1000).toISOString(),
      };
    } catch (err) {
      // Stripe API取得失敗時はDB情報のみ返す
      result.subscription = {
        id: user.stripe_subscription_id,
        status: 'unknown',
        error: 'サブスクリプション詳細の取得に失敗しました',
      };
    }
  }

  return result;
}

/**
 * サブスクリプションをキャンセル（期間終了まで有効）
 * @param {string} userId - ユーザーID
 * @param {object} env - Workers環境変数
 * @returns {Promise<object>} キャンセル結果
 */
export async function cancelSubscription(userId, env) {
  // モックモード: planを即座にfreeに変更
  if (isMockMode(env)) {
    await env.DB.prepare(`
      UPDATE users
      SET plan = 'free',
          stripe_subscription_id = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(userId).run();

    return {
      success: true,
      message: 'モックモード: サブスクリプションを即時キャンセルしました',
      plan: 'free',
    };
  }

  // ユーザーのサブスクリプションIDを取得
  const user = await env.DB.prepare(
    'SELECT stripe_subscription_id FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    throw new Error(`ユーザーが見つかりません: ${userId}`);
  }

  if (!user.stripe_subscription_id) {
    throw new Error('アクティブなサブスクリプションがありません');
  }

  // 期間終了時にキャンセル（即時ではなく期間満了まで利用可能）
  const subscription = await stripeRequest(
    `/subscriptions/${user.stripe_subscription_id}`,
    'POST',
    { cancel_at_period_end: 'true' },
    env
  );

  return {
    success: true,
    message: '現在の請求期間終了時にキャンセルされます',
    cancel_at: new Date(subscription.current_period_end * 1000).toISOString(),
    plan: subscription.items?.data?.[0]?.price?.id
      ? resolvePlanFromPriceId(subscription.items.data[0].price.id, env)
      : 'unknown',
  };
}
