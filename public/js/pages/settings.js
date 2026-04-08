// ============================================
// ツチノート — 設定画面
// ユーザー情報、プラン管理、決済方法選択、通知設定、ログアウト
// モバイル前提: PayPay / Apple Pay / Google Pay / カード対応
// ============================================

var SettingsPage = (function() {
  'use strict';

  var APP_VERSION = '1.1.0';

  /** URLからpaymentパラメータを除去（ブラウザ履歴を書き換えないreplaceState使用） */
  function cleanPaymentParam() {
    try {
      var url = new URL(window.location.href);
      if (url.searchParams.has('payment') || url.searchParams.has('session_id')) {
        url.searchParams.delete('payment');
        url.searchParams.delete('session_id');
        var cleanUrl = url.pathname + (url.search || '') + url.hash;
        window.history.replaceState(null, '', cleanUrl);
      }
    } catch(e) {}
  }

  // 状態
  var state = {
    user: null,
    plan: 'free',
    subscription: null,
    notifications: true
  };

  /** ユーザー情報を取得 */
  function getUser() {
    try {
      return JSON.parse(localStorage.getItem('tsuchi_user')) || {};
    } catch(e) {
      return {};
    }
  }

  /** プラン名の日本語表記 */
  function planLabel(plan) {
    if (plan === 'light') return 'ライト';
    if (plan === 'pro') return 'プロ';
    return '無料';
  }

  /** プラン金額 */
  function planPrice(plan) {
    if (plan === 'light') return '月額100円';
    if (plan === 'pro') return '月額300円';
    return '0円';
  }

  /** プランバッジ */
  function planBadge(plan) {
    if (plan === 'light') return '<span class="badge badge-light">LIGHT</span>';
    if (plan === 'pro') return '<span class="badge badge-pro">PRO</span>';
    return '<span class="badge badge-light">FREE</span>';
  }

  /** 決済方法アイコン表示 */
  function paymentMethodsHtml() {
    return '' +
      '<div class="payment-methods-info">' +
        '<div class="payment-methods-title">利用可能な決済方法</div>' +
        '<div class="payment-methods-grid">' +
          '<div class="payment-method-chip">' +
            '<svg class="payment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' +
            '<span>クレジットカード</span>' +
          '</div>' +
          '<div class="payment-method-chip">' +
            '<svg class="payment-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#FF0033" opacity="0.15"/><text x="12" y="16" text-anchor="middle" font-size="10" font-weight="bold" fill="#FF0033">Pay</text></svg>' +
            '<span>PayPay</span>' +
          '</div>' +
          '<div class="payment-method-chip">' +
            '<svg class="payment-icon" viewBox="0 0 24 24"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" fill="#333"/></svg>' +
            '<span>Apple Pay</span>' +
          '</div>' +
          '<div class="payment-method-chip">' +
            '<svg class="payment-icon" viewBox="0 0 24 24"><path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z" fill="#4285F4"/></svg>' +
            '<span>Google Pay</span>' +
          '</div>' +
          '<div class="payment-method-chip">' +
            '<svg class="payment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="9" y1="15" x2="15" y2="15"/></svg>' +
            '<span>コンビニ払い</span>' +
          '</div>' +
        '</div>' +
        '<div class="payment-methods-note">' +
          'Apple PayはSafari、Google PayはChrome/Androidで自動表示されます' +
        '</div>' +
      '</div>';
  }

  /** 描画 */
  function render() {
    // APIから取得したプロフィールを優先、なければlocalStorageのデータを使用
    var user = state.user || getUser();
    var plan = state.plan;
    var sub = state.subscription;

    // サブスク情報テキスト
    var subInfoHtml = '';
    if (sub && sub.status === 'active') {
      var nextDate = sub.next_billing_date ? new Date(sub.next_billing_date).toLocaleDateString('ja-JP') : '不明';
      subInfoHtml = '<div class="text-sm text-light mt-8">次回更新: ' + nextDate + '</div>';
      if (sub.cancel_at_period_end) {
        subInfoHtml = '<div class="text-sm" style="color:var(--warning);margin-top:8px;">解約予定（期間終了まで利用可能）</div>';
      }
    }

    // URLパラメータで決済結果をチェック（厳密なパラメータマッチング）
    var paymentResult = '';
    var fullUrl = window.location.href || '';
    var urlQuery = '';
    // ?payment=xxx はハッシュの前に付く場合とハッシュ内に付く場合がある
    if (fullUrl.indexOf('?') !== -1) {
      urlQuery = fullUrl.substring(fullUrl.indexOf('?'));
      if (urlQuery.indexOf('#') !== -1) {
        urlQuery = urlQuery.substring(0, urlQuery.indexOf('#'));
      }
    }
    var paymentParam = '';
    try {
      paymentParam = new URLSearchParams(urlQuery).get('payment') || '';
    } catch(e) { paymentParam = ''; }

    if (paymentParam === 'success') {
      paymentResult = '<div class="alert-banner" style="background:var(--green-light);color:var(--green-dark);margin-bottom:16px;">' +
        '&#10004; 決済が完了しました！プランが更新されます。' +
      '</div>';
      // URLからpaymentパラメータを除去（リロード時の再表示防止）
      cleanPaymentParam();
    } else if (paymentParam === 'cancel') {
      paymentResult = '<div class="alert-banner" style="margin-bottom:16px;">' +
        '決済がキャンセルされました。' +
      '</div>';
      cleanPaymentParam();
    }

    return '<div class="page">' +
      '<div class="page-title">設定</div>' +

      // 決済結果通知
      paymentResult +

      // ユーザー情報
      '<div class="settings-section">' +
        '<div class="settings-section-title">アカウント</div>' +
        '<div class="settings-item">' +
          '<span class="settings-item-label">名前</span>' +
          '<span class="settings-item-value">' + escapeHtml(user.name || '未設定') + '</span>' +
        '</div>' +
        '<div class="settings-item">' +
          '<span class="settings-item-label">メール</span>' +
          '<span class="settings-item-value">' + escapeHtml(user.email || '未設定') + '</span>' +
        '</div>' +
      '</div>' +

      // プラン情報
      '<div class="settings-section">' +
        '<div class="settings-section-title">ご利用プラン</div>' +
        '<div class="settings-item">' +
          '<span class="settings-item-label">現在のプラン</span>' +
          '<span class="settings-item-value">' + planLabel(plan) + '（' + planPrice(plan) + '）' + planBadge(plan) + '</span>' +
        '</div>' +
        subInfoHtml +
      '</div>' +

      // プラン比較表（無料 / ライト / プロ の3プラン構成）
      '<div class="settings-section">' +
        '<table class="plan-table">' +
          '<thead><tr>' +
            '<th>機能</th><th>無料</th><th>ライト</th><th>プロ</th>' +
          '</tr></thead>' +
          '<tbody>' +
            '<tr><td>月額</td><td>0円</td><td>100円</td><td>300円</td></tr>' +
            '<tr><td>畑の数</td><td>1つ</td><td>3つ</td><td>5つ</td></tr>' +
            '<tr><td>作物数/畑</td><td>5品目</td><td>10品目</td><td>無制限</td></tr>' +
            '<tr><td>天気予報</td><td>3日間</td><td>5日間</td><td>5日間</td></tr>' +
            '<tr><td>AI提案</td><td>1日1回</td><td>1日3回</td><td>毎日+AI相談</td></tr>' +
            '<tr><td>作業記録</td><td>&#9711;</td><td>&#9711;</td><td>&#9711;</td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>' +

      // アップグレード（ライト / プロ の2プラン）
      (plan !== 'pro' ?
        '<div class="settings-section">' +
          '<div class="settings-section-title">プランをアップグレード</div>' +
          '<div class="plan-select-cards">' +
            (plan === 'free' ?
              '<button class="plan-select-card" id="select-light">' +
                '<div class="plan-select-name">ライトプラン</div>' +
                '<div class="plan-select-price">月額 <strong>100</strong>円</div>' +
                '<div class="plan-select-desc">畑3つ・10品目・AI3回/日</div>' +
              '</button>' : '') +
            '<button class="plan-select-card plan-select-recommended" id="select-pro">' +
              '<div class="plan-select-name">プロプラン</div>' +
              '<div class="plan-select-price">月額 <strong>300</strong>円</div>' +
              '<div class="plan-select-desc">畑5つ・無制限・AI相談</div>' +
            '</button>' +
          '</div>' +
          paymentMethodsHtml() +
        '</div>' : '') +

      // 解約ボタン（有料プランの場合）
      (plan !== 'free' && sub && !sub.cancel_at_period_end ?
        '<div class="settings-section">' +
          '<button class="btn btn-outline btn-block" id="cancel-sub-btn">プランを解約する</button>' +
        '</div>' : '') +

      // 通知設定
      '<div class="settings-section">' +
        '<div class="settings-section-title">通知</div>' +
        '<div class="settings-item">' +
          '<span class="settings-item-label">朝の提案通知</span>' +
          '<div class="toggle' + (state.notifications ? ' active' : '') + '" id="toggle-notify"></div>' +
        '</div>' +
      '</div>' +

      // PWAインストール
      '<div class="settings-section">' +
        '<div class="settings-section-title">アプリ</div>' +
        '<div class="settings-item" id="install-app-btn" style="cursor:pointer;">' +
          '<span class="settings-item-label">ホーム画面に追加</span>' +
          '<span class="settings-item-value" style="color:var(--green-mid);">インストール &rsaquo;</span>' +
        '</div>' +
      '</div>' +

      // パスワード変更
      '<div class="settings-section">' +
        '<div class="settings-section-title">セキュリティ</div>' +
        '<div id="password-change-area">' +
          '<div class="form-group">' +
            '<label class="form-label" for="current-pw">現在のパスワード</label>' +
            '<input class="form-input" type="password" id="current-pw" autocomplete="current-password">' +
          '</div>' +
          '<div class="form-group" style="margin-top:8px;">' +
            '<label class="form-label" for="new-pw">新しいパスワード</label>' +
            '<input class="form-input" type="password" id="new-pw" autocomplete="new-password" minlength="8">' +
            '<div style="font-size:0.75rem;color:#6b7280;margin-top:4px;" id="pw-strength">8文字以上、英字と数字を含めてください</div>' +
          '</div>' +
          '<div class="form-group" style="margin-top:8px;">' +
            '<label class="form-label" for="confirm-pw">新しいパスワード（確認）</label>' +
            '<input class="form-input" type="password" id="confirm-pw" autocomplete="new-password">' +
          '</div>' +
          '<button class="btn btn-primary btn-block" id="change-pw-btn" style="margin-top:12px;">パスワードを変更</button>' +
        '</div>' +
      '</div>' +

      // ログアウト
      '<div class="settings-section">' +
        '<button class="btn btn-danger btn-block" id="logout-btn">ログアウト</button>' +
      '</div>' +

      // アカウント削除（危険ゾーン）
      '<div class="settings-section" style="border:1px solid #fecaca;border-radius:12px;padding:16px;">' +
        '<div class="settings-section-title" style="color:#dc2626;">アカウント削除</div>' +
        '<div style="font-size:0.85rem;color:#6b7280;">アカウントを削除すると、すべてのデータが完全に削除されます。この操作は取り消せません。</div>' +
        '<button class="btn btn-outline btn-block" id="delete-account-btn" style="margin-top:12px;color:#dc2626;border-color:#fecaca;">アカウントを削除する</button>' +
      '</div>' +

      // アプリ情報
      '<div class="text-center text-sm text-light mt-16">' +
        'ツチノート v' + APP_VERSION + '<br>&#127793; 家庭菜園をもっと楽しく' +
      '</div>' +
    '</div>';
  }

  /** チェックアウト（リダイレクト型 Stripe Checkout） */
  function startCheckout(planId) {
    var btn = document.getElementById('select-' + planId);
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.6';
    }

    TsuchiAPI.subscription.createCheckout(planId)
      .then(function(res) {
        if (res.data && res.data.mock) {
          // モックモード: 即座に成功扱い
          App.toast('（テスト）決済が完了しました。', 'success');
          loadPlanInfo();
          return;
        }
        // リダイレクト型: サーバーから返されたStripe Checkout URLに遷移
        var url = (res.data && res.data.url) || res.url;
        if (url) {
          window.location.href = url;
        } else {
          App.toast('決済ページの準備中です。', 'warning');
        }
      })
      .catch(function(err) {
        App.toast(err.error || err.message || '決済ページを開けませんでした。通信状況を確認して、もう一度お試しください。', 'error');
      })
      .finally(function() {
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = '1';
        }
      });
  }

  /** イベントバインド */
  function bind() {
    // ライトプラン選択
    var lightBtn = document.getElementById('select-light');
    if (lightBtn) {
      lightBtn.addEventListener('click', function() {
        startCheckout('light');
      });
    }

    // プロプラン選択
    var proBtn = document.getElementById('select-pro');
    if (proBtn) {
      proBtn.addEventListener('click', function() {
        startCheckout('pro');
      });
    }

    // 解約ボタン（ボタンフィードバック + 二重送信防止）
    var cancelBtn = document.getElementById('cancel-sub-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() {
        if (!confirm('プランを解約しますか？\n現在の請求期間が終了するまで引き続きご利用いただけます。')) return;
        var restore = App.btnLoading(cancelBtn, '解約処理中...');

        TsuchiAPI.subscription.cancel()
          .then(function() {
            restore(true);
            App.toast('解約を受け付けました。期間終了まで引き続きご利用いただけます。');
            loadPlanInfo();
          })
          .catch(function(err) {
            restore(false);
            App.toast(err.error || '解約処理に失敗しました。通信状況を確認して、もう一度お試しください。', 'error');
          });
      });
    }

    // 通知トグル（localStorageで永続化 + キーボード操作対応）
    var toggle = document.getElementById('toggle-notify');
    if (toggle) {
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('tabindex', '0');
      toggle.setAttribute('aria-checked', state.notifications ? 'true' : 'false');
      toggle.setAttribute('aria-label', '朝の提案通知の切替');

      function toggleNotify() {
        state.notifications = !state.notifications;
        localStorage.setItem('tsuchi_notifications', state.notifications ? '1' : '0');
        toggle.classList.toggle('active');
        toggle.setAttribute('aria-checked', state.notifications ? 'true' : 'false');
        App.toast(state.notifications ? '通知をオンにしました' : '通知をオフにしました');
      }

      toggle.addEventListener('click', toggleNotify);
      toggle.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleNotify();
        }
      });
    }

    // パスワードフィールドのエラークリア
    ['current-pw', 'new-pw', 'confirm-pw'].forEach(function(id) {
      var input = document.getElementById(id);
      if (input) {
        input.addEventListener('input', function() {
          this.classList.remove('form-error');
        });
      }
    });

    // PWAインストール
    var installBtn = document.getElementById('install-app-btn');
    if (installBtn) {
      installBtn.addEventListener('click', function() {
        App.promptInstall();
      });
    }

    // パスワード強度チェック（リアルタイム）
    var newPwInput = document.getElementById('new-pw');
    if (newPwInput) {
      newPwInput.addEventListener('input', function() {
        var el = document.getElementById('pw-strength');
        if (this.value.length === 0) {
          if (el) { el.textContent = '8文字以上、英字と数字を含めてください'; el.style.color = '#6b7280'; }
        } else {
          updatePasswordStrength(this.value, el);
          // settings画面ではOK時に「パスワード強度: 」プレフィックスを付与
          if (el && el.textContent === 'OK') el.textContent = 'パスワード強度: OK';
        }
      });
    }

    // パスワード変更（ボタンフィードバック + 二重送信防止）
    var changePwBtn = document.getElementById('change-pw-btn');
    if (changePwBtn) {
      changePwBtn.addEventListener('click', function() {
        var currentPw = document.getElementById('current-pw').value;
        var newPw = document.getElementById('new-pw').value;
        var confirmPw = document.getElementById('confirm-pw').value;

        if (!currentPw) {
          App.toast('現在のパスワードを入力してください。', 'error');
          document.getElementById('current-pw').classList.add('form-error');
          document.getElementById('current-pw').focus();
          return;
        }
        if (!newPw || newPw.length < 8) {
          App.toast('新しいパスワードは8文字以上で入力してください。', 'error');
          document.getElementById('new-pw').classList.add('form-error');
          document.getElementById('new-pw').focus();
          return;
        }
        if (!/[a-zA-Z]/.test(newPw) || !/[0-9]/.test(newPw)) {
          App.toast('パスワードは英字と数字の両方を含めてください。', 'error');
          document.getElementById('new-pw').classList.add('form-error');
          document.getElementById('new-pw').focus();
          return;
        }
        if (newPw !== confirmPw) {
          App.toast('新しいパスワードが一致しません。確認用のパスワードを再入力してください。', 'error');
          document.getElementById('confirm-pw').classList.add('form-error');
          document.getElementById('confirm-pw').focus();
          return;
        }

        var restore = App.btnLoading(changePwBtn, 'パスワードを変更中...');

        TsuchiAPI.auth.changePassword(currentPw, newPw)
          .then(function() {
            restore(true);
            App.toast('パスワードを変更しました');
            document.getElementById('current-pw').value = '';
            document.getElementById('new-pw').value = '';
            document.getElementById('confirm-pw').value = '';
            var el = document.getElementById('pw-strength');
            if (el) { el.textContent = '8文字以上、英字と数字を含めてください'; el.style.color = '#6b7280'; }
          })
          .catch(function(err) {
            restore(false);
            App.toast(err.error || 'パスワード変更に失敗しました。現在のパスワードが正しいか確認してください。', 'error');
          });
      });
    }

    // ログアウト
    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        if (!confirm('ログアウトしますか？')) return;
        App.logout();
      });
    }

    // アカウント削除（ボタンフィードバック + 二重送信防止）
    var deleteBtn = document.getElementById('delete-account-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function() {
        var pw = prompt('アカウントを削除するには、パスワードを入力してください。\nこの操作は取り消せません。');
        if (!pw) return;
        if (!confirm('本当にアカウントを削除しますか？\nすべてのデータが完全に削除されます。')) return;

        var restore = App.btnLoading(deleteBtn, 'アカウント削除中...');

        TsuchiAPI.auth.deleteAccount(pw)
          .then(function() {
            restore(true);
            App.logout('アカウントを削除しました。ご利用ありがとうございました。');
          })
          .catch(function(err) {
            restore(false);
            App.toast(err.error || 'アカウント削除に失敗しました。パスワードが正しいか確認してください。', 'error');
          });
      });
    }
  }

  /** プラン情報読み込み */
  function loadPlanInfo() {
    TsuchiAPI.subscription.getStatus()
      .then(function(res) {
        if (res.data) {
          state.plan = res.data.plan || 'free';
          state.subscription = res.data.subscription || null;
          // localStorageのユーザー情報もプランを同期
          try {
            var u = JSON.parse(localStorage.getItem('tsuchi_user')) || {};
            if (u.plan !== state.plan) {
              u.plan = state.plan;
              localStorage.setItem('tsuchi_user', JSON.stringify(u));
            }
          } catch(e) {}
          App.renderCurrentPage();
        }
      })
      .catch(function() {});
  }

  /** プロフィール情報読み込み（名前・メールをAPIから同期） */
  function loadProfileInfo() {
    TsuchiAPI.auth.getProfile()
      .then(function(res) {
        if (res.data) {
          state.user = res.data;
          // localStorageのユーザー情報を最新に同期
          try {
            var u = JSON.parse(localStorage.getItem('tsuchi_user')) || {};
            u.name = res.data.name;
            u.email = res.data.email;
            u.plan = res.data.plan;
            localStorage.setItem('tsuchi_user', JSON.stringify(u));
          } catch(e) {}
          // planも同期
          state.plan = res.data.plan || state.plan;
          App.renderCurrentPage();
        }
      })
      .catch(function() {});
  }

  /** 初期化 */
  function init() {
    // 通知設定をlocalStorageから復元
    var saved = localStorage.getItem('tsuchi_notifications');
    if (saved !== null) {
      state.notifications = saved === '1';
    }
    loadPlanInfo();
    loadProfileInfo();
  }

  return {
    render: render,
    bind: bind,
    init: init
  };
})();
