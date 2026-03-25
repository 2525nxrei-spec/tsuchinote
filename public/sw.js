// ツチノート Service Worker
// キャッシュバージョン（更新時にインクリメント）
var CACHE_VERSION = 'tsuchinote-v3';

// 静的アセット（キャッシュファースト）
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/api.js',
  '/js/pages/login.js',
  '/js/pages/home.js',
  '/js/pages/farm.js',
  '/js/pages/record.js',
  '/js/pages/settings.js',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

// API パスの判定
function isApiRequest(url) {
  return url.pathname.startsWith('/api');
}

// インストール時: 静的アセットをキャッシュ
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// アクティベート時: 古いキャッシュを削除
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_VERSION;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// フェッチ時: リクエスト種別に応じたストラテジー
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // API呼び出し → ネットワークファースト（失敗時はキャッシュ）
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        // 成功レスポンスをキャッシュに保存（提案データ等のオフライン用）
        if (response.ok) {
          var responseClone = response.clone();
          caches.open(CACHE_VERSION).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(function() {
        // オフライン時: キャッシュから返す
        return caches.match(event.request).then(function(cached) {
          if (cached) return cached;
          // キャッシュもない場合はオフラインレスポンス
          return new Response(
            JSON.stringify({ ok: false, error: 'オフラインです。電波の届く場所で再度お試しください。' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        });
      })
    );
    return;
  }

  // 静的アセット → キャッシュファースト（なければネットワーク）
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        // 取得できたらキャッシュに追加
        if (response.ok) {
          var responseClone = response.clone();
          caches.open(CACHE_VERSION).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    }).catch(function() {
      // HTML要求でオフラインの場合はトップページを返す
      if (event.request.headers.get('accept').indexOf('text/html') !== -1) {
        return caches.match('/index.html');
      }
    })
  );
});
