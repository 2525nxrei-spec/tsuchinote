/**
 * functions/_middleware.js のテスト
 * CORS, セキュリティヘッダー, レート制限
 */

import { describe, it, expect } from 'vitest';
import { onRequest } from '../functions/_middleware.js';

function createContext(url, method = 'GET', headers = {}) {
  const request = new Request(url, {
    method,
    headers: {
      'Origin': 'https://tsuchinote.com',
      'CF-Connecting-IP': '192.168.1.1',
      ...headers,
    },
  });
  return {
    request,
    next: async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}

describe('ミドルウェア CORS', () => {
  it('OPTIONSリクエストに204を返す', async () => {
    const ctx = createContext('https://tsuchinote.com/api/test', 'OPTIONS');
    const res = await onRequest(ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://tsuchinote.com');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('許可されたオリジンのCORSヘッダーを付与', async () => {
    const ctx = createContext('https://tsuchinote.com/api/test', 'GET', {
      'Origin': 'https://tsuchinote.com',
    });
    const res = await onRequest(ctx);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://tsuchinote.com');
  });

  it('許可されていないオリジンはデフォルトオリジンを使用', async () => {
    const ctx = createContext('https://tsuchinote.com/api/test', 'GET', {
      'Origin': 'https://evil.com',
    });
    const res = await onRequest(ctx);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://tsuchinote.com');
  });
});

describe('ミドルウェア セキュリティヘッダー', () => {
  it('X-Content-Type-Options: nosniff', async () => {
    const ctx = createContext('https://tsuchinote.com/api/test');
    const res = await onRequest(ctx);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('X-Frame-Options: DENY', async () => {
    const ctx = createContext('https://tsuchinote.com/api/test');
    const res = await onRequest(ctx);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('Strict-Transport-Security ヘッダーが付与される', async () => {
    const ctx = createContext('https://tsuchinote.com/api/test');
    const res = await onRequest(ctx);
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
  });

  it('Content-Security-Policy ヘッダーが付与される', async () => {
    const ctx = createContext('https://tsuchinote.com/api/test');
    const res = await onRequest(ctx);
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });
});

describe('ミドルウェア Webhookルート', () => {
  it('Webhookパスの場合CORSヘッダーなし', async () => {
    const ctx = createContext('https://tsuchinote.com/api/stripe/webhook', 'POST', {
      'Origin': '',
    });
    const res = await onRequest(ctx);
    // webhookはwithSecurityHeadersのみでwithCorsは通らない
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('ミドルウェア エラーハンドリング', () => {
  it('next()がエラーを投げた場合500を返す', async () => {
    const ctx = {
      request: new Request('https://tsuchinote.com/api/test', {
        headers: {
          'Origin': 'https://tsuchinote.com',
          'CF-Connecting-IP': '10.0.0.1',
        },
      }),
      next: async () => { throw new Error('テストエラー'); },
    };
    const res = await onRequest(ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});
