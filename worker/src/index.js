/**
 * ツチノート API — メインルーター
 * Cloudflare Workers エントリーポイント
 */

import { handleRegister, handleLogin, handleGetProfile, handleUpdateProfile } from './auth.js';
import { handleFarms } from './farm.js';
import { handleCrops, handleCropTypes } from './crop.js';
import { handleWeather } from './weather.js';
import { handleSuggestions, handleSuggestionHistory } from './suggest.js';
import { handleRecords } from './record.js';
import { createCheckout, handleWebhook, getStatus, cancelSubscription } from './stripe.js';

// ===== ユーティリティ =====

/** ULID生成（簡易実装 — crypto.getRandomValues使用） */
export function generateUlid() {
  const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const now = Date.now();
  let id = '';
  // タイムスタンプ部 (10文字)
  let t = now;
  for (let i = 9; i >= 0; i--) {
    id = ENCODING[t % 32] + id;
    t = Math.floor(t / 32);
  }
  // ランダム部 (16文字)
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    id += ENCODING[b % 32];
  }
  return id;
}

/** SHA-256 パスワードハッシュ */
export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(salt + password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** パスワード検証 */
export async function verifyPassword(password, hash, salt) {
  const computed = await hashPassword(password, salt);
  return computed === hash;
}

/** JWT生成 (HS256) */
export async function createJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = new TextEncoder();

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const body = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${body}.${sigB64}`;
}

/** JWT検証 */
export async function verifyJwt(token, secret) {
  try {
    const [headerB64, payloadB64, sigB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !sigB64) return null;

    const enc = new TextEncoder();
    const body = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);

    // Base64URL → Base64
    const sigStr = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = sigStr + '='.repeat((4 - sigStr.length % 4) % 4);
    const sigBytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));

    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(body));
    if (!valid) return null;

    const payloadStr = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const payloadPadded = payloadStr + '='.repeat((4 - payloadStr.length % 4) % 4);
    const payload = JSON.parse(atob(payloadPadded));

    // 有効期限チェック
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

/** 成功レスポンス */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** エラーレスポンス */
export function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** CORSヘッダー付与 */
function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// ===== メインハンドラー =====

export default {
  async fetch(request, env, ctx) {
    // OPTIONS プリフライト
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      let response;

      // --- 認証不要ルート ---
      if (path === '/api/auth/register' && request.method === 'POST') {
        response = await handleRegister(request, env);
        return withCors(response);
      }
      if (path === '/api/auth/login' && request.method === 'POST') {
        response = await handleLogin(request, env);
        return withCors(response);
      }
      // Stripeウェブフック（署名検証のため認証スキップ）
      if (path === '/api/stripe/webhook' && request.method === 'POST') {
        try {
          const result = await handleWebhook(request, env);
          return withCors(jsonResponse(result));
        } catch (err) {
          return withCors(errorResponse(err.message, 400));
        }
      }

      // --- 認証ミドルウェア ---
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return withCors(errorResponse('認証が必要です', 401));
      }
      const token = authHeader.slice(7);
      const payload = await verifyJwt(token, env.JWT_SECRET || 'tsuchi-note-dev-secret');
      if (!payload) {
        return withCors(errorResponse('トークンが無効です', 401));
      }
      const userId = payload.sub;
      const userPlan = payload.plan || 'free';

      // --- 認証済みルート ---

      // プロフィール取得
      if (path === '/api/auth/profile' && request.method === 'GET') {
        response = await handleGetProfile(userId, env);
      }
      // プロフィール更新
      else if (path === '/api/auth/profile' && request.method === 'PUT') {
        response = await handleUpdateProfile(request, userId, env);
      }
      // 作物タイプマスタ
      else if (path === '/api/crop-types' && request.method === 'GET') {
        response = await handleCropTypes(env);
      }
      // サブスクリプション — チェックアウト (POST /api/subscription/checkout)
      else if (path === '/api/subscription/checkout' && request.method === 'POST') {
        try {
          let body;
          try { body = await request.json(); } catch { return withCors(errorResponse('リクエストボディが不正です')); }
          const plan = body.plan_id || body.plan;
          const result = await createCheckout(userId, plan, env);
          response = jsonResponse(result);
        } catch (err) {
          response = errorResponse(err.message, 400);
        }
      }
      // サブスクリプション — ステータス (GET /api/subscription/status)
      else if (path === '/api/subscription/status' && request.method === 'GET') {
        try {
          const result = await getStatus(userId, env);
          response = jsonResponse(result);
        } catch (err) {
          response = errorResponse(err.message, 400);
        }
      }
      // サブスクリプション — 解約 (POST /api/subscription/cancel)
      else if (path === '/api/subscription/cancel' && request.method === 'POST') {
        try {
          const result = await cancelSubscription(userId, env);
          response = jsonResponse(result);
        } catch (err) {
          response = errorResponse(err.message, 400);
        }
      }
      // 畑配下のサブリソース（作物/天気/提案/記録）— /api/farms/:farmId/... の順序が重要
      // 天気 (GET /api/farms/:farmId/weather)
      else if (path.match(/^\/api\/farms\/[\w-]+\/weather$/) && request.method === 'GET') {
        const farmId = path.split('/')[3];
        response = await handleWeather(farmId, userId, env);
      }
      // AI提案 — 今日 (GET /api/farms/:farmId/suggestions/today)
      else if (path.match(/^\/api\/farms\/[\w-]+\/suggestions\/today$/) && request.method === 'GET') {
        const farmId = path.split('/')[3];
        response = await handleSuggestions(userId, farmId, env);
      }
      // AI提案 — 履歴 (GET /api/farms/:farmId/suggestions/history)
      else if (path.match(/^\/api\/farms\/[\w-]+\/suggestions\/history$/) && request.method === 'GET') {
        const farmId = path.split('/')[3];
        response = await handleSuggestionHistory(userId, farmId, env);
      }
      // 作物 CRUD (/api/farms/:farmId/crops, /api/farms/:farmId/crops/:cropId)
      else if (path.match(/^\/api\/farms\/[\w-]+\/crops(\/[\w-]+)?$/)) {
        response = await handleCrops(request, env, userId, userPlan, path);
      }
      // 記録 完了トグル (PUT /api/farms/:farmId/records/:recordId/complete)
      else if (path.match(/^\/api\/farms\/[\w-]+\/records\/[\w-]+\/complete$/) && request.method === 'PUT') {
        response = await handleRecords(request, env, userId, path, url);
      }
      // 記録 CRUD (/api/farms/:farmId/records, /api/farms/:farmId/records/:recordId)
      else if (path.match(/^\/api\/farms\/[\w-]+\/records(\/[\w-]+)?$/)) {
        response = await handleRecords(request, env, userId, path, url);
      }
      // 畑 CRUD (/api/farms, /api/farms/:id)
      else if (path === '/api/farms' || path.match(/^\/api\/farms\/[\w-]+$/)) {
        response = await handleFarms(request, env, userId, userPlan, path);
      }
      // 404
      else {
        response = errorResponse('エンドポイントが見つかりません', 404);
      }

      return withCors(response);
    } catch (err) {
      console.error('Unhandled error:', err);
      return withCors(errorResponse('サーバー内部エラーが発生しました', 500));
    }
  },
};
