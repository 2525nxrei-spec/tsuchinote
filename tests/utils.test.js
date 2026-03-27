/**
 * functions/lib/utils.js のテスト
 * ULID生成、パスワードハッシュ、JWT、レスポンスヘルパー
 */

import { describe, it, expect } from 'vitest';
import {
  generateUlid,
  hashPassword,
  verifyPassword,
  createJwt,
  verifyJwt,
  jsonResponse,
  errorResponse,
} from '../functions/lib/utils.js';

describe('generateUlid', () => {
  it('20文字の文字列を返す（タイムスタンプ10文字+ランダム10文字）', () => {
    const id = generateUlid();
    expect(id).toHaveLength(20);
  });

  it('有効な文字のみで構成される', () => {
    const id = generateUlid();
    // ULIDのCrockford Base32文字セット
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it('連続生成で一意', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateUlid());
    }
    expect(ids.size).toBe(100);
  });
});

describe('hashPassword / verifyPassword', () => {
  it('パスワードをハッシュして検証できる', async () => {
    const password = 'testPassword123';
    const salt = 'randomSalt123';
    const hash = await hashPassword(password, salt);

    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
    // 256ビット = 64文字hex
    expect(hash).toHaveLength(64);

    // 正しいパスワードで検証成功
    const valid = await verifyPassword(password, hash, salt);
    expect(valid).toBe(true);
  });

  it('間違ったパスワードで検証失敗', async () => {
    const salt = 'randomSalt123';
    const hash = await hashPassword('correct', salt);
    const valid = await verifyPassword('wrong', hash, salt);
    expect(valid).toBe(false);
  });

  it('間違ったソルトで検証失敗', async () => {
    const hash = await hashPassword('password', 'salt1');
    const valid = await verifyPassword('password', hash, 'salt2');
    expect(valid).toBe(false);
  });
});

describe('createJwt / verifyJwt', () => {
  const secret = 'test-secret-key-12345';

  it('JWTを生成して検証できる', async () => {
    const payload = { sub: 'user123', email: 'test@example.com', plan: 'free' };
    const token = await createJwt(payload, secret);

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const decoded = await verifyJwt(token, secret);
    expect(decoded).toBeTruthy();
    expect(decoded.sub).toBe('user123');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.plan).toBe('free');
  });

  it('間違ったシークレットで検証失敗', async () => {
    const payload = { sub: 'user123' };
    const token = await createJwt(payload, secret);
    const decoded = await verifyJwt(token, 'wrong-secret');
    expect(decoded).toBeNull();
  });

  it('期限切れトークンはnullを返す', async () => {
    const payload = { sub: 'user123', exp: Math.floor(Date.now() / 1000) - 3600 };
    const token = await createJwt(payload, secret);
    const decoded = await verifyJwt(token, secret);
    expect(decoded).toBeNull();
  });

  it('不正なトークン文字列はnullを返す', async () => {
    expect(await verifyJwt('invalid', secret)).toBeNull();
    expect(await verifyJwt('a.b', secret)).toBeNull();
    expect(await verifyJwt('', secret)).toBeNull();
  });
});

describe('jsonResponse', () => {
  it('ステータス200でJSON形式のレスポンスを返す', async () => {
    const res = jsonResponse({ message: 'test' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.message).toBe('test');
  });

  it('カスタムステータスコードを指定できる', async () => {
    const res = jsonResponse({ id: '123' }, 201);
    expect(res.status).toBe(201);
  });
});

describe('errorResponse', () => {
  it('エラーメッセージとステータスコードを返す', async () => {
    const res = errorResponse('エラーです', 400);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('エラーです');
  });

  it('デフォルトステータスは400', async () => {
    const res = errorResponse('テスト');
    expect(res.status).toBe(400);
  });
});
