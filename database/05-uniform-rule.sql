BEGIN;
SELECT pg_advisory_xact_lock(hashtext('sorteo_residencias'));
ALTER TABLE sorteo_web.batch ALTER COLUMN rule SET DEFAULT 'uniform';
UPDATE sorteo_web.batch SET rule='uniform',status='PREPARACION',
 confirmed_hash=NULL,confirmed_by=NULL,confirmed_at=NULL
WHERE rule IS DISTINCT FROM 'uniform' AND status <> 'SORTEADO'
 AND NOT EXISTS (SELECT 1 FROM sorteo_web.draw_history WHERE batch_id=batch.id);
COMMIT;
