// ============================================
// ツチノート — メインアプリ + SPAルーター
// hash-based ルーティング、認証管理、グローバル関数
// ============================================

var App = (function() {
  'use strict';

  // --- ルート定義 ---
  var routes = {
    '/':         { page: null,         nav: null,       auth: 'auto' },
    '/home':     { page: HomePage,     nav: 'home',     auth: true },
    '/farm':     { page: FarmPage,     nav: 'farm',     auth: true },
    '/record':   { page: RecordPage,   nav: 'record',   auth: true },
    '/settings': { page: SettingsPage, nav: 'settings', auth: true },
    '/camera':   { page: CameraPage,   nav: null,       auth: true },
    '/login':    { page: LoginPage,    nav: null,       auth: false },
    '/register': { page: LoginPage,    nav: null,       auth: false }
  };

  var currentRoute = null;

  // --- 認証チェック ---

  /** ログイン済みかどうか */
  function isAuthenticated() {
    return !!localStorage.getItem('tsuchi_token');
  }

  // --- ルーター ---

  /** 現在のハッシュからパスを取得 */
  function getPath() {
    var hash = window.location.hash || '#/';
    return hash.replace('#', '') || '/';
  }

  /** ルーティング実行 */
  function navigate() {
    var path = getPath();
    var route = routes[path];

    // 不明なパスはトップにリダイレクト
    if (!route) {
      window.location.hash = '#/';
      return;
    }

    // '/' はログイン状態で振り分け
    if (route.auth === 'auto') {
      if (isAuthenticated()) {
        window.location.hash = '#/home';
      } else {
        // 未ログイン → LP表示
        route = { page: LandingPage, nav: null, auth: false };
      }
      // ログイン済みリダイレクトの場合はここで終了
      if (isAuthenticated()) return;
    }

    // 認証が必要なページで未ログインならLPへ
    if (route.auth === true && !isAuthenticated()) {
      window.location.hash = '#/';
      return;
    }

    // ログイン済みでログインページにアクセスしたらホームへ
    if (route.auth === false && isAuthenticated() && path !== '/') {
      window.location.hash = '#/home';
      return;
    }

    currentRoute = route;

    // ナビゲーションバーの表示制御
    var nav = document.getElementById('bottom-nav');
    if (route.nav) {
      nav.style.display = '';
      // アクティブタブ更新
      var items = nav.querySelectorAll('.nav-item');
      items.forEach(function(item) {
        item.classList.toggle('active', item.dataset.page === route.nav);
      });
    } else {
      nav.style.display = 'none';
    }

    // ページ描画
    renderCurrentPage();

    // ページ固有の初期化
    if (route.page.init) {
      route.page.init();
    }
  }

  /** 現在のページを再描画（データ更新後の再レンダリング用） */
  function renderCurrentPage() {
    if (!currentRoute) return;
    var app = document.getElementById('app');
    app.innerHTML = currentRoute.page.render();
    // イベントバインド
    if (currentRoute.page.bind) {
      currentRoute.page.bind();
    }
  }

  // --- トースト通知 ---

  /**
   * トースト通知を表示
   * @param {string} message - メッセージ
   * @param {string} type - 'success' | 'error' | 'warning'（デフォルト: success）
   */
  function toast(message, type) {
    var container = document.getElementById('toast-container');
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast-error' : type === 'warning' ? ' toast-warning' : '');
    el.textContent = message;
    container.appendChild(el);

    // 3秒後に自動で消える
    setTimeout(function() {
      el.classList.add('toast-out');
      setTimeout(function() {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, 3000);
  }

  // --- PWAインストールプロンプト ---

  var deferredPrompt = null;

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      deferredPrompt = e;
    });
  }

  /** インストールを促す（設定画面等から呼び出し） */
  function promptInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function() {
      deferredPrompt = null;
    });
  }

  // --- Service Worker 登録 ---

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(function(reg) {
          // 更新があればユーザーに通知
          reg.addEventListener('updatefound', function() {
            var newWorker = reg.installing;
            newWorker.addEventListener('statechange', function() {
              if (newWorker.state === 'activated') {
                toast('アプリが更新されました。再読み込みしてください。');
              }
            });
          });
        })
        .catch(function() {
          // Service Worker 登録失敗（開発環境等）
        });
    }
  }

  // --- 初期化 ---

  function init() {
    // Service Worker登録
    registerServiceWorker();

    // PWAインストールプロンプト
    setupInstallPrompt();

    // オフライン検知
    setupOfflineDetection();

    // Escでモーダルを閉じる
    setupEscCloseModal();

    // ルーティング開始
    window.addEventListener('hashchange', navigate);
    // タブが再度表示されたとき（別タブでログアウトした場合等）に認証状態を再チェック
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        navigate();
      }
    });
    navigate();

    // ローディング非表示
    var loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('hidden');
      setTimeout(function() { loading.style.display = 'none'; }, 300);
    }

    // ウェルカムメッセージ（新規登録直後に1回だけ表示）
    if (localStorage.getItem('tsuchi_welcome') === '1') {
      localStorage.removeItem('tsuchi_welcome');
      setTimeout(function() {
        toast('ようこそツチノートへ！\n畑を登録して、家庭菜園を始めましょう。');
      }, 500);
    }

    // セッションタイムアウト（24時間操作なしでログアウト）
    var SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
    function resetSessionTimer() {
      localStorage.setItem('tsuchi_last_activity', Date.now().toString());
    }
    function checkSessionTimeout() {
      var lastActivity = parseInt(localStorage.getItem('tsuchi_last_activity') || '0', 10);
      if (lastActivity && Date.now() - lastActivity > SESSION_TIMEOUT && localStorage.getItem('tsuchi_token')) {
        logout('長時間操作がなかったため、セキュリティのためログアウトしました。');
      }
    }
    checkSessionTimeout();
    resetSessionTimer();
    ['click', 'keydown', 'scroll', 'touchstart'].forEach(function(evt) {
      document.addEventListener(evt, resetSessionTimer, { passive: true });
    });
  }

  // --- オフライン検知 → 通知バー表示 ---

  function setupOfflineDetection() {
    function showOfflineBar() {
      if (document.getElementById('offline-bar')) return;
      var bar = document.createElement('div');
      bar.id = 'offline-bar';
      bar.setAttribute('role', 'alert');
      bar.setAttribute('aria-live', 'assertive');
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#ef4444;color:#fff;text-align:center;padding:10px 16px;font-size:0.88rem;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
      bar.textContent = 'インターネットに接続されていません。一部の機能が利用できない場合があります。';
      document.body.prepend(bar);
    }
    function hideOfflineBar() {
      var bar = document.getElementById('offline-bar');
      if (bar) bar.remove();
    }
    window.addEventListener('offline', showOfflineBar);
    window.addEventListener('online', function() {
      hideOfflineBar();
      toast('インターネットに再接続しました。');
    });
    if (!navigator.onLine) showOfflineBar();
  }

  // --- モーダルをEscキーで閉じる ---

  function setupEscCloseModal() {
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var overlay = document.querySelector('.modal-overlay');
        if (overlay) overlay.remove();
      }
    });
  }

  // DOM読み込み完了後に初期化
  document.addEventListener('DOMContentLoaded', init);

  // --- ボタンローディング状態管理 ---

  /**
   * ボタンをローディング状態にする
   * @param {HTMLElement} btn - 対象ボタン
   * @param {string} loadingText - ローディング中テキスト（省略時: 処理中...）
   * @returns {function} 元に戻す関数
   */
  function btnLoading(btn, loadingText) {
    if (!btn) return function() {};
    var originalText = btn.textContent;
    var originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="btn-text">' + originalHtml + '</span>';
    if (loadingText) {
      btn.setAttribute('aria-label', loadingText);
    }
    return function(success) {
      btn.classList.remove('btn-loading');
      btn.removeAttribute('aria-busy');
      btn.removeAttribute('aria-label');
      if (success) {
        btn.classList.add('btn-success');
        setTimeout(function() {
          btn.classList.remove('btn-success');
          btn.innerHTML = originalHtml;
          btn.disabled = false;
        }, 1200);
      } else {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
    };
  }

  /**
   * フォームの二重送信を防止する
   * @param {HTMLFormElement} form - 対象フォーム
   * @param {function} handler - 送信ハンドラ(e)
   */
  function guardSubmit(form, handler) {
    if (!form) return;
    var submitting = false;
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      if (submitting) return;
      submitting = true;
      var btn = form.querySelector('button[type="submit"]');
      var restore = btnLoading(btn);
      // handlerはPromiseを返すことを期待
      var result;
      try {
        result = handler(e);
      } catch(err) {
        submitting = false;
        restore(false);
        return;
      }
      if (result && typeof result.then === 'function') {
        result
          .then(function() { restore(true); })
          .catch(function() { restore(false); })
          .finally(function() { submitting = false; });
      } else {
        submitting = false;
        restore(false);
      }
    });
  }

  // --- ログアウト共通処理 ---

  /**
   * ログアウト処理（全localStorage項目をクリアし、LPにリダイレクト）
   * @param {string} [message] - トースト通知メッセージ（省略時: デフォルトメッセージ）
   */
  function logout(message) {
    localStorage.removeItem('tsuchi_token');
    localStorage.removeItem('tsuchi_user');
    localStorage.removeItem('tsuchi_last_activity');
    localStorage.removeItem('tsuchi_notifications');
    localStorage.removeItem('tsuchi_welcome');
    toast(message || 'ログアウトしました');
    // DOMをクリア（ログアウト後に認証済みページのコンテンツが残らないようにする）
    var app = document.getElementById('app');
    if (app) app.innerHTML = '';
    // ハッシュがすでに#/の場合はhashchangeが発火しないので直接navigate()
    if (window.location.hash === '#/' || window.location.hash === '') {
      navigate();
    } else {
      window.location.hash = '#/';
      // hashchangeリスナーがnavigate()を呼ぶ
    }
  }

  // パブリックAPI
  return {
    toast: toast,
    renderCurrentPage: renderCurrentPage,
    promptInstall: promptInstall,
    isAuthenticated: isAuthenticated,
    btnLoading: btnLoading,
    guardSubmit: guardSubmit,
    logout: logout
  };
})();
