/**
 * テスト用モック環境（D1, R2, 環境変数）
 * 全テストで共通利用するモックオブジェクト
 */

/**
 * D1 モック — prepare().bind().first()/all()/run() をシミュレート
 * テストごとにレスポンスをカスタマイズ可能
 */
export function createMockDB(overrides = {}) {
  const defaultResult = { results: [], success: true };

  return {
    _lastSQL: null,
    _lastBinds: [],
    _batchCalls: [],

    prepare(sql) {
      this._lastSQL = sql;
      const self = this;
      return {
        bind(...args) {
          self._lastBinds = args;
          return {
            async first() {
              if (overrides.first) return overrides.first(sql, args);
              return null;
            },
            async all() {
              if (overrides.all) return overrides.all(sql, args);
              return { ...defaultResult };
            },
            async run() {
              if (overrides.run) return overrides.run(sql, args);
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
        // bind無しで直接呼べるケース
        async first() {
          if (overrides.first) return overrides.first(sql, []);
          return null;
        },
        async all() {
          if (overrides.all) return overrides.all(sql, []);
          return { ...defaultResult };
        },
        async run() {
          if (overrides.run) return overrides.run(sql, []);
          return { success: true, meta: { changes: 1 } };
        },
      };
    },

    async batch(stmts) {
      this._batchCalls.push(stmts);
      return stmts.map(() => ({ success: true }));
    },
  };
}

/**
 * テスト用の基本環境変数
 */
export function createMockEnv(dbOverrides = {}) {
  return {
    DB: createMockDB(dbOverrides),
    JWT_SECRET: 'test-secret-key-for-vitest-12345',
    OPENWEATHER_API_KEY: '', // モックモード
    GEMINI_API_KEY: '',       // モックモード
    STRIPE_SECRET_KEY: '',    // モックモード
    STRIPE_WEBHOOK_SECRET: 'whsec_test123',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
    STRIPE_PRICE_LIGHT: 'price_test_light',
    STRIPE_PRICE_PRO: 'price_test_pro',
    APP_URL: 'https://tsuchinote.com',
    STORAGE: {
      put: async () => ({}),
      get: async () => null,
      delete: async () => ({}),
    },
  };
}

/**
 * テスト用リクエスト生成ヘルパー
 */
export function createRequest(method, url, body = null, headers = {}) {
  const init = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body && method !== 'GET') {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

/**
 * 認証付きリクエスト生成（JWTトークン付き）
 */
export function createAuthRequest(method, url, token, body = null) {
  return createRequest(method, url, body, {
    'Authorization': `Bearer ${token}`,
  });
}

/**
 * レスポンスのJSONをパース
 */
export async function parseResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
