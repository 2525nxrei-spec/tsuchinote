-- ユーザーテーブルに cancel_at_period_end カラム追加
ALTER TABLE users ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;

-- Webhook冪等性チェック用テーブル作成
CREATE TABLE IF NOT EXISTS webhooks_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT NOT NULL UNIQUE,
  payload TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- webhooks_log 検索用インデックス
CREATE INDEX IF NOT EXISTS idx_webhooks_log_stripe_event ON webhooks_log(stripe_event_id);
