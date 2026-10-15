CREATE TABLE IF NOT EXISTS sorteo_web.batch (
 id integer PRIMARY KEY CHECK(id=1),
 period_id integer NOT NULL REFERENCES public.periodo,
 sedes_id integer NOT NULL REFERENCES public.sedes,
 career_id integer NOT NULL REFERENCES public.tipo_carrera,
 source text NOT NULL, source_hash text NOT NULL, imported_at timestamptz NOT NULL,
 source_extracted_at timestamptz NOT NULL,
 rule text CHECK(rule IN ('uniform','weighted')),
 confirmed_hash text, confirmed_by text, confirmed_at timestamptz,
 status text NOT NULL DEFAULT 'PREPARACION' CHECK(status IN ('PREPARACION','CONFIRMADO','SORTEADO')),
 row_counts jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS sorteo_web.roster_decision (
 batch_id integer NOT NULL REFERENCES sorteo_web.batch,
 group_key text NOT NULL, group_hash text NOT NULL,
 keep_ids jsonb NOT NULL, reason text NOT NULL,
 actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(batch_id,group_key)
);
CREATE TABLE IF NOT EXISTS sorteo_web.audit_event (
 id bigserial PRIMARY KEY, batch_id integer NOT NULL REFERENCES sorteo_web.batch,
 action text NOT NULL, actor text NOT NULL, detail jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sorteo_web.draw_history ADD COLUMN IF NOT EXISTS batch_id integer UNIQUE REFERENCES sorteo_web.batch;
ALTER TABLE sorteo_web.draw_history ADD COLUMN IF NOT EXISTS snapshot jsonb;
ALTER TABLE sorteo_web.draw_history ADD COLUMN IF NOT EXISTS input_snapshot jsonb;
ALTER TABLE sorteo_web.draw_history ADD COLUMN IF NOT EXISTS input_hash text;
ALTER TABLE sorteo_web.draw_history ADD COLUMN IF NOT EXISTS seed_encrypted text;
ALTER TABLE sorteo_web.draw_history ADD COLUMN IF NOT EXISTS algorithm text;
ALTER TABLE sorteo_web.draw_history ADD COLUMN IF NOT EXISTS actor text;
