// ============================================
// ツチノート — 作業記録画面
// カレンダービュー + 記録一覧 + 新規追加
// ============================================

var RecordPage = (function() {
  'use strict';

  var DOW = ['日', '月', '火', '水', '木', '金', '土'];

  // 状態
  var state = {
    farms: [],
    records: [],
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    recordDates: {}  // 'YYYY-MM-DD': true（記録がある日）
  };

  /** 日付フォーマット YYYY-MM-DD */
  function fmtDate(d) {
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }

  /** カレンダーHTML生成 */
  function renderCalendar() {
    var y = state.calendarYear;
    var m = state.calendarMonth;
    var today = new Date();
    var todayStr = fmtDate(today);
    var title = y + '年' + (m + 1) + '月';

    // 月初・月末
    var firstDay = new Date(y, m, 1).getDay();
    var lastDate = new Date(y, m + 1, 0).getDate();
    var prevLastDate = new Date(y, m, 0).getDate();

    var html = '<div class="calendar">' +
      '<div class="calendar-header">' +
        '<button class="calendar-nav" id="cal-prev" aria-label="前の月へ">&lt;</button>' +
        '<div class="calendar-title">' + title + '</div>' +
        '<button class="calendar-nav" id="cal-next" aria-label="次の月へ">&gt;</button>' +
      '</div>' +
      '<div class="calendar-grid">';

    // 曜日ヘッダー
    DOW.forEach(function(d) {
      html += '<div class="calendar-dow">' + d + '</div>';
    });

    // 前月の日
    for (var i = firstDay - 1; i >= 0; i--) {
      html += '<div class="calendar-day other-month">' + (prevLastDate - i) + '</div>';
    }

    // 当月の日
    for (var d = 1; d <= lastDate; d++) {
      var dateStr = y + '-' + ('0' + (m + 1)).slice(-2) + '-' + ('0' + d).slice(-2);
      var cls = 'calendar-day';
      if (dateStr === todayStr) cls += ' today';
      if (state.recordDates[dateStr]) cls += ' has-record';
      html += '<div class="' + cls + '">' + d + '</div>';
    }

    // 次月の日（6行になるように埋める）
    var totalCells = firstDay + lastDate;
    var remaining = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
    for (var r = 1; r <= remaining; r++) {
      html += '<div class="calendar-day other-month">' + r + '</div>';
    }

    html += '</div></div>';
    return html;
  }

  /** 記録一覧HTML */
  function renderRecordList() {
    if (state.records.length === 0) {
      return '<div class="empty-state">' +
        '<div class="empty-state-icon">&#128221;</div>' +
        '<div class="empty-state-text">まだ作業記録がありません</div>' +
      '</div>';
    }

    var html = '';
    var currentDate = '';

    state.records.forEach(function(rec) {
      var recDate = rec.date || rec.createdAt || '';
      var dateLabel = recDate.slice(0, 10);

      // 日付ヘッダー（日付が変わったら表示）
      if (dateLabel !== currentDate) {
        currentDate = dateLabel;
        html += '<div class="record-date-header">' + dateLabel + '</div>';
      }

      var completed = rec.completed;
      var farmId = rec.farmId || rec.farm_id || '';
      html += '<div class="record-item" data-record-id="' + rec.id + '">' +
        '<div class="record-check' + (completed ? ' checked' : '') + '" data-id="' + rec.id + '" data-farm="' + farmId + '"></div>' +
        '<div class="record-content">' +
          '<div class="record-title' + (completed ? ' completed' : '') + '">' + escapeHtml(rec.content) + '</div>' +
          '<div class="record-meta">' + escapeHtml(rec.farmName || rec.farm_name || '') + (rec.cropName || rec.crop_name ? ' / ' + escapeHtml(rec.cropName || rec.crop_name) : '') + '</div>' +
        '</div>' +
      '</div>';
    });

    return html;
  }

  /** メイン描画 */
  function render() {
    // 畑セレクター
    var farmOptions = '<option value="">すべての畑</option>';
    state.farms.forEach(function(f) {
      farmOptions += '<option value="' + f.id + '">' + escapeHtml(f.name) + '</option>';
    });

    return '<div class="page">' +
      '<div class="page-title">作業記録' +
        '<button class="btn btn-sm btn-primary" id="add-record-btn">+ 記録追加</button>' +
      '</div>' +
      renderCalendar() +
      '<div class="mb-16">' +
        '<select class="form-input" id="record-farm-filter" aria-label="畑でフィルタリング">' + farmOptions + '</select>' +
      '</div>' +
      '<div id="record-list">' + renderRecordList() + '</div>' +
    '</div>';
  }

  /** 新規記録モーダル */
  function showAddRecordModal() {
    var farmOptions = '';
    state.farms.forEach(function(f) {
      farmOptions += '<option value="' + f.id + '">' + escapeHtml(f.name) + '</option>';
    });

    if (state.farms.length === 0) {
      App.toast('先に畑を登録してください。', 'warning');
      return;
    }

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '作業を記録');
    overlay.innerHTML =
      '<div class="modal">' +
        '<div class="modal-title">作業を記録 <button class="modal-close" id="close-record-modal" aria-label="閉じる">&times;</button></div>' +
        '<form id="record-form">' +
          '<div class="form-group">' +
            '<label class="form-label" for="rec-date">日付</label>' +
            '<input class="form-input" type="date" id="rec-date" value="' + fmtDate(new Date()) + '" required aria-required="true">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label" for="rec-farm">畑</label>' +
            '<select class="form-input" id="rec-farm" required aria-required="true">' + farmOptions + '</select>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label" for="rec-content">作業内容</label>' +
            '<textarea class="form-input" id="rec-content" placeholder="例: トマトに水やり、支柱を立て直した" required aria-required="true"></textarea>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary btn-block mt-16">記録する</button>' +
        '</form>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('close-record-modal').addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    // モーダル内にフォーカスを移動
    var recContent = document.getElementById('rec-content');
    if (recContent) setTimeout(function() { recContent.focus(); }, 100);

    App.guardSubmit(document.getElementById('record-form'), function() {
      var farmId = document.getElementById('rec-farm').value;
      var data = {
        date: document.getElementById('rec-date').value,
        content: document.getElementById('rec-content').value.trim()
      };

      if (!data.content) {
        App.toast('作業内容を入力してください。', 'warning');
        document.getElementById('rec-content').focus();
        return Promise.reject();
      }

      return TsuchiAPI.record.create(farmId, data)
        .then(function() {
          App.toast('記録しました！');
          overlay.remove();
          loadRecords();
        })
        .catch(function(err) {
          App.toast(err.error || '記録の保存に失敗しました。通信状況を確認してください。', 'error');
          throw err;
        });
    });
  }

  /** 記録データ読み込み */
  function loadRecords() {
    TsuchiAPI.farm.list()
      .then(function(res) {
        state.farms = res.data || [];
        // フィルター選択中の畑、またはデフォルトで最初の畑
        var filterEl = document.getElementById('record-farm-filter');
        var farmId = (filterEl && filterEl.value) ? filterEl.value : (state.farms[0] ? state.farms[0].id : null);
        if (farmId) {
          return TsuchiAPI.record.list(farmId, {
            month: state.calendarYear + '-' + ('0' + (state.calendarMonth + 1)).slice(-2)
          });
        }
        return { data: [] };
      })
      .then(function(res) {
        state.records = res.data || [];
        // 記録日マップを構築
        state.recordDates = {};
        state.records.forEach(function(r) {
          var d = (r.date || r.created_at || '').slice(0, 10);
          if (d) state.recordDates[d] = true;
        });
        App.renderCurrentPage();
      })
      .catch(function() {});
  }

  /** イベントバインド */
  function bind() {
    // 記録追加ボタン
    var addBtn = document.getElementById('add-record-btn');
    if (addBtn) addBtn.addEventListener('click', showAddRecordModal);

    // カレンダー前月・翌月
    var prevBtn = document.getElementById('cal-prev');
    var nextBtn = document.getElementById('cal-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        state.calendarMonth--;
        if (state.calendarMonth < 0) { state.calendarMonth = 11; state.calendarYear--; }
        App.renderCurrentPage();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        state.calendarMonth++;
        if (state.calendarMonth > 11) { state.calendarMonth = 0; state.calendarYear++; }
        App.renderCurrentPage();
      });
    }

    // 記録の完了チェック（アクセシビリティ + 二重送信防止）
    var checks = document.querySelectorAll('.record-check');
    checks.forEach(function(el) {
      el.setAttribute('role', 'checkbox');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-checked', el.classList.contains('checked') ? 'true' : 'false');
      el.setAttribute('aria-label', '作業を完了としてマーク');

      var processing = false;
      function handleCheck(checkEl) {
        if (processing) return;
        processing = true;
        var recordId = checkEl.dataset.id;
        var farmId = checkEl.dataset.farm;

        TsuchiAPI.record.complete(farmId, recordId)
          .then(function() {
            checkEl.classList.toggle('checked');
            var isChecked = checkEl.classList.contains('checked');
            checkEl.setAttribute('aria-checked', isChecked ? 'true' : 'false');
            var title = checkEl.nextElementSibling.querySelector('.record-title');
            if (title) title.classList.toggle('completed');
          })
          .catch(function(err) {
            App.toast(err.error || '更新に失敗しました。通信状況を確認してください。', 'error');
          })
          .finally(function() { processing = false; });
      }

      el.addEventListener('click', function() { handleCheck(this); });
      el.addEventListener('keydown', function(e) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleCheck(this);
        }
      });
    });

    // 畑フィルター
    var filter = document.getElementById('record-farm-filter');
    if (filter) {
      filter.addEventListener('change', function() {
        // フィルター変更で再読込（将来対応）
        loadRecords();
      });
    }
  }

  /** 初期化 */
  function init() {
    loadRecords();
  }

  return {
    render: render,
    bind: bind,
    init: init
  };
})();
