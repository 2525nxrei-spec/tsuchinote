// ============================================
// ツチノート — 畑・作物管理画面
// 畑一覧、畑追加、作物管理、生育ステージ表示
// ============================================

var FarmPage = (function() {
  'use strict';

  // 品目マスタ（30品目）
  var CROP_TYPES = [
    'トマト','ミニトマト','キュウリ','ナス','ピーマン',
    'オクラ','ゴーヤ','ズッキーニ','カボチャ','スイカ',
    'トウモロコシ','エダマメ','インゲン','ジャガイモ','サツマイモ',
    'ダイコン','ニンジン','カブ','ホウレンソウ','コマツナ',
    'レタス','キャベツ','ブロッコリー','ネギ','タマネギ',
    'ニンニク','ショウガ','バジル','シソ','パセリ'
  ];

  // 状態
  var state = {
    farms: [],
    selectedFarm: null,  // 詳細表示中の畑
    crops: [],
    view: 'list'         // 'list' | 'detail'
  };

  /** 畑一覧のHTML */
  function renderFarmList() {
    var html = '<div class="page-title">畑の管理' +
      '<button class="btn btn-sm btn-primary" id="add-farm-btn">+ 畑を追加</button></div>';

    if (state.farms.length === 0) {
      html += '<div class="empty-state">' +
        '<div class="empty-state-icon"></div>' +
        '<div class="empty-state-text">まだ畑が登録されていません</div>' +
        '<button class="btn btn-primary" id="add-farm-btn2">最初の畑を登録する</button></div>';
    } else {
      state.farms.forEach(function(farm) {
        var cropCount = farm.crop_count || 0;
        html += '<div class="farm-card" data-farm-id="' + farm.id + '">' +
          '<div class="farm-card-icon"></div>' +
          '<div class="farm-card-info">' +
            '<div class="farm-card-name">' + escapeHtml(farm.name) + '</div>' +
            '<div class="farm-card-meta">' + cropCount + '品目 栽培中</div>' +
          '</div>' +
          '<div class="farm-card-arrow">&#8250;</div>' +
        '</div>';
      });
    }
    return html;
  }

  /** 畑詳細（作物一覧）のHTML */
  function renderFarmDetail() {
    var farm = state.selectedFarm;
    if (!farm) return '';

    var html = '<div class="page-title">' +
      '<span><button class="btn btn-sm btn-outline" id="back-to-list">&larr; 戻る</button> ' + escapeHtml(farm.name) + '</span>' +
      '<button class="btn btn-sm btn-primary" id="add-crop-btn">+ 作物追加</button></div>';

    if (state.crops.length === 0) {
      html += '<div class="empty-state">' +
        '<div class="empty-state-icon"></div>' +
        '<div class="empty-state-text">作物を追加して栽培を始めましょう</div>' +
        '<button class="btn btn-primary" id="add-crop-btn2">作物を追加する</button></div>';
    } else {
      state.crops.forEach(function(crop) {
        // バックエンドレスポンス: currentStage: {name, daysSincePlanting, progress}, estimatedHarvest: {date, daysRemaining}
        var progress = (crop.currentStage && crop.currentStage.progress) || 0;
        var stageName = (crop.currentStage && crop.currentStage.name) || '未設定';
        var plantedAt = crop.plantedAt || crop.planted_at || '未設定';
        var harvestDate = (crop.estimatedHarvest && crop.estimatedHarvest.date) || '未定';
        var harvestDays = (crop.estimatedHarvest && crop.estimatedHarvest.daysRemaining);
        var harvestLabel = harvestDate !== '未定' && harvestDays != null ? harvestDate + '（あと' + harvestDays + '日）' : harvestDate;
        var notes = crop.notes || crop.memo || '';

        html += '<div class="crop-item">' +
          '<div class="crop-header">' +
            '<div class="crop-name">' + escapeHtml(crop.name) + '</div>' +
            '<div class="crop-stage">' + escapeHtml(stageName) + '</div>' +
          '</div>' +
          '<div class="progress-bar"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
          '<div class="crop-dates">' +
            '<span>植付: ' + escapeHtml(plantedAt) + '</span>' +
            '<span>収穫予測: ' + escapeHtml(harvestLabel) + '</span>' +
          '</div>' +
          (notes ? '<div class="text-sm text-light mt-8">' + escapeHtml(notes) + '</div>' : '') +
        '</div>';
      });
    }

    // 畑削除ボタン
    html += '<button class="btn btn-danger btn-block mt-16" id="delete-farm-btn">この畑を削除する</button>';

    return html;
  }

  /** メイン描画 */
  function render() {
    var content = state.view === 'detail' ? renderFarmDetail() : renderFarmList();
    return '<div class="page">' + content + '</div>';
  }

  /** 位置情報を取得する共通処理 */
  function fetchGeolocation() {
    var statusEl = document.getElementById('location-status');
    var locationInput = document.getElementById('farm-location');
    var latInput = document.getElementById('farm-lat');
    var lonInput = document.getElementById('farm-lon');
    var btn = document.getElementById('get-location-btn');

    if (!navigator.geolocation) {
      if (statusEl) {
        statusEl.textContent = 'この端末では位置情報を取得できません';
        statusEl.className = 'location-status location-status--error';
      }
      return;
    }

    // 取得中の表示
    if (statusEl) {
      statusEl.textContent = '位置情報を取得中...';
      statusEl.className = 'location-status location-status--loading';
    }
    if (btn) btn.disabled = true;

    navigator.geolocation.getCurrentPosition(function(pos) {
      if (latInput) latInput.value = pos.coords.latitude;
      if (lonInput) lonInput.value = pos.coords.longitude;
      // ユーザーが手動入力していない場合のみ自動反映
      if (locationInput && !locationInput.dataset.manualEdit) {
        locationInput.value =
          '緯度 ' + pos.coords.latitude.toFixed(4) + ' / 経度 ' + pos.coords.longitude.toFixed(4);
      }
      if (statusEl) {
        statusEl.textContent = '取得完了';
        statusEl.className = 'location-status';
      }
      if (btn) btn.disabled = false;
    }, function() {
      if (statusEl) {
        statusEl.textContent = '位置情報の取得に失敗しました';
        statusEl.className = 'location-status location-status--error';
      }
      if (btn) btn.disabled = false;
    });
  }

  /** 畑追加モーダルを表示 */
  function showAddFarmModal() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'farm-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '畑を追加');
    overlay.innerHTML =
      '<div class="modal">' +
        '<div class="modal-title">畑を追加 <button class="modal-close" id="close-farm-modal" aria-label="閉じる">&times;</button></div>' +
        '<form id="farm-form">' +
          '<div class="form-group">' +
            '<label class="form-label" for="farm-name">畑の名前</label>' +
            '<input class="form-input" type="text" id="farm-name" placeholder="例: 家の裏の畑" required aria-required="true">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label" for="farm-location">場所（住所 または 位置情報）</label>' +
            '<input class="form-input" type="text" id="farm-location" placeholder="例: 東京都世田谷区">' +
            '<div class="location-status location-status--loading" id="location-status">位置情報を取得中...</div>' +
            '<button type="button" class="btn btn-sm btn-secondary mt-8" id="get-location-btn">再取得</button>' +
          '</div>' +
          '<input type="hidden" id="farm-lat" value="">' +
          '<input type="hidden" id="farm-lon" value="">' +
          '<button type="submit" class="btn btn-primary btn-block mt-16">追加する</button>' +
        '</form>' +
      '</div>';

    document.body.appendChild(overlay);

    // モーダル閉じる
    document.getElementById('close-farm-modal').addEventListener('click', closeModal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

    // 手動入力フラグ: ユーザーが場所欄を編集したら自動上書きしない
    document.getElementById('farm-location').addEventListener('input', function() {
      this.dataset.manualEdit = 'true';
    });

    // 再取得ボタン: 手動入力フラグをリセットして再取得
    document.getElementById('get-location-btn').addEventListener('click', function() {
      var locationInput = document.getElementById('farm-location');
      if (locationInput) delete locationInput.dataset.manualEdit;
      fetchGeolocation();
    });

    // モーダル表示と同時に自動取得を開始
    fetchGeolocation();

    // モーダル内にフォーカスを移動
    var nameInput = document.getElementById('farm-name');
    if (nameInput) setTimeout(function() { nameInput.focus(); }, 100);

    // 送信（二重送信防止）
    App.guardSubmit(document.getElementById('farm-form'), function() {
      var name = document.getElementById('farm-name').value.trim();
      if (!name) {
        App.toast('畑の名前を入力してください。', 'warning');
        document.getElementById('farm-name').focus();
        return Promise.reject();
      }

      var data = {
        name: name,
        location: document.getElementById('farm-location').value.trim(),
        latitude: parseFloat(document.getElementById('farm-lat').value) || null,
        longitude: parseFloat(document.getElementById('farm-lon').value) || null
      };

      return TsuchiAPI.farm.create(data)
        .then(function() {
          App.toast('畑を追加しました！');
          closeModal();
          loadFarms();
        })
        .catch(function(err) {
          // プラン制限エラー（403）の場合はアップグレード導線を案内
          if (err.status === 403) {
            App.toast('畑の上限に達しました。設定画面からプランをアップグレードできます。', 'error');
            closeModal();
            window.location.hash = '#/settings';
          } else {
            App.toast(err.error || '畑の追加に失敗しました。通信状況を確認してください。', 'error');
          }
          throw err;
        });
    });
  }

  /** 作物追加モーダル */
  function showAddCropModal() {
    var options = '<option value="">品目を選択</option>';
    CROP_TYPES.forEach(function(t) {
      options += '<option value="' + t + '">' + t + '</option>';
    });

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'crop-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '作物を追加');
    overlay.innerHTML =
      '<div class="modal">' +
        '<div class="modal-title">作物を追加 <button class="modal-close" id="close-crop-modal" aria-label="閉じる">&times;</button></div>' +
        '<form id="crop-form">' +
          '<div class="form-group">' +
            '<label class="form-label" for="crop-type">品目</label>' +
            '<select class="form-input" id="crop-type" required aria-required="true">' + options + '</select>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label" for="crop-planted">植え付け日</label>' +
            '<input class="form-input" type="date" id="crop-planted" value="' + new Date().toISOString().slice(0, 10) + '">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label" for="crop-memo">メモ（任意）</label>' +
            '<textarea class="form-input" id="crop-memo" placeholder="品種名や種の情報など"></textarea>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary btn-block mt-16">追加する</button>' +
        '</form>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('close-crop-modal').addEventListener('click', closeModal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

    // モーダル内にフォーカスを移動
    var cropTypeInput = document.getElementById('crop-type');
    if (cropTypeInput) setTimeout(function() { cropTypeInput.focus(); }, 100);

    App.guardSubmit(document.getElementById('crop-form'), function() {
      var cropType = document.getElementById('crop-type').value;
      if (!cropType) {
        App.toast('品目を選択してください。', 'warning');
        document.getElementById('crop-type').focus();
        return Promise.reject();
      }

      var data = {
        name: cropType,
        planted_at: document.getElementById('crop-planted').value,
        memo: document.getElementById('crop-memo').value.trim()
      };

      return TsuchiAPI.crop.create(state.selectedFarm.id, data)
        .then(function() {
          App.toast(cropType + 'を追加しました！');
          closeModal();
          loadCrops(state.selectedFarm.id);
        })
        .catch(function(err) {
          // プラン制限エラー（403）の場合はアップグレード導線を案内
          if (err.status === 403) {
            App.toast('作物の上限に達しました。設定画面からプランをアップグレードできます。', 'error');
            closeModal();
            window.location.hash = '#/settings';
          } else {
            App.toast(err.error || '作物の追加に失敗しました。通信状況を確認してください。', 'error');
          }
          throw err;
        });
    });
  }

  /** モーダルを閉じる */
  function closeModal() {
    var m = document.querySelector('.modal-overlay');
    if (m) m.remove();
  }

  /** 畑一覧を読み込む */
  function loadFarms() {
    TsuchiAPI.farm.list()
      .then(function(res) {
        state.farms = res.data || [];
        App.renderCurrentPage();
      })
      .catch(function() {});
  }

  /** 作物一覧を読み込む */
  function loadCrops(farmId) {
    TsuchiAPI.crop.list(farmId)
      .then(function(res) {
        state.crops = res.data || [];
        App.renderCurrentPage();
      })
      .catch(function() {});
  }

  /** イベントバインド */
  function bind() {
    // 畑追加ボタン
    var addBtn = document.getElementById('add-farm-btn');
    var addBtn2 = document.getElementById('add-farm-btn2');
    if (addBtn) addBtn.addEventListener('click', showAddFarmModal);
    if (addBtn2) addBtn2.addEventListener('click', showAddFarmModal);

    // 畑カードクリック → 詳細表示（キーボード対応）
    var farmCards = document.querySelectorAll('.farm-card');
    farmCards.forEach(function(card) {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', card.querySelector('.farm-card-name').textContent + 'の詳細を見る');

      function openFarmDetail(el) {
        var farmId = el.dataset.farmId;
        state.selectedFarm = state.farms.find(function(f) { return f.id == farmId; });
        state.view = 'detail';
        state.crops = [];
        App.renderCurrentPage();
        loadCrops(farmId);
      }

      card.addEventListener('click', function() { openFarmDetail(this); });
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openFarmDetail(this);
        }
      });
    });

    // 戻るボタン
    var backBtn = document.getElementById('back-to-list');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        state.view = 'list';
        state.selectedFarm = null;
        App.renderCurrentPage();
      });
    }

    // 作物追加ボタン
    var addCropBtn = document.getElementById('add-crop-btn');
    var addCropBtn2 = document.getElementById('add-crop-btn2');
    if (addCropBtn) addCropBtn.addEventListener('click', showAddCropModal);
    if (addCropBtn2) addCropBtn2.addEventListener('click', showAddCropModal);

    // 畑削除ボタン（ボタンフィードバック + 二重送信防止）
    var deleteBtn = document.getElementById('delete-farm-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function() {
        if (!confirm(state.selectedFarm.name + 'を削除しますか？\n栽培中の作物もすべて削除されます。')) return;
        var restore = App.btnLoading(deleteBtn, '畑を削除中...');
        TsuchiAPI.farm.remove(state.selectedFarm.id)
          .then(function() {
            restore(true);
            App.toast('畑を削除しました。');
            state.view = 'list';
            state.selectedFarm = null;
            loadFarms();
          })
          .catch(function(err) {
            restore(false);
            App.toast(err.error || '削除に失敗しました。通信状況を確認してください。', 'error');
          });
      });
    }
  }

  /** ページ初期化 */
  function init() {
    state.view = 'list';
    state.selectedFarm = null;
    loadFarms();
  }

  return {
    render: render,
    bind: bind,
    init: init
  };
})();
