-- マイグレーション: suggestionsテーブルのUNIQUE制約を削除
-- プランごとに1日複数回のAI提案を許可するため
-- free=1日1回, light=1日3回, pro=無制限
--
-- D1はALTER TABLE DROP CONSTRAINTをサポートしないため、
-- テーブルを再作成する必要がある

-- 1. 一時テーブルにデータを退避
CREATE TABLE IF NOT EXISTS suggestions_backup AS SELECT * FROM suggestions;

-- 2. 旧テーブルを削除
DROP TABLE IF EXISTS suggestions;

-- 3. UNIQUE制約なしで再作成
CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  farm_id TEXT NOT NULL,
  date TEXT NOT NULL,
  items TEXT NOT NULL,
  weather_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
);

-- 4. データを復元
INSERT INTO suggestions SELECT * FROM suggestions_backup;

-- 5. 一時テーブルを削除
DROP TABLE IF EXISTS suggestions_backup;

-- 6. インデックスを再作成
CREATE INDEX IF NOT EXISTS idx_suggestions_user_date ON suggestions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_suggestions_farm_date ON suggestions(farm_id, date);
