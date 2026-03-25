// ============================================
// ツチノート — 設定画面
// ユーザー情報、プラン管理、決済方法選択、通知設定、ログアウト
// モバイル前提: PayPay / Apple Pay / Google Pay / カード対応
// ============================================

var SettingsPage = (function() {
  'use strict';

  var APP_VERSION = '1.1.0';

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
    if (plan === 'pro') return 'プロ';
    if (plan === 'light') return 'ライト';
    return '無料';
  }

  /** プラン金額 */
  function planPrice(plan) {
    if (plan === 'pro') return '月額300円';
    if (plan === 'light') return '月額100円';
    return '0円';
  }

  /** プランバッジ */
  function planBadge(plan) {
    if (plan === 'pro') return '<span class="badge badge-pro">PRO</span>';
    if (plan === 'light') return '<span class="badge badge-light">LIGHT</span>';
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
        '</div>' +
        '<div class="payment-methods-note">' +
          'Apple PayはSafari、Google PayはChrome/Androidで自動表示されます' +
        '</div>' +
      '</div>';
  }

  /** 描画 */
  function render() {
    var user = getUser();
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

    // URLパラメータで決済結果をチェック
    var paymentResult = '';
    var hash = window.location.hash || '';
    if (hash.indexOf('payment=success') !== -1 || hash.indexOf('payment=mock_success') !== -1) {
      paymentResult = '<div class="alert-banner" style="background:var(--green-light);color:var(--green-dark);margin-bottom:16px;">' +
        '&#10004; 決済が完了しました！プランが更新されます。' +
      '</div>';
    } else if (hash.indexOf('payment=cancel') !== -1) {
      paymentResult = '<div class="alert-banner" style="margin-bottom:16px;">' +
        '決済がキャンセルされました。' +
      '</div>';
    }

    return '<div class="page">' +
      '<div class="page-title">&#9881;&#65039; 設定</div>' +

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

      // プラン比較表
      '<div class="settings-section">' +
        '<table class="plan-table">' +
          '<thead><tr>' +
            '<th>機能</th><th>無料</th><th>ライト</th><th>プロ</th>' +
          '</tr></thead>' +
          '<tbody>' +
            '<tr><td>月額</td><td>0円</td><td>100円</td><td>300円</td></tr>' +
            '<tr><td>畑の数</td><td>1つ</td><td>1つ</td><td>5つ</td></tr>' +
            '<tr><td>作物数/畑</td><td>5品目</td><td>5品目</td><td>無制限</td></tr>' +
            '<tr><td>天気予報</td><td>3日間</td><td>5日間</td><td>5日間</td></tr>' +
            '<tr><td>AI提案</td><td>1日1回</td><td>毎日</td><td>毎日+AI相談</td></tr>' +
            '<tr><td>作業記録</td><td>&#9711;</td><td>&#9711;</td><td>&#9711;</td></tr>' +
            '<tr><td>成長アルバム</td><td>&mdash;</td><td>&mdash;</td><td>&#9711;</td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>' +

      // アップグレード
      (plan !== 'pro' ?
        '<div class="settings-section">' +
          '<div class="settings-section-title">プランをアップグレード</div>' +
          '<div class="plan-select-cards">' +
            (plan !== 'light' ?
              '<button class="plan-select-card" id="select-light">' +
                '<div class="plan-select-name">ライトプラン</div>' +
                '<div class="plan-select-price">月額 <strong>100</strong>円</div>' +
                '<div class="plan-select-desc">畑1つ・5品目・天気5日間</div>' +
              '</button>' : '') +
            '<button class="plan-select-card plan-select-recommended" id="select-pro">' +
              '<div class="plan-select-badge">おすすめ</div>' +
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

      // ログアウト
      '<div class="settings-section">' +
        '<button class="btn btn-danger btn-block" id="logout-btn">ログアウト</button>' +
      '</div>' +

      // アプリ情報
      '<div class="text-center text-sm text-light mt-16">' +
        'ツチノート v' + APP_VERSION + '<br>&#127793; 家庭菜園をもっと楽しく' +
      '</div>' +
    '</div>';
  }

  /** チェックアウトへ遷移 */
  function startCheckout(planId) {
    var btn = document.getElementById('select-' + planId);
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.6';
    }

    TsuchiAPI.subscription.createCheckout(planId)
      .then(function(res) {
        if (res.data && res.data.url) {
          window.location.href = res.data.url;
        } else {
          App.toast('決済ページの準備中です。', 'warning');
        }
      })
      .catch(function(err) {
        App.toast(err.error || '決済の開始に失敗しました。', 'error');
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

    // 解約ボタン
    var cancelBtn = document.getElementById('cancel-sub-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() {
        if (!confirm('プランを解約しますか？\n現在の請求期間が終了するまで引き続きご利用いただけます。')) return;
        cancelBtn.disabled = true;
        cancelBtn.textContent = '処理中...';

        TsuchiAPI.subscription.cancel()
          .then(function(res) {
            App.toast('解約を受け付けました。期間終了まで引き続きご利用いただけます。');
            loadPlanInfo();
          })
          .catch(function(err) {
            App.toast(err.error || '解約に失敗しました。', 'error');
          })
          .finally(function() {
            cancelBtn.disabled = false;
            cancelBtn.textContent = 'プランを解約する';
          });
      });
    }

    // 通知トグル
    var toggle = document.getElementById('toggle-notify');
    if (toggle) {
      toggle.addEventListener('click', function() {
        state.notifications = !state.notifications;
        this.classList.toggle('active');
        App.toast(state.notifications ? '通知をオンにしました' : '通知をオフにしました');
      });
    }

    // PWAインストール
    var installBtn = document.getElementById('install-app-btn');
    if (installBtn) {
      installBtn.addEventListener('click', function() {
        App.promptInstall();
      });
    }

    // ログアウト
    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        if (!confirm('ログアウトしますか？')) return;
        localStorage.removeItem('tsuchi_token');
        localStorage.removeItem('tsuchi_user');
        App.toast('ログアウトしました');
        window.location.hash = '#/login';
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
          App.renderCurrentPage();
        }
      })
      .catch(function() {});
  }

  /** 初期化 */
  function init() {
    loadPlanInfo();
  }

  return {
    render: render,
    bind: bind,
    init: init
  };
})();
