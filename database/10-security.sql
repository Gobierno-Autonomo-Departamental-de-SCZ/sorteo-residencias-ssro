-- Run through scripts/migrate-security.cjs so existing snapshots are encrypted
-- in the same transaction as these schema changes.
CREATE TABLE IF NOT EXISTS sorteo_web.admin_session (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 admin_id integer NOT NULL REFERENCES sorteo_web.admin_users(id) ON DELETE CASCADE,
 password_hash_at_creation text NOT NULL,
 payload_encrypted text NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_session_expires_idx ON sorteo_web.admin_session(expires_at);
ALTER TABLE sorteo_web.shared_result ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE sorteo_web.shared_result
 SET expires_at=LEAST(coalesce(to_timestamp((simulation_snapshot->>'expires')::double precision/1000),created_at+interval '1 hour'),created_at+interval '1 hour')
 WHERE kind='SIMULATION' AND expires_at IS NULL;
DELETE FROM sorteo_web.shared_result WHERE kind='SIMULATION' AND (expires_at<=now() OR token IN (
 SELECT token FROM sorteo_web.shared_result WHERE kind='SIMULATION' ORDER BY created_at DESC,token DESC OFFSET 50));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='sorteo_web.shared_result'::regclass AND conname='shared_result_expiry_check') THEN
  ALTER TABLE sorteo_web.shared_result ADD CONSTRAINT shared_result_expiry_check
   CHECK((kind='OFFICIAL' AND expires_at IS NULL) OR (kind='SIMULATION' AND expires_at IS NOT NULL));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS shared_result_expires_idx ON sorteo_web.shared_result(expires_at) WHERE kind='SIMULATION';
