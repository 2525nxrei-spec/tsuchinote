/**
 * functions/api/auth/ のAPIエンドポイントテスト
 * ログイン、登録、プロフィール、パスワード変更、アカウント削除
 */

import { describe, it, expect } from 'vitest';
import { onRequestPost as loginHandler } from '../functions/api/auth/login.js';
import { onRequestPost as registerHandler } from '../functions/api/auth/register.js';
import { onRequestGet as profileGetHandler, onRequestPut as profilePutHandler } from '../functions/api/auth/profile.js';
import { onRequestPut as passwordHandler } from '../functions/api/auth/password.js';
import { onRequestDelete as accountDeleteHandler } from '../functions/api/auth/account.js';
import { createMockEnv, parseResponse } from './helpers/mock-env.js';
import { hashPassword, createJwt } from '../functions/lib/utils.js';

// --- ログイン ---
describe('POST /api/auth/login', () => {
  it('email/passwordが空の場合400', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await loginHandler({ request, env });
    expect(res.status).toBe(400);
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
  });

  it('ユーザーが存在しない場合401', async () => {
    const env = createMockEnv({
      first: () => null, // ユーザー未発見
    });
    const request = new Request('https://tsuchinote.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@test.com', password: 'pass1234' }),
    });
    const res = await loginHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('正しい認証情報でトークンを返す', async () => {
    const salt = 'testsalt123';
    const hash = await hashPassword('correct123', salt);

    const env = createMockEnv({
      first: () => ({
        id: 'USER001',
        email: 'user@test.com',
        password_hash: hash,
        salt,
        name: 'テストユーザー',
        plan: 'free',
      }),
    });

    const request = new Request('https://tsuchinote.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@test.com', password: 'correct123' }),
    });
    const res = await loginHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.ok).toBe(true);
    expect(body.data.token).toBeTruthy();
    expect(body.data.user.id).toBe('USER001');
  });

  it('不正なJSONボディで400', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await loginHandler({ request, env });
    expect(res.status).toBe(400);
  });
});

// --- 登録 ---
describe('POST /api/auth/register', () => {
  it('必須フィールドが不足で400', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com' }),
    });
    const res = await registerHandler({ request, env });
    expect(res.status).toBe(400);
  });

  it('不正なメールアドレスで400', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalidemail', password: 'pass1234', name: 'Test' }),
    });
    const res = await registerHandler({ request, env });
    expect(res.status).toBe(400);
  });

  it('パスワードが短すぎる場合400', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', password: 'short', name: 'Test' }),
    });
    const res = await registerHandler({ request, env });
    expect(res.status).toBe(400);
  });

  it('既存ユーザーで409', async () => {
    const env = createMockEnv({
      first: (sql) => {
        if (sql.includes('SELECT id FROM users')) return { id: 'EXISTING' };
        return null;
      },
    });
    const request = new Request('https://tsuchinote.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'exists@test.com', password: 'password123', name: 'Test' }),
    });
    const res = await registerHandler({ request, env });
    expect(res.status).toBe(409);
  });

  it('正常登録で201+トークン', async () => {
    const env = createMockEnv({
      first: () => null, // 重複なし
    });
    const request = new Request('https://tsuchinote.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@test.com', password: 'newpass123', name: '新規ユーザー' }),
    });
    const res = await registerHandler({ request, env });
    expect(res.status).toBe(201);
    const body = await parseResponse(res);
    expect(body.ok).toBe(true);
    expect(body.data.token).toBeTruthy();
    expect(body.data.user.email).toBe('new@test.com');
  });
});

// --- プロフィール ---
describe('GET /api/auth/profile', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/auth/profile');
    const res = await profileGetHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('認証済みでプロフィールを返す', async () => {
    const token = await createJwt(
      { sub: 'USER001', plan: 'free', exp: Math.floor(Date.now() / 1000) + 3600 },
      'test-secret-key-for-vitest-12345'
    );
    const env = createMockEnv({
      first: () => ({
        id: 'USER001',
        email: 'user@test.com',
        name: 'テスト',
        plan: 'free',
        stripe_customer_id: null,
        created_at: '2025-01-01T00:00:00Z',
      }),
    });
    const request = new Request('https://tsuchinote.com/api/auth/profile', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await profileGetHandler({ request, env });
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.name).toBe('テスト');
    expect(body.data.hasStripe).toBe(false);
  });
});

// --- パスワード変更 ---
describe('PUT /api/auth/password', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: 'old', new_password: 'new12345abc' }),
    });
    const res = await passwordHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('新しいパスワードが短すぎで400', async () => {
    const token = await createJwt(
      { sub: 'USER001', exp: Math.floor(Date.now() / 1000) + 3600 },
      'test-secret-key-for-vitest-12345'
    );
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/auth/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ current_password: 'old12345', new_password: 'short' }),
    });
    const res = await passwordHandler({ request, env });
    expect(res.status).toBe(400);
  });
});

// --- アカウント削除 ---
describe('DELETE /api/auth/account', () => {
  it('認証なしで401', async () => {
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/auth/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test' }),
    });
    const res = await accountDeleteHandler({ request, env });
    expect(res.status).toBe(401);
  });

  it('パスワード未入力で400', async () => {
    const token = await createJwt(
      { sub: 'USER001', exp: Math.floor(Date.now() / 1000) + 3600 },
      'test-secret-key-for-vitest-12345'
    );
    const env = createMockEnv();
    const request = new Request('https://tsuchinote.com/api/auth/account', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const res = await accountDeleteHandler({ request, env });
    expect(res.status).toBe(400);
  });
});
