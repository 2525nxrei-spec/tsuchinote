// ============================================
// ツチノート — ダッシュボード（ホーム画面）
// 天気サマリー + 今日の提案 + 5日間予報
// ============================================

var HomePage = (function() {
  'use strict';

  // 天気アイコンマッピング
  var WEATHER_ICONS = {
    sunny: '\u2600\uFE0F', clear: '\u2600\uFE0F',
    cloudy: '\u2601\uFE0F', partly_cloudy: '\u26C5',
    rainy: '\uD83C\uDF27\uFE0F', rain: '\uD83C\uDF27\uFE0F',
    heavy_rain: '\u26C8\uFE0F', thunderstorm: '\u26C8\uFE0F',
    snowy: '\uD83C\uDF28\uFE0F', snow: '\uD83C\uDF28\uFE0F',
    foggy: '\uD83C\uDF2B\uFE0F', fog: '\uD83C\uDF2B\uFE0F',
    windy: '\uD83C\uDF2C\uFE0F'
  };

  // モックデータ（API未接続時用）— バックエンドのレスポンス形式に統一
  var MOCK_WEATHER = {
    location: '東京都',
    current: { temp: 22, temp_min: 14, temp_max: 24, humidity: 55, weather: '晴れ', icon: 'sunny', wind_speed: 3.2 },
    forecast: [
      { date: '明日', temp_min: 13, temp_max: 20, weather: '曇り', icon: 'cloudy', precipitation: 10 },
      { date: '明後日', temp_min: 12, temp_max: 18, weather: '曇り', icon: 'cloudy', precipitation: 20 },
      { date: '3日後', temp_min: 10, temp_max: 16, weather: '雨', icon: 'rainy', precipitation: 70 },
      { date: '4日後', temp_min: 11, temp_max: 19, weather: '曇り', icon: 'cloudy', precipitation: 15 },
      { date: '5日後', temp_min: 13, temp_max: 21, weather: '晴れ', icon: 'sunny', precipitation: 5 }
    ],
    alerts: []
  };

  var MOCK_SUGGESTIONS = [
    { priority: 'high', icon: '\uD83D\uDCA7', title: 'トマトの水やり（朝のうちに）', description: '晴れて乾燥するため、朝の涼しいうちに根元にたっぷり。', crop: 'トマト' },
    { priority: 'medium', icon: '\uD83C\uDF31', title: 'キュウリの支柱チェック', description: '風が出る予報。つるが外れていないか確認。', crop: 'キュウリ' },
    { priority: 'medium', icon: '\u2702\uFE0F', title: 'ナスの追肥', description: '植え付けから2週間。1回目の追肥タイミングです。', crop: 'ナス' },
    { priority: 'low', icon: '\uD83D\uDCDD', title: '雑草取り（畝の周り）', description: '晴れの日は草取り日和。根ごと抜きましょう。', crop: null }
  ];

  var MOCK_FARMS = [
    { id: 'mock1', name: '家の裏の畑' }
  ];

  // 状態
  var state = {
    farms: [],
    selectedFarmId: null,
    weather: null,
    suggestions: [],
    completedIds: []
  };

  /** 今日の日付を「M月D日（曜日）」形式で返す */
  function formatToday() {
    var now = new Date();
    var days = ['日', '月', '火', '水', '木', '金', '土'];
    return (now.getMonth() + 1) + '月' + now.getDate() + '日（' + days[now.getDay()] + '）';
  }

  /** ユーザー名を取得 */
  function getUserName() {
    try {
      var user = JSON.parse(localStorage.getItem('tsuchi_user'));
      return user ? user.name : 'ゲスト';
    } catch(e) {
      return 'ゲスト';
    }
  }

  /** 天気アイコンを取得 */
  function getWeatherIcon(condition) {
    return WEATHER_ICONS[condition] || '\u2600\uFE0F';
  }

  /** 画面HTML生成 */
  function render() {
    var w = state.weather || MOCK_WEATHER;
    var c = w.current || MOCK_WEATHER.current;
    var suggestions = state.suggestions.length > 0 ? state.suggestions : MOCK_SUGGESTIONS;
    var farms = state.farms.length > 0 ? state.farms : MOCK_FARMS;

    // 畑セレクター
    var farmOptions = '';
    farms.forEach(function(f) {
      var selected = f.id === state.selectedFarmId ? ' selected' : '';
      farmOptions += '<option value="' + f.id + '"' + selected + '>' + escapeHtml(f.name) + '</option>';
    });

    // 5日間予報（バックエンドのforecast形式: date, temp_min, temp_max, weather, icon）
    var forecastHtml = '';
    if (w.forecast) {
      w.forecast.forEach(function(d) {
        var dayLabel = d.date || '';
        // YYYY-MM-DD形式ならM/D表示に変換
        if (dayLabel.match(/^\d{4}-\d{2}-\d{2}$/)) {
          var parts = dayLabel.split('-');
          dayLabel = parseInt(parts[1]) + '/' + parseInt(parts[2]);
        }
        forecastHtml +=
          '<div class="forecast-day">' +
            '<div class="forecast-day-name">' + dayLabel + '</div>' +
            '<div class="forecast-day-icon">' + getWeatherIcon(d.icon) + '</div>' +
            '<div class="forecast-day-temp">' + d.temp_max + '/' + d.temp_min + '\u00B0</div>' +
          '</div>';
      });
    }

    // 天気アラート
    var alertHtml = '';
    if (w.alerts && w.alerts.length > 0) {
      w.alerts.forEach(function(a) {
        var msg = (typeof a === 'string') ? a : (a.message || '');
        alertHtml += '<div class="alert-banner">\u26A0\uFE0F ' + escapeHtml(msg) + '</div>';
      });
    }

    // 提案リスト（バックエンドのitems形式: priority, icon, title, description, crop）
    var suggestHtml = '';
    suggestions.forEach(function(s, idx) {
      var checked = state.completedIds.indexOf(idx) !== -1;
      suggestHtml +=
        '<div class="suggestion-item">' +
          '<div class="suggestion-check' + (checked ? ' checked' : '') + '" data-id="' + idx + '"></div>' +
          '<div class="suggestion-text' + (checked ? ' completed' : '') + '">' +
            '<div class="suggestion-title">' + (s.icon || '') + ' ' + escapeHtml(s.title) + '</div>' +
            '<div class="suggestion-desc">' + escapeHtml(s.description || s.desc || '') + '</div>' +
          '</div>' +
        '</div>';
    });

    return '' +
      '<div class="page">' +
        '<!-- ヘッダー -->' +
        '<div class="home-header">' +
          '<div>' +
            '<div class="home-greeting">' + escapeHtml(getUserName()) + 'さんの畑</div>' +
            '<div class="home-date">' + formatToday() + '</div>' +
          '</div>' +
        '</div>' +
        '<!-- 畑セレクター -->' +
        (farms.length > 1 ?
          '<div class="farm-selector">' +
            '<select class="form-input" id="farm-select">' + farmOptions + '</select>' +
          '</div>' : '') +
        '<!-- 天気カード -->' +
        '<div class="weather-card">' +
          '<div class="weather-main">' +
            '<div class="weather-icon">' + getWeatherIcon(c.icon) + '</div>' +
            '<div>' +
              '<div class="weather-temp">' + c.temp + '\u00B0</div>' +
              '<div class="weather-temp-sub">' + (c.weather || '') + ' / ' + c.temp_min + '〜' + c.temp_max + '\u00B0</div>' +
            '</div>' +
          '</div>' +
          '<div class="weather-detail">' +
            '<div class="weather-detail-item">\uD83D\uDCA7 降水 ' + (w.forecast && w.forecast[0] ? w.forecast[0].precipitation : 0) + '%</div>' +
            '<div class="weather-detail-item">\uD83D\uDCA8 風速 ' + (c.wind_speed || 0) + 'm/s</div>' +
            '<div class="weather-detail-item">\uD83C\uDF21\uFE0F 湿度 ' + (c.humidity || '') + '%</div>' +
          '</div>' +
        '</div>' +
        '<!-- アラート -->' +
        alertHtml +
        '<!-- 5日間予報 -->' +
        '<div class="forecast-row">' + forecastHtml + '</div>' +
        '<!-- 今日の提案 -->' +
        '<div class="card">' +
          '<div class="card-header">\uD83C\uDF31 今日やること</div>' +
          '<div class="suggestion-list" id="suggestion-list">' + suggestHtml + '</div>' +
        '</div>' +
        '<!-- 作業記録ボタン -->' +
        '<a href="#/record" class="btn btn-primary btn-block mt-16">' +
          '\u270D\uFE0F 作業を記録する' +
        '</a>' +
      '</div>';
  }

  /** イベントバインド */
  function bind() {
    // 畑セレクター変更
    var farmSelect = document.getElementById('farm-select');
    if (farmSelect) {
      farmSelect.addEventListener('change', function() {
        state.selectedFarmId = this.value;
        loadData();
      });
    }

    // 提案チェック
    var checks = document.querySelectorAll('.suggestion-check');
    checks.forEach(function(el) {
      el.addEventListener('click', function() {
        var id = parseInt(this.dataset.id);
        var idx = state.completedIds.indexOf(id);
        if (idx === -1) {
          state.completedIds.push(id);
          this.classList.add('checked');
          this.nextElementSibling.classList.add('completed');
        } else {
          state.completedIds.splice(idx, 1);
          this.classList.remove('checked');
          this.nextElementSibling.classList.remove('completed');
        }
      });
    });
  }

  /** APIからデータ読み込み */
  function loadData() {
    // 畑一覧取得
    TsuchiAPI.farm.list()
      .then(function(res) {
        state.farms = res.data || [];
        if (state.farms.length > 0 && !state.selectedFarmId) {
          state.selectedFarmId = state.farms[0].id;
        }
        if (state.selectedFarmId) {
          // 天気と提案を並列取得
          return Promise.all([
            TsuchiAPI.weather.getForecast(state.selectedFarmId).catch(function() { return null; }),
            TsuchiAPI.suggestion.getToday(state.selectedFarmId).catch(function() { return null; })
          ]);
        }
        return [null, null];
      })
      .then(function(results) {
        if (results[0] && results[0].data) state.weather = results[0].data;
        // 提案はdata.items配列を使う
        if (results[1] && results[1].data) {
          state.suggestions = results[1].data.items || results[1].data;
        }
        // 再描画
        App.renderCurrentPage();
      })
      .catch(function() {
        // モックデータで表示（既にレンダリング済み）
      });
  }

  /** ページ初期化 */
  function init() {
    state.completedIds = [];
    loadData();
  }

  return {
    render: render,
    bind: bind,
    init: init
  };
})();
