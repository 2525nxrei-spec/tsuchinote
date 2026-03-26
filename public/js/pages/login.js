// ============================================
// ツチノート — ログイン・登録画面
// ============================================

var LoginPage = (function() {
  'use strict';

  /** ログイン/登録画面のHTMLを生成 */
  function render() {
    return '' +
      '<div class="login-page">' +
        '<div class="login-logo" style="font-size:1.5rem;font-weight:800;color:#1b4332;">ツチノート</div>' +
        '<h1 class="login-title">ツチノート</h1>' +
        '<p class="login-subtitle">毎朝届く、畑の天気予報</p>' +
        '<div class="login-card">' +
          '<div class="login-tabs">' +
            '<button class="login-tab active" data-tab="login">ログイン</button>' +
            '<button class="login-tab" data-tab="register">新規登録</button>' +
          '</div>' +
          '<!-- ログインフォーム -->' +
          '<form id="login-form">' +
            '<div class="form-group">' +
              '<label class="form-label" for="login-email">メールアドレス</label>' +
              '<input class="form-input" type="email" id="login-email" placeholder="example@mail.com" required autocomplete="email">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="login-password">パスワード</label>' +
              '<input class="form-input" type="password" id="login-password" placeholder="パスワードを入力" required autocomplete="current-password" minlength="6">' +
            '</div>' +
            '<button type="submit" class="btn btn-primary btn-block">ログイン</button>' +
          '</form>' +
          '<button id="test-login-btn" style="margin-top:16px;width:100%;padding:14px;border:none;border-radius:8px;background:#ef4444;color:#fff;font-size:1rem;font-weight:700;cursor:pointer;">テストログイン（開発用）</button>' +
          '<!-- 登録フォーム（初期非表示） -->' +
          '<form id="register-form" style="display:none;">' +
            '<div class="form-group">' +
              '<label class="form-label" for="reg-name">お名前</label>' +
              '<input class="form-input" type="text" id="reg-name" placeholder="田中 太郎" required autocomplete="name">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="reg-email">メールアドレス</label>' +
              '<input class="form-input" type="email" id="reg-email" placeholder="example@mail.com" required autocomplete="email">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="reg-password">パスワード（6文字以上）</label>' +
              '<input class="form-input" type="password" id="reg-password" placeholder="パスワードを入力" required autocomplete="new-password" minlength="6">' +
            '</div>' +
            '<button type="submit" class="btn btn-primary btn-block">アカウント作成</button>' +
          '</form>' +
        '</div>' +
      '</div>';
  }

  /** イベントをバインド */
  function bind() {
    var tabs = document.querySelectorAll('.login-tab');
    var loginForm = document.getElementById('login-form');
    var registerForm = document.getElementById('register-form');

    // タブ切り替え
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        if (tab.dataset.tab === 'login') {
          loginForm.style.display = '';
          registerForm.style.display = 'none';
        } else {
          loginForm.style.display = 'none';
          registerForm.style.display = '';
        }
      });
    });

    // ログイン送信
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var email = document.getElementById('login-email').value.trim();
      var password = document.getElementById('login-password').value;

      if (!email || !password) {
        App.toast('入力内容を確認してください。', 'error');
        return;
      }

      var btn = loginForm.querySelector('button[type="submit"]');
      btn.textContent = 'ログイン中...';
      btn.disabled = true;

      TsuchiAPI.auth.login(email, password)
        .then(function(res) {
          localStorage.setItem('tsuchi_token', res.data.token);
          localStorage.setItem('tsuchi_user', JSON.stringify(res.data.user));
          App.toast('ログインしました！');
          window.location.hash = '#/home';
        })
        .catch(function(err) {
          App.toast(err.error || 'ログインに失敗しました。', 'error');
        })
        .finally(function() {
          btn.textContent = 'ログイン';
          btn.disabled = false;
        });
    });

    // テストログイン（開発用 — 本番前に削除）
    var testBtn = document.getElementById('test-login-btn');
    if (testBtn) {
      testBtn.addEventListener('click', function() {
        localStorage.setItem('tsuchi_token', 'test-token-dev');
        localStorage.setItem('tsuchi_user', JSON.stringify({ name: 'テストユーザー', email: 'test@example.com', plan: 'pro' }));
        App.toast('テストログインしました');
        window.location.hash = '#/home';
      });
    }

    // 登録送信
    registerForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var name = document.getElementById('reg-name').value.trim();
      var email = document.getElementById('reg-email').value.trim();
      var password = document.getElementById('reg-password').value;

      if (!name || !email || !password) {
        App.toast('すべての項目を入力してください。', 'error');
        return;
      }
      if (password.length < 6) {
        App.toast('パスワードは6文字以上で入力してください。', 'error');
        return;
      }

      var btn = registerForm.querySelector('button[type="submit"]');
      btn.textContent = '登録中...';
      btn.disabled = true;

      TsuchiAPI.auth.register(name, email, password)
        .then(function(res) {
          localStorage.setItem('tsuchi_token', res.data.token);
          localStorage.setItem('tsuchi_user', JSON.stringify(res.data.user));
          App.toast('アカウントを作成しました！');
          window.location.hash = '#/home';
        })
        .catch(function(err) {
          App.toast(err.error || '登録に失敗しました。', 'error');
        })
        .finally(function() {
          btn.textContent = 'アカウント作成';
          btn.disabled = false;
        });
    });
  }

  return {
    render: render,
    bind: bind
  };
})();
