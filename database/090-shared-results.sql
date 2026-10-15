BEGIN;
CREATE TABLE IF NOT EXISTS sorteo_web.shared_result (
 token text PRIMARY KEY CHECK (token ~ '^[0-9a-f]{64}$'),
 kind text NOT NULL CHECK (kind IN ('SIMULATION','OFFICIAL')),
 draw_id integer UNIQUE REFERENCES sorteo_web.draw_history(id),
 simulation_id uuid UNIQUE,
 simulation_snapshot jsonb,
 executed_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by text NOT NULL,
 CHECK ((kind='OFFICIAL' AND draw_id IS NOT NULL AND simulation_id IS NULL AND simulation_snapshot IS NULL)
 OR (kind='SIMULATION' AND draw_id IS NULL AND simulation_id IS NOT NULL AND simulation_snapshot IS NOT NULL))
);
COMMIT;
