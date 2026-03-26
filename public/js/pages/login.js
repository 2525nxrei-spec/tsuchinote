// ============================================
// ツチノート — ログイン・登録画面
// ============================================

var LoginPage = (function() {
  'use strict';

  /** ログイン/登録画面のHTMLを生成 */
  function render() {
    return '' +
      '<div class="login-page">' +
        '<div class="login-logo" style="font-size:1.5rem;font-weight:800;color:#1b4332;" aria-hidden="true">ツチノート</div>' +
        '<h1 class="login-title">ツチノート</h1>' +
        '<p class="login-subtitle">毎朝届く、畑の天気予報</p>' +
        '<div class="login-card">' +
          '<div class="login-tabs" role="tablist" aria-label="ログイン・登録切替">' +
            '<button class="login-tab active" data-tab="login" role="tab" aria-selected="true" aria-controls="login-form">ログイン</button>' +
            '<button class="login-tab" data-tab="register" role="tab" aria-selected="false" aria-controls="register-form">新規登録</button>' +
          '</div>' +
          '<form id="login-form" role="tabpanel" aria-label="ログインフォーム">' +
            '<div class="form-group">' +
              '<label class="form-label" for="login-email">メールアドレス</label>' +
              '<input class="form-input" type="email" id="login-email" placeholder="example@mail.com" required autocomplete="email" aria-required="true">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="login-password">パスワード</label>' +
              '<input class="form-input" type="password" id="login-password" placeholder="パスワードを入力" required autocomplete="current-password" minlength="6" aria-required="true">' +
            '</div>' +
            '<button type="submit" class="btn btn-primary btn-block">ログイン</button>' +
            '<p style="text-align:center;margin-top:12px;font-size:0.8rem;color:#6b7280;">パスワードをお忘れの方は <a href="contact.html" style="color:#1b4332;text-decoration:underline;">こちら</a></p>' +
          '</form>' +
          '<form id="register-form" style="display:none;" role="tabpanel" aria-label="新規登録フォーム">' +
            '<div class="form-group">' +
              '<label class="form-label" for="reg-name">お名前</label>' +
              '<input class="form-input" type="text" id="reg-name" placeholder="田中 太郎" required autocomplete="name" aria-required="true">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="reg-email">メールアドレス</label>' +
              '<input class="form-input" type="email" id="reg-email" placeholder="example@mail.com" required autocomplete="email" aria-required="true">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="reg-password">パスワード（8文字以上・英数字混在）</label>' +
              '<input class="form-input" type="password" id="reg-password" placeholder="パスワードを入力" required autocomplete="new-password" minlength="8" aria-required="true">' +
              '<div style="font-size:0.75rem;color:#6b7280;margin-top:4px;" id="reg-pw-strength"></div>' +
            '</div>' +
            '<div class="form-group" style="margin-top:12px;">' +
              '<label style="display:flex;align-items:flex-start;gap:8px;font-size:0.82rem;cursor:pointer;">' +
                '<input type="checkbox" id="reg-terms" style="margin-top:3px;flex-shrink:0;" required>' +
                '<span><a href="terms.html" target="_blank" style="color:#1b4332;text-decoration:underline;">利用規約</a>と<a href="privacy.html" target="_blank" style="color:#1b4332;text-decoration:underline;">プライバシーポリシー</a>に同意する</span>' +
              '</label>' +
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

    // タブ切り替え（aria-selected 連動）
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        if (tab.dataset.tab === 'login') {
          loginForm.style.display = '';
          registerForm.style.display = 'none';
          loginForm.querySelector('input').focus();
        } else {
          loginForm.style.display = 'none';
          registerForm.style.display = '';
          registerForm.querySelector('input').focus();
        }
      });
    });

    // ログイン送信（二重送信防止 + ローディング + 成功アニメーション）
    App.guardSubmit(loginForm, function() {
      var email = document.getElementById('login-email').value.trim();
      var password = document.getElementById('login-password').value;

      // 空入力バリデーション
      if (!email) {
        App.toast('メールアドレスを入力してください。', 'error');
        document.getElementById('login-email').classList.add('form-error');
        document.getElementById('login-email').focus();
        return Promise.reject();
      }
      if (!password) {
        App.toast('パスワードを入力してください。', 'error');
        document.getElementById('login-password').classList.add('form-error');
        document.getElementById('login-password').focus();
        return Promise.reject();
      }

      return TsuchiAPI.auth.login(email, password)
        .then(function(res) {
          localStorage.setItem('tsuchi_token', res.data.token);
          localStorage.setItem('tsuchi_user', JSON.stringify(res.data.user));
          App.toast('ログインしました！');
          window.location.hash = '#/home';
        })
        .catch(function(err) {
          // 具体的なエラーメッセージ
          var msg = err.error || 'メールアドレスまたはパスワードが正しくありません。';
          App.toast(msg, 'error');
          throw err;
        });
    });

    // 登録送信（二重送信防止 + ローディング + 成功アニメーション）
    App.guardSubmit(registerForm, function() {
      var name = document.getElementById('reg-name').value.trim();
      var email = document.getElementById('reg-email').value.trim();
      var password = document.getElementById('reg-password').value;

      // 個別バリデーション
      if (!name) {
        App.toast('お名前を入力してください。', 'error');
        document.getElementById('reg-name').classList.add('form-error');
        document.getElementById('reg-name').focus();
        return Promise.reject();
      }
      if (!email) {
        App.toast('メールアドレスを入力してください。', 'error');
        document.getElementById('reg-email').classList.add('form-error');
        document.getElementById('reg-email').focus();
        return Promise.reject();
      }
      if (!password || password.length < 8) {
        App.toast('パスワードは8文字以上で入力してください。', 'error');
        document.getElementById('reg-password').classList.add('form-error');
        document.getElementById('reg-password').focus();
        return Promise.reject();
      }
      if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        App.toast('パスワードは英字と数字の両方を含めてください。', 'error');
        document.getElementById('reg-password').classList.add('form-error');
        document.getElementById('reg-password').focus();
        return Promise.reject();
      }
      var termsCheck = document.getElementById('reg-terms');
      if (termsCheck && !termsCheck.checked) {
        App.toast('利用規約への同意が必要です。', 'error');
        return Promise.reject();
      }

      return TsuchiAPI.auth.register(name, email, password)
        .then(function(res) {
          localStorage.setItem('tsuchi_token', res.data.token);
          localStorage.setItem('tsuchi_user', JSON.stringify(res.data.user));
          localStorage.setItem('tsuchi_welcome', '1');
          App.toast('アカウントを作成しました！');
          window.location.hash = '#/home';
        })
        .catch(function(err) {
          App.toast(err.error || '登録に失敗しました。入力内容を確認してください。', 'error');
          throw err;
        });
    });

    // 入力時にエラー表示をクリア
    var inputs = document.querySelectorAll('.form-input');
    inputs.forEach(function(input) {
      input.addEventListener('input', function() {
        this.classList.remove('form-error');
      });
    });

    // 登録パスワード強度チェック（リアルタイム）
    var regPwInput = document.getElementById('reg-password');
    if (regPwInput) {
      regPwInput.addEventListener('input', function() {
        var pw = this.value;
        var el = document.getElementById('reg-pw-strength');
        if (!el) return;
        if (pw.length === 0) {
          el.textContent = '';
        } else if (pw.length < 8) {
          el.textContent = 'あと' + (8 - pw.length) + '文字必要です';
          el.style.color = '#dc2626';
        } else if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) {
          el.textContent = '英字と数字の両方を含めてください';
          el.style.color = '#d97706';
        } else {
          el.textContent = 'OK';
          el.style.color = '#16a34a';
        }
      });
    }
  }

  return {
    render: render,
    bind: bind
  };
})();
