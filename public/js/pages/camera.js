// ============================================
// ツチノート — カメラ診断ページ
// 撮影 → プレビュー → AI診断（モック）
// ============================================

var CameraPage = (function() {
  'use strict';

  // モック診断結果（API接続後に差し替え）
  var MOCK_DIAGNOSIS = {
    soil: 'やや乾燥気味です。表面が白っぽくなっています。',
    leaf: '全体的に健康です。下の葉に軽い黄変が見られます。',
    action: '明日の朝、根元にたっぷり水をあげてください。黄変した葉は取り除いても大丈夫です。'
  };

  // 状態管理
  var state = {
    imageDataUrl: null,
    diagnosing: false,
    result: null
  };

  /** 画面HTML生成 */
  function render() {
    var html = '<div class="page">';
    html += '<div class="camera-page-header">畑を診断する</div>';

    // 撮影セクション
    html += '<div class="card camera-capture-card">';
    html += '<input type="file" accept="image/*" capture="environment" id="camera-input" class="camera-input-hidden">';

    if (!state.imageDataUrl) {
      // 未撮影: 撮影ボタン表示
      html +=
        '<div class="camera-placeholder">' +
          '<svg class="camera-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
            '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>' +
            '<circle cx="12" cy="13" r="4"/>' +
          '</svg>' +
          '<div class="camera-placeholder-text">畑の写真を撮影して、土や葉の状態を診断します</div>' +
        '</div>' +
        '<button class="btn btn-primary btn-block" id="camera-trigger-btn">撮影する</button>';
    } else {
      // 撮影済み: プレビュー表示
      html +=
        '<div class="camera-preview-wrap">' +
          '<img src="' + state.imageDataUrl + '" alt="撮影した写真" class="camera-preview-img">' +
        '</div>' +
        '<div class="camera-btn-row">' +
          '<button class="btn btn-secondary" id="camera-retake-btn">撮り直す</button>' +
          '<button class="btn btn-primary" id="camera-diagnose-btn"' + (state.diagnosing ? ' disabled' : '') + '>' +
            (state.diagnosing ? '診断中...' : '診断する') +
          '</button>' +
        '</div>';
    }

    html += '</div>'; // .card

    // ローディング表示
    if (state.diagnosing) {
      html +=
        '<div class="camera-loading">' +
          '<div class="spinner"></div>' +
          '<div class="camera-loading-text">写真を分析しています...</div>' +
        '</div>';
    }

    // 診断結果
    if (state.result) {
      html +=
        '<div class="card">' +
          '<div class="card-header">診断結果</div>' +
          '<div class="camera-result-item">' +
            '<div class="camera-result-label">土の状態</div>' +
            '<div class="camera-result-value">' + escapeHtml(state.result.soil) + '</div>' +
          '</div>' +
          '<div class="camera-result-item">' +
            '<div class="camera-result-label">葉の状態</div>' +
            '<div class="camera-result-value">' + escapeHtml(state.result.leaf) + '</div>' +
          '</div>' +
          '<div class="camera-result-item camera-result-action">' +
            '<div class="camera-result-label">推奨アクション</div>' +
            '<div class="camera-result-value">' + escapeHtml(state.result.action) + '</div>' +
          '</div>' +
        '</div>' +
        '<button class="btn btn-primary btn-block mt-16" id="camera-new-btn">もう一度撮影する</button>';
    }

    html += '</div>'; // .page
    return html;
  }

  /** イベントバインド */
  function bind() {
    var fileInput = document.getElementById('camera-input');

    // 撮影ボタン
    var triggerBtn = document.getElementById('camera-trigger-btn');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', function() {
        fileInput.click();
      });
    }

    // 撮り直しボタン
    var retakeBtn = document.getElementById('camera-retake-btn');
    if (retakeBtn) {
      retakeBtn.addEventListener('click', function() {
        state.imageDataUrl = null;
        state.result = null;
        state.diagnosing = false;
        App.renderCurrentPage();
      });
    }

    // もう一度撮影するボタン
    var newBtn = document.getElementById('camera-new-btn');
    if (newBtn) {
      newBtn.addEventListener('click', function() {
        state.imageDataUrl = null;
        state.result = null;
        state.diagnosing = false;
        App.renderCurrentPage();
      });
    }

    // 診断ボタン
    var diagnoseBtn = document.getElementById('camera-diagnose-btn');
    if (diagnoseBtn) {
      diagnoseBtn.addEventListener('click', function() {
        runDiagnosis();
      });
    }

    // ファイル選択時
    if (fileInput) {
      fileInput.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function(ev) {
          state.imageDataUrl = ev.target.result;
          state.result = null;
          App.renderCurrentPage();
        };
        reader.readAsDataURL(file);
      });
    }
  }

  /** モック診断実行（2秒ローディング後に結果表示） */
  function runDiagnosis() {
    state.diagnosing = true;
    App.renderCurrentPage();

    setTimeout(function() {
      state.diagnosing = false;
      state.result = MOCK_DIAGNOSIS;
      App.renderCurrentPage();
    }, 2000);
  }

  /** ページ初期化 */
  function init() {
    state.imageDataUrl = null;
    state.diagnosing = false;
    state.result = null;
  }

  return {
    render: render,
    bind: bind,
    init: init
  };
})();
