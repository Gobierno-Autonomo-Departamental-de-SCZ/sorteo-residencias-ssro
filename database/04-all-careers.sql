ALTER TABLE sorteo_web.batch ALTER COLUMN career_id DROP NOT NULL;
ALTER TABLE sorteo_web.batch ADD COLUMN IF NOT EXISTS career_ids integer[];
UPDATE sorteo_web.batch SET career_ids=ARRAY[career_id] WHERE career_ids IS NULL;
