BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='10s';
ALTER TABLE sorteo_web.batch ADD COLUMN IF NOT EXISTS source_check jsonb;
CREATE TABLE IF NOT EXISTS sorteo_web.transfer (
 draw_id integer PRIMARY KEY REFERENCES sorteo_web.draw_history(id),
 status text NOT NULL CHECK(status IN('PENDING','APPLIED')),
 attempts integer NOT NULL DEFAULT 0,last_error text,receipt jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
