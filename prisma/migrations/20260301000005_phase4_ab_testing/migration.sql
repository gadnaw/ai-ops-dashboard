-- =============================================================================
-- Phase 4: A/B Testing — experiments, experiment_variants, variant_metrics, sprt_history
-- =============================================================================

-- 1. experiments table
CREATE TABLE experiments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'draft',
  hypothesis       TEXT,
  primary_metric   TEXT NOT NULL DEFAULT 'error_rate',
  mde              DOUBLE PRECISION NOT NULL,
  mde_unit         TEXT NOT NULL DEFAULT 'absolute',
  alpha            DOUBLE PRECISION NOT NULL DEFAULT 0.05,
  beta             DOUBLE PRECISION NOT NULL DEFAULT 0.20,
  max_samples      INTEGER NOT NULL DEFAULT 5000,
  min_samples      INTEGER NOT NULL DEFAULT 200,
  started_at       TIMESTAMPTZ,
  stopped_at       TIMESTAMPTZ,
  winner_variant_id UUID,
  created_by       UUID NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX experiments_status_started_at_idx ON experiments (status, started_at);

-- 2. experiment_variants table
CREATE TABLE experiment_variants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id    UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  prompt_version_id UUID,
  model_override   TEXT,
  traffic_weight   DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  is_control       BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX experiment_variants_experiment_id_idx ON experiment_variants (experiment_id);

-- 3. variant_metrics table (one row per variant — accumulator pattern H8)
CREATE TABLE variant_metrics (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id     UUID NOT NULL UNIQUE REFERENCES experiment_variants(id) ON DELETE CASCADE,
  experiment_id  UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  request_count  INTEGER NOT NULL DEFAULT 0,
  error_count    INTEGER NOT NULL DEFAULT 0,
  latency_n      INTEGER NOT NULL DEFAULT 0,
  latency_sum    DOUBLE PRECISION NOT NULL DEFAULT 0,
  latency_sum_sq DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_n         INTEGER NOT NULL DEFAULT 0,
  cost_sum       DOUBLE PRECISION NOT NULL DEFAULT 0,
  eval_n         INTEGER,
  eval_score_sum DOUBLE PRECISION,
  sprt_llr       DOUBLE PRECISION NOT NULL DEFAULT 0,
  sprt_decision  TEXT,
  sprt_checked_at TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX variant_metrics_experiment_id_idx ON variant_metrics (experiment_id);

-- 4. sprt_history table — snapshots every ~10 observations for chart
CREATE TABLE sprt_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id  UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  sample_count   INTEGER NOT NULL,
  llr            DOUBLE PRECISION NOT NULL,
  upper_boundary DOUBLE PRECISION NOT NULL,
  lower_boundary DOUBLE PRECISION NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sprt_history_experiment_id_recorded_at_idx ON sprt_history (experiment_id, recorded_at);

-- =============================================================================
-- Phase 4: A/B Testing Advanced SQL
-- =============================================================================

-- 5. FK constraint: experiment_variants.prompt_version_id -> prompt_versions(id)
--    Not manageable directly in Prisma schema (cross-model nullable FK).
--    ON DELETE SET NULL: deleting a prompt version doesn't delete the variant.
ALTER TABLE experiment_variants
  ADD CONSTRAINT fk_experiment_variant_prompt_version
  FOREIGN KEY (prompt_version_id)
  REFERENCES prompt_versions(id)
  ON DELETE SET NULL;

-- 6. FK constraint: experiments.created_by -> profiles(id)
--    H6: All user identity FKs reference profiles(id), not auth.users(id).
ALTER TABLE experiments
  ADD CONSTRAINT fk_experiment_created_by
  FOREIGN KEY (created_by)
  REFERENCES profiles(id)
  ON DELETE CASCADE;

-- 7. FK constraint: experiments.winner_variant_id -> experiment_variants(id)
ALTER TABLE experiments
  ADD CONSTRAINT fk_experiment_winner_variant
  FOREIGN KEY (winner_variant_id)
  REFERENCES experiment_variants(id)
  ON DELETE SET NULL;

-- 8. RLS on experiment tables
--    Experiments are associated with a user profile — only creators and admins can manage.
ALTER TABLE experiments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprt_history        ENABLE ROW LEVEL SECURITY;

-- Read-all policies for dashboard (demo: all authenticated users can read experiments)
CREATE POLICY "experiments_select_all"
  ON experiments FOR SELECT USING (true);

CREATE POLICY "experiment_variants_select_all"
  ON experiment_variants FOR SELECT USING (true);

CREATE POLICY "variant_metrics_select_all"
  ON variant_metrics FOR SELECT USING (true);

CREATE POLICY "sprt_history_select_all"
  ON sprt_history FOR SELECT USING (true);

-- Write policies: only service role (Prisma with service key bypasses RLS)
-- Application-level auth checks in Server Actions / API routes are the primary guard.

-- 9. Seed a demo experiment (for immediate demo value without manual setup)
--    Creates a "running" experiment. Uses ON CONFLICT DO NOTHING for safety.
--    NOTE: Inserts only if an ADMIN profile exists.
INSERT INTO experiments (id, name, description, status, primary_metric, mde, mde_unit, min_samples, max_samples, alpha, beta, started_at, created_by, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'Summarization Prompt A/B Test',
  'Testing concise vs. detailed system prompt for summarization endpoint',
  'running',
  'error_rate',
  0.02,
  'absolute',
  200,
  5000,
  0.05,
  0.20,
  NOW(),
  id,
  NOW(),
  NOW()
FROM profiles
WHERE role = 'ADMIN'
LIMIT 1
ON CONFLICT DO NOTHING;
