/**
 * ツチノート — 認証ヘルパー
 * JWTからユーザー情報を取得する共通処理
 */

import { verifyJwt, errorResponse } from './utils.js';

/**
 * Authorizationヘッダーからユーザー情報を取得
 * @param {Request} request
 * @param {object} env
 * @returns {{ userId: string, userPlan: string } | Response} 認証情報またはエラーレスポンス
 */
export async function requireAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: errorResponse('認証が必要です', 401) };
  }
  const token = authHeader.slice(7);
  const payload = await verifyJwt(token, env.JWT_SECRET || 'tsuchi-note-dev-secret');
  if (!payload) {
    return { error: errorResponse('トークンが無効です', 401) };
  }
  return {
    userId: payload.sub,
    userPlan: payload.plan || 'free',
  };
}
