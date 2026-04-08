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

/** パスワード強度チェック表示を更新する共通関数 */
function updatePasswordStrength(password, el) {
  if (!el) return;
  if (password.length === 0) {
    el.textContent = '';
    el.style.color = '';
  } else if (password.length < 8) {
    el.textContent = 'あと' + (8 - password.length) + '文字必要です';
    el.style.color = '#dc2626';
  } else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    el.textContent = '英字と数字の両方を含めてください';
    el.style.color = '#d97706';
  } else {
    el.textContent = 'OK';
    el.style.color = '#16a34a';
  }
}

var TsuchiAPI = (function() {
  'use strict';

  // APIベースURL
  var BASE_URL = '/api';

  // --- 内部ヘルパー ---

  /** HTTPステータスに応じた親切なエラーメッセージ */
  function friendlyError(status) {
    switch (status) {
      case 400: return '入力内容に誤りがあります。内容を確認してもう一度お試しください。';
      case 401: return 'ログインが必要です。再度ログインしてください。';
      case 403: return 'この操作を行う権限がありません。プランの確認をお願いします。';
      case 404: return 'お探しのデータが見つかりませんでした。ページを再読み込みしてお試しください。';
      case 409: return 'データが競合しています。ページを再読み込みしてお試しください。';
      case 422: return '入力内容を確認してください。必須項目が未入力の可能性があります。';
      case 429: return 'リクエストが多すぎます。しばらく待ってからお試しください。';
      case 500: return 'サーバーで問題が発生しました。しばらくしてからもう一度お試しください。';
      case 502: return 'サーバーが一時的に利用できません。しばらくしてからお試しください。';
      case 503: return 'サービスがメンテナンス中です。しばらくお待ちください。';
      default:  return '予期しないエラーが発生しました。ページを再読み込みしてお試しください。';
    }
  }

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
            // ログイン/登録APIへのリクエストの場合はログアウト処理しない（認証エラーをそのまま返す）
            if (path !== '/auth/login' && path !== '/auth/register') {
              if (typeof App !== 'undefined' && App.logout) {
                App.logout('セッションが切れました。再度ログインしてください。');
              } else {
                localStorage.removeItem('tsuchi_token');
                localStorage.removeItem('tsuchi_user');
                window.location.hash = '#/';
              }
            }
            return Promise.reject({ ok: false, error: data.error || 'セッションが切れました。再度ログインしてください。', status: 401 });
          }
          if (!res.ok || data.ok === false) {
            // ステータスに応じた親切なエラーメッセージ
            var userMsg = data.error || friendlyError(res.status);
            return Promise.reject({ ok: false, error: userMsg, status: res.status });
          }
          return data;
        }).catch(function(parseErr) {
          // JSONパース失敗（HTML返却等）
          if (parseErr && parseErr.ok === false) throw parseErr;
          return Promise.reject({ ok: false, error: friendlyError(res.status), status: res.status });
        });
      })
      .catch(function(err) {
        if (err && err.ok === false) throw err;
        // ネットワーク・タイムアウト等
        if (!navigator.onLine) {
          throw { ok: false, error: 'インターネット接続がありません。Wi-Fiやモバイルデータを確認してください。' };
        }
        throw { ok: false, error: '通信エラーが発生しました。電波状況を確認して、もう一度お試しください。' };
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
    },
    /** パスワード変更 */
    changePassword: function(currentPassword, newPassword) {
      return request('PUT', '/auth/password', { current_password: currentPassword, new_password: newPassword });
    },
    /** アカウント削除 */
    deleteAccount: function(password) {
      return request('DELETE', '/auth/account', { password: password });
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
