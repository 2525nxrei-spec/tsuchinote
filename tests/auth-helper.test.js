/**
 * functions/lib/auth-helper.js のテスト
 * requireAuth — JWT認証チェック
 */

import { describe, it, expect } from 'vitest';
import { requireAuth } from '../functions/lib/auth-helper.js';
import { createJwt } from '../functions/lib/utils.js';

const JWT_SECRET = 'test-secret-key-for-auth-helper';

function makeRequest(authHeader) {
  return new Request('https://tsuchinote.com/api/test', {
    headers: authHeader ? { 'Authorization': authHeader } : {},
  });
}

describe('requireAuth', () => {
  it('Authorizationヘッダーなしでエラーを返す', async () => {
    const req = makeRequest(null);
    const result = await requireAuth(req, { JWT_SECRET });
    expect(result.error).toBeTruthy();
    const body = await result.error.json();
    expect(body.ok).toBe(false);
    expect(result.error.status).toBe(401);
  });

  it('Bearer接頭辞なしでエラーを返す', async () => {
    const req = makeRequest('Token abc123');
    const result = await requireAuth(req, { JWT_SECRET });
    expect(result.error).toBeTruthy();
  });

  it('JWT_SECRET未設定でサーバーエラーを返す', async () => {
    const req = makeRequest('Bearer sometoken');
    const result = await requireAuth(req, {});
    expect(result.error).toBeTruthy();
    expect(result.error.status).toBe(500);
  });

  it('無効なトークンでエラーを返す', async () => {
    const req = makeRequest('Bearer invalid.token.here');
    const result = await requireAuth(req, { JWT_SECRET });
    expect(result.error).toBeTruthy();
    expect(result.error.status).toBe(401);
  });

  it('有効なトークンでuserId/userPlanを返す', async () => {
    const token = await createJwt(
      { sub: 'USER001', plan: 'pro', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const req = makeRequest(`Bearer ${token}`);
    const result = await requireAuth(req, { JWT_SECRET });

    expect(result.error).toBeUndefined();
    expect(result.userId).toBe('USER001');
    expect(result.userPlan).toBe('pro');
  });

  it('planが未設定のトークンはfreeとして扱う', async () => {
    const token = await createJwt(
      { sub: 'USER002', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const req = makeRequest(`Bearer ${token}`);
    const result = await requireAuth(req, { JWT_SECRET });

    expect(result.userPlan).toBe('free');
  });
});
