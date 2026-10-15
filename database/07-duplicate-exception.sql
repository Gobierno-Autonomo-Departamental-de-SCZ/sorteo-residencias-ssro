BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='5s';
ALTER TABLE sorteo_web.batch ADD COLUMN IF NOT EXISTS duplicate_exception jsonb;
COMMIT;
