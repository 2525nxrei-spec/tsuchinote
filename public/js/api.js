// ============================================
// ツチノート — グローバルヘルパー + API通信レイヤー
// ============================================

/** XSS対策: HTMLの特殊文字をエスケープ */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

var TsuchiAPI = (function() {
  'use strict';

  // APIベースURL
  var BASE_URL = '/api';

  // --- 内部ヘルパー ---

  /** JWTトークンを取得 */
  function getToken() {
    return localStorage.getItem('tsuchi_token');
  }

  /** 認証ヘッダー付きfetchラッパー */
  function request(method, path, body) {
    // オフライン検出
    if (!navigator.onLine) {
      return Promise.reject({ ok: false, error: 'オフラインです。電波の届く場所で再度お試しください。' });
    }

    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    var opts = { method: method, headers: headers };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }

    return fetch(BASE_URL + path, opts)
      .then(function(res) {
        return res.json().then(function(data) {
          // 401 → トークン期限切れ、自動ログアウト
          if (res.status === 401) {
            localStorage.removeItem('tsuchi_token');
            localStorage.removeItem('tsuchi_user');
            window.location.hash = '#/login';
            return Promise.reject({ ok: false, error: 'セッションが切れました。再度ログインしてください。' });
          }
          if (!res.ok || data.ok === false) {
            return Promise.reject({ ok: false, error: data.error || 'エラーが発生しました。' });
          }
          return data;
        });
      })
      .catch(function(err) {
        if (err && err.ok === false) throw err;
        throw { ok: false, error: '通信エラーが発生しました。' };
      });
  }

  // --- 認証 API ---
  var auth = {
    /** 新規登録 */
    register: function(name, email, password) {
      return request('POST', '/auth/register', { name: name, email: email, password: password });
    },
    /** ログイン */
    login: function(email, password) {
      return request('POST', '/auth/login', { email: email, password: password });
    },
    /** プロフィール取得 */
    getProfile: function() {
      return request('GET', '/auth/profile');
    },
    /** プロフィール更新 */
    updateProfile: function(data) {
      return request('PUT', '/auth/profile', data);
    }
  };

  // --- 畑 API ---
  var farm = {
    /** 畑一覧取得 */
    list: function() {
      return request('GET', '/farms');
    },
    /** 畑作成 */
    create: function(data) {
      return request('POST', '/farms', data);
    },
    /** 畑更新 */
    update: function(id, data) {
      return request('PUT', '/farms/' + id, data);
    },
    /** 畑削除 */
    remove: function(id) {
      return request('DELETE', '/farms/' + id);
    }
  };

  // --- 作物 API ---
  var crop = {
    /** 作物一覧取得（畑ID指定） */
    list: function(farmId) {
      return request('GET', '/farms/' + farmId + '/crops');
    },
    /** 作物追加 */
    create: function(farmId, data) {
      return request('POST', '/farms/' + farmId + '/crops', data);
    },
    /** 作物更新 */
    update: function(farmId, cropId, data) {
      return request('PUT', '/farms/' + farmId + '/crops/' + cropId, data);
    },
    /** 作物削除 */
    remove: function(farmId, cropId) {
      return request('DELETE', '/farms/' + farmId + '/crops/' + cropId);
    },
    /** 品目マスタ取得 */
    getCropTypes: function() {
      return request('GET', '/crop-types');
    }
  };

  // --- 天気 API ---
  var weather = {
    /** 天気予報取得 */
    getForecast: function(farmId) {
      return request('GET', '/farms/' + farmId + '/weather');
    }
  };

  // --- 提案 API ---
  var suggestion = {
    /** 今日の提案取得 */
    getToday: function(farmId) {
      return request('GET', '/farms/' + farmId + '/suggestions/today');
    },
    /** 提案履歴取得 */
    getHistory: function(farmId) {
      return request('GET', '/farms/' + farmId + '/suggestions/history');
    }
  };

  // --- 作業記録 API ---
  var record = {
    /** 記録一覧取得 */
    list: function(farmId, params) {
      var query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request('GET', '/farms/' + farmId + '/records' + query);
    },
    /** 記録追加 */
    create: function(farmId, data) {
      return request('POST', '/farms/' + farmId + '/records', data);
    },
    /** 記録完了 */
    complete: function(farmId, recordId) {
      return request('PUT', '/farms/' + farmId + '/records/' + recordId + '/complete');
    },
    /** 記録削除 */
    remove: function(farmId, recordId) {
      return request('DELETE', '/farms/' + farmId + '/records/' + recordId);
    }
  };

  // --- サブスクリプション API ---
  var subscription = {
    /** プラン一覧取得 */
    getPlans: function() {
      return request('GET', '/subscription/plans');
    },
    /** チェックアウトセッション作成 */
    createCheckout: function(planId) {
      return request('POST', '/subscription/checkout', { plan_id: planId });
    },
    /** 現在のステータス取得 */
    getStatus: function() {
      return request('GET', '/subscription/status');
    },
    /** 解約 */
    cancel: function() {
      return request('POST', '/subscription/cancel');
    }
  };

  // パブリックAPI
  return {
    auth: auth,
    farm: farm,
    crop: crop,
    weather: weather,
    suggestion: suggestion,
    record: record,
    subscription: subscription
  };
})();
