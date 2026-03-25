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

  // 生育ステージ名
  var STAGE_NAMES = ['準備中', '発芽', '生長期', '開花', '結実', '収穫期'];

  // 状態
  var state = {
    farms: [],
    selectedFarm: null,  // 詳細表示中の畑
    crops: [],
    view: 'list'         // 'list' | 'detail'
  };

  /** 畑一覧のHTML */
  function renderFarmList() {
    var html = '<div class="page-title">&#127806; 畑の管理' +
      '<button class="btn btn-sm btn-primary" id="add-farm-btn">+ 畑を追加</button></div>';

    if (state.farms.length === 0) {
      html += '<div class="empty-state">' +
        '<div class="empty-state-icon">&#127793;</div>' +
        '<div class="empty-state-text">まだ畑が登録されていません</div>' +
        '<button class="btn btn-primary" id="add-farm-btn2">最初の畑を登録する</button></div>';
    } else {
      state.farms.forEach(function(farm) {
        var cropCount = farm.crop_count || 0;
        html += '<div class="farm-card" data-farm-id="' + farm.id + '">' +
          '<div class="farm-card-icon">&#127807;</div>' +
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
        '<div class="empty-state-icon">&#127793;</div>' +
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

  /** 畑追加モーダルを表示 */
  function showAddFarmModal() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'farm-modal';
    overlay.innerHTML =
      '<div class="modal">' +
        '<div class="modal-title">畑を追加 <button class="modal-close" id="close-farm-modal">&times;</button></div>' +
        '<form id="farm-form">' +
          '<div class="form-group">' +
            '<label class="form-label">畑の名前</label>' +
            '<input class="form-input" type="text" id="farm-name" placeholder="例: 家の裏の畑" required>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">場所（住所 または 位置情報）</label>' +
            '<input class="form-input" type="text" id="farm-location" placeholder="例: 東京都世田谷区">' +
            '<button type="button" class="btn btn-sm btn-secondary mt-8" id="get-location-btn">&#128205; 現在地を取得</button>' +
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

    // 位置情報取得
    document.getElementById('get-location-btn').addEventListener('click', function() {
      if (!navigator.geolocation) {
        App.toast('この端末では位置情報を取得できません。', 'warning');
        return;
      }
      this.textContent = '取得中...';
      var self = this;
      navigator.geolocation.getCurrentPosition(function(pos) {
        document.getElementById('farm-lat').value = pos.coords.latitude;
        document.getElementById('farm-lon').value = pos.coords.longitude;
        document.getElementById('farm-location').value =
          '緯度 ' + pos.coords.latitude.toFixed(4) + ' / 経度 ' + pos.coords.longitude.toFixed(4);
        self.textContent = '\u2705 取得完了';
      }, function() {
        App.toast('位置情報の取得に失敗しました。', 'error');
        self.textContent = '\uD83D\uDCCD 現在地を取得';
      });
    });

    // 送信
    document.getElementById('farm-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var name = document.getElementById('farm-name').value.trim();
      if (!name) return;

      var data = {
        name: name,
        location: document.getElementById('farm-location').value.trim(),
        latitude: parseFloat(document.getElementById('farm-lat').value) || null,
        longitude: parseFloat(document.getElementById('farm-lon').value) || null
      };

      TsuchiAPI.farm.create(data)
        .then(function() {
          App.toast('畑を追加しました！');
          closeModal();
          loadFarms();
        })
        .catch(function(err) {
          App.toast(err.error || '追加に失敗しました。', 'error');
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
    overlay.innerHTML =
      '<div class="modal">' +
        '<div class="modal-title">作物を追加 <button class="modal-close" id="close-crop-modal">&times;</button></div>' +
        '<form id="crop-form">' +
          '<div class="form-group">' +
            '<label class="form-label">品目</label>' +
            '<select class="form-input" id="crop-type" required>' + options + '</select>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">植え付け日</label>' +
            '<input class="form-input" type="date" id="crop-planted" value="' + new Date().toISOString().slice(0, 10) + '">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">メモ（任意）</label>' +
            '<textarea class="form-input" id="crop-memo" placeholder="品種名や種の情報など"></textarea>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary btn-block mt-16">追加する</button>' +
        '</form>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('close-crop-modal').addEventListener('click', closeModal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

    document.getElementById('crop-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var cropType = document.getElementById('crop-type').value;
      if (!cropType) { App.toast('品目を選択してください。', 'warning'); return; }

      var data = {
        name: cropType,
        planted_at: document.getElementById('crop-planted').value,
        memo: document.getElementById('crop-memo').value.trim()
      };

      TsuchiAPI.crop.create(state.selectedFarm.id, data)
        .then(function() {
          App.toast(cropType + 'を追加しました！');
          closeModal();
          loadCrops(state.selectedFarm.id);
        })
        .catch(function(err) {
          App.toast(err.error || '追加に失敗しました。', 'error');
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

    // 畑カードクリック → 詳細表示
    var farmCards = document.querySelectorAll('.farm-card');
    farmCards.forEach(function(card) {
      card.addEventListener('click', function() {
        var farmId = this.dataset.farmId;
        state.selectedFarm = state.farms.find(function(f) { return f.id == farmId; });
        state.view = 'detail';
        state.crops = [];
        App.renderCurrentPage();
        loadCrops(farmId);
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

    // 畑削除ボタン
    var deleteBtn = document.getElementById('delete-farm-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function() {
        if (!confirm(state.selectedFarm.name + 'を削除しますか？\n栽培中の作物もすべて削除されます。')) return;
        TsuchiAPI.farm.remove(state.selectedFarm.id)
          .then(function() {
            App.toast('畑を削除しました。');
            state.view = 'list';
            state.selectedFarm = null;
            loadFarms();
          })
          .catch(function(err) {
            App.toast(err.error || '削除に失敗しました。', 'error');
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
