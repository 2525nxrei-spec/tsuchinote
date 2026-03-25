-- ツチノート D1データベーススキーマ
-- すべてのIDはULID形式（TEXT型）

-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                          -- ULID
  email TEXT NOT NULL UNIQUE,                   -- メールアドレス
  password_hash TEXT NOT NULL,                  -- SHA-256+saltハッシュ
  salt TEXT NOT NULL,                           -- パスワードハッシュ用ソルト
  name TEXT NOT NULL,                           -- 表示名
  plan TEXT NOT NULL DEFAULT 'free'             -- プラン: free / light / pro
    CHECK (plan IN ('free', 'light', 'pro')),
  stripe_customer_id TEXT,                      -- Stripe顧客ID
  stripe_subscription_id TEXT,                  -- Stripeサブスク契約ID
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 畑テーブル
CREATE TABLE IF NOT EXISTS farms (
  id TEXT PRIMARY KEY,                          -- ULID
  user_id TEXT NOT NULL,                        -- 所有ユーザー
  name TEXT NOT NULL,                           -- 畑の名前（例: 庭の畑、貸し農園A）
  latitude REAL,                                -- 緯度（天気取得用）
  longitude REAL,                               -- 経度（天気取得用）
  address TEXT,                                 -- 住所（表示用）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 作付けテーブル（ユーザーが育てている作物）
CREATE TABLE IF NOT EXISTS crops (
  id TEXT PRIMARY KEY,                          -- ULID
  farm_id TEXT NOT NULL,                        -- 所属する畑
  user_id TEXT NOT NULL,                        -- 所有ユーザー
  crop_type TEXT,                                -- 品目コード（crop_master.id参照、NULLあり）
  name TEXT NOT NULL,                           -- 表示名（例: トマト第1弾）
  planted_at TEXT,                              -- 植え付け日（ISO8601）
  status TEXT NOT NULL DEFAULT 'planning'       -- 状態
    CHECK (status IN ('planning', 'growing', 'harvesting', 'done')),
  notes TEXT,                                   -- メモ
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 作物マスタテーブル（品目ごとの栽培基本情報）
CREATE TABLE IF NOT EXISTS crop_master (
  id TEXT PRIMARY KEY,                          -- 品目コード（例: tomato）
  name TEXT NOT NULL,                           -- 日本語名
  category TEXT NOT NULL                        -- 分類
    CHECK (category IN ('果菜類', '葉菜類', '根菜類', '豆類', '穀物類', 'ハーブ類')),
  growing_days INTEGER NOT NULL,                -- 種まき〜収穫の標準日数
  min_temp REAL NOT NULL,                       -- 生育最低温度（℃）
  max_temp REAL NOT NULL,                       -- 生育最高温度（℃）
  frost_sensitive INTEGER NOT NULL DEFAULT 1,   -- 霜に弱い: 1=はい, 0=いいえ
  water_needs TEXT NOT NULL DEFAULT 'medium'    -- 水やり頻度
    CHECK (water_needs IN ('low', 'medium', 'high')),
  stages TEXT NOT NULL,                         -- 生育ステージJSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 天気キャッシュテーブル（APIコール節約用）
CREATE TABLE IF NOT EXISTS weather_cache (
  id TEXT PRIMARY KEY,                          -- ULID
  lat_lon_key TEXT NOT NULL,                    -- "lat,lon" 形式のキー
  date TEXT NOT NULL,                           -- 対象日（YYYY-MM-DD）
  data TEXT NOT NULL,                           -- OpenWeatherMapレスポンスJSON
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (lat_lon_key, date)                    -- 同一地点・日付の重複防止
);

-- 提案テーブル（毎朝生成される「今日やること」）
CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,                          -- ULID
  user_id TEXT NOT NULL,
  farm_id TEXT NOT NULL,
  date TEXT NOT NULL,                           -- 提案対象日（YYYY-MM-DD）
  items TEXT NOT NULL,                          -- 提案内容JSON配列
  weather_summary TEXT,                         -- 天気要約（例: 晴れ 最高28℃/最低18℃）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE,
  UNIQUE (user_id, farm_id, date)              -- 1日1畑1提案
);

-- 作業ログテーブル（実際にやった作業記録）
CREATE TABLE IF NOT EXISTS work_logs (
  id TEXT PRIMARY KEY,                          -- ULID
  user_id TEXT NOT NULL,
  farm_id TEXT NOT NULL,
  crop_id TEXT,                                 -- 関連作物（NULLあり＝畑全体の作業）
  date TEXT NOT NULL,                           -- 作業日（YYYY-MM-DD）
  content TEXT NOT NULL,                        -- 作業内容
  completed INTEGER NOT NULL DEFAULT 0          -- 完了フラグ: 0=未完了, 1=完了
    CHECK (completed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE,
  FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE SET NULL
);

-- インデックス（頻出クエリ高速化）
CREATE INDEX IF NOT EXISTS idx_farms_user_id ON farms(user_id);
CREATE INDEX IF NOT EXISTS idx_crops_farm_id ON crops(farm_id);
CREATE INDEX IF NOT EXISTS idx_crops_user_id ON crops(user_id);
CREATE INDEX IF NOT EXISTS idx_crops_status ON crops(status);
CREATE INDEX IF NOT EXISTS idx_weather_cache_key_date ON weather_cache(lat_lon_key, date);
CREATE INDEX IF NOT EXISTS idx_suggestions_user_date ON suggestions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_work_logs_user_date ON work_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_work_logs_farm_date ON work_logs(farm_id, date);
