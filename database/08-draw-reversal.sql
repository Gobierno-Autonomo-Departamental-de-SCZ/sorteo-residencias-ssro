BEGIN;
SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='5s';
ALTER TABLE sorteo_web.draw_history ADD COLUMN IF NOT EXISTS annulled_at timestamptz;
ALTER TABLE sorteo_web.draw_history ADD COLUMN IF NOT EXISTS annulment_reason text;
CREATE TABLE IF NOT EXISTS sorteo_web.draw_reversal (
 draw_id integer PRIMARY KEY REFERENCES sorteo_web.draw_history(id),
 state text NOT NULL CHECK(state IN ('PREPARED','DESTINATION_REVERTED','COMPLETE')),
 actor text NOT NULL,reason text NOT NULL,backup_path text NOT NULL,
 before_state jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
