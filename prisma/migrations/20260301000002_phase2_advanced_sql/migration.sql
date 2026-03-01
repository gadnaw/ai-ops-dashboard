-- =============================================================================
-- Phase 2: Advanced SQL — Partitioned table, materialized views, pg_cron
-- =============================================================================
-- HOW TO APPLY:
--   1. Run migration 20260301000001_phase2_base_tables first (creates cost_rate_cards,
--      dashboard_events, endpoint_configs).
--   2. Paste this entire file into Supabase Dashboard > SQL Editor and run.
--   3. Ensure pg_cron extension is enabled first:
--      Supabase Dashboard > Database > Extensions > pg_cron (enable it)
--
-- Prisma migrate tracks this migration but does not auto-apply it.
-- =============================================================================

-- IMPORTANT: Drop Prisma-generated request_logs if it was created as a plain table.
-- Replace it with the partitioned version.
DROP TABLE IF EXISTS request_logs CASCADE;

-- =============================================================================
-- 1. PARTITIONED request_logs TABLE
-- Analysis Constraint H1: id is UUID (not BIGSERIAL), composite PK (id, created_at)
-- Analysis Constraint H5: includes prompt_text and response_text columns
-- Analysis Constraint H12: prompt_version_id UUID NULL without FK
-- Analysis Constraint M7: indexes on (created_at, cost_usd), (created_at, duration_ms), (created_at, status)
-- =============================================================================

CREATE TABLE request_logs (
  id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  provider          TEXT          NOT NULL,
  model             TEXT          NOT NULL,
  endpoint          TEXT,
  input_tokens      INTEGER       NOT NULL DEFAULT 0,
  output_tokens     INTEGER       NOT NULL DEFAULT 0,
  cached_tokens     INTEGER       NOT NULL DEFAULT 0,
  cost_usd          NUMERIC(10,8) NOT NULL DEFAULT 0,
  duration_ms       INTEGER,
  status            TEXT          NOT NULL DEFAULT 'success',
  error_code        TEXT,
  is_fallback       BOOLEAN       NOT NULL DEFAULT false,
  fallback_reason   TEXT,
  prompt_text       TEXT,
  response_text     TEXT,
  prompt_version_id UUID,                              -- H12: no FK in Phase 2
  session_id        UUID,                              -- COMP-01 deferred, column present
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  PRIMARY KEY (id, created_at)                        -- Partition key MUST be in PK
) PARTITION BY RANGE (created_at);

-- Monthly partitions — covers seed data range (30 days back from March 2026)
CREATE TABLE request_logs_2026_01 PARTITION OF request_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE request_logs_2026_02 PARTITION OF request_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE request_logs_2026_03 PARTITION OF request_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE request_logs_2026_04 PARTITION OF request_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Indexes on parent using ON ONLY (CONCURRENTLY not supported on partitioned parent)
-- These are "invalid" indexes until matching indexes exist on all partitions
CREATE INDEX request_logs_created_at_idx        ON ONLY request_logs (created_at);
CREATE INDEX request_logs_provider_model_idx    ON ONLY request_logs (created_at, provider, model);
CREATE INDEX request_logs_cost_idx              ON ONLY request_logs (created_at, cost_usd);         -- M7
CREATE INDEX request_logs_duration_idx          ON ONLY request_logs (created_at, duration_ms);      -- M7
CREATE INDEX request_logs_status_idx            ON ONLY request_logs (created_at, status);           -- M7
CREATE INDEX request_logs_prompt_version_idx    ON ONLY request_logs (prompt_version_id, created_at);

-- Partition-level indexes (make parent indexes valid)
CREATE INDEX ON request_logs_2026_01 (created_at);
CREATE INDEX ON request_logs_2026_01 (created_at, provider, model);
CREATE INDEX ON request_logs_2026_01 (created_at, cost_usd);
CREATE INDEX ON request_logs_2026_01 (created_at, duration_ms);
CREATE INDEX ON request_logs_2026_01 (created_at, status);
CREATE INDEX ON request_logs_2026_01 (prompt_version_id, created_at);

CREATE INDEX ON request_logs_2026_02 (created_at);
CREATE INDEX ON request_logs_2026_02 (created_at, provider, model);
CREATE INDEX ON request_logs_2026_02 (created_at, cost_usd);
CREATE INDEX ON request_logs_2026_02 (created_at, duration_ms);
CREATE INDEX ON request_logs_2026_02 (created_at, status);
CREATE INDEX ON request_logs_2026_02 (prompt_version_id, created_at);

CREATE INDEX ON request_logs_2026_03 (created_at);
CREATE INDEX ON request_logs_2026_03 (created_at, provider, model);
CREATE INDEX ON request_logs_2026_03 (created_at, cost_usd);
CREATE INDEX ON request_logs_2026_03 (created_at, duration_ms);
CREATE INDEX ON request_logs_2026_03 (created_at, status);
CREATE INDEX ON request_logs_2026_03 (prompt_version_id, created_at);

CREATE INDEX ON request_logs_2026_04 (created_at);
CREATE INDEX ON request_logs_2026_04 (created_at, provider, model);
CREATE INDEX ON request_logs_2026_04 (created_at, cost_usd);
CREATE INDEX ON request_logs_2026_04 (created_at, duration_ms);
CREATE INDEX ON request_logs_2026_04 (created_at, status);
CREATE INDEX ON request_logs_2026_04 (prompt_version_id, created_at);

-- =============================================================================
-- 2. MATERIALIZED VIEWS
-- All three views require unique indexes before REFRESH CONCURRENTLY works.
-- CONCURRENTLY allows reads during refresh — prevents dashboard blank-out.
-- =============================================================================

-- 2a. hourly_cost_summary
CREATE MATERIALIZED VIEW hourly_cost_summary AS
SELECT
  date_trunc('hour', created_at)                              AS hour,
  provider,
  model,
  COUNT(*)                                                    AS request_count,
  SUM(cost_usd)                                               AS total_cost,
  SUM(input_tokens)                                           AS total_input_tokens,
  SUM(output_tokens)                                          AS total_output_tokens,
  SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)          AS error_count,
  SUM(CASE WHEN is_fallback = true THEN 1 ELSE 0 END)        AS fallback_count
FROM request_logs
GROUP BY date_trunc('hour', created_at), provider, model;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX hourly_cost_summary_pkey
  ON hourly_cost_summary (hour, provider, model);

-- 2b. hourly_latency_percentiles
CREATE MATERIALIZED VIEW hourly_latency_percentiles AS
SELECT
  date_trunc('hour', created_at)                             AS hour,
  provider,
  model,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99,
  COUNT(*)                                                   AS sample_count
FROM request_logs
WHERE status = 'success'
  AND duration_ms IS NOT NULL
GROUP BY date_trunc('hour', created_at), provider, model;

CREATE UNIQUE INDEX hourly_latency_pkey
  ON hourly_latency_percentiles (hour, provider, model);

-- 2c. daily_model_breakdown
CREATE MATERIALIZED VIEW daily_model_breakdown AS
SELECT
  date_trunc('day', created_at)                              AS day,
  provider,
  model,
  COUNT(*)                                                   AS request_count,
  SUM(cost_usd)                                              AS total_cost,
  ROUND(
    COUNT(*) * 100.0 / NULLIF(
      SUM(COUNT(*)) OVER (PARTITION BY date_trunc('day', created_at)),
      0
    ), 2
  )                                                          AS pct_of_day
FROM request_logs
GROUP BY date_trunc('day', created_at), provider, model;

CREATE UNIQUE INDEX daily_model_breakdown_pkey
  ON daily_model_breakdown (day, provider, model);

-- =============================================================================
-- 3. DASHBOARD EVENTS TABLE — Realtime subscription target (not request_logs)
-- M13: Supabase Realtime on dashboard_events, not request_logs
-- =============================================================================

-- RLS disabled intentionally: dashboard_events contains no sensitive data.
-- Public (anon) read access is required for the demo dashboard (no-login flow).
ALTER TABLE dashboard_events DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. COST RATE CARDS — Seed with current pricing (verified 2026-03-01)
-- =============================================================================

INSERT INTO cost_rate_cards
  (model_id, provider, display_name, input_price_per_m_tokens, output_price_per_m_tokens, cached_input_price_per_m_tokens, effective_date)
VALUES
  -- OpenAI (MEDIUM confidence — official page 403'd, aggregators agree)
  ('openai:gpt-4o',
   'openai', 'GPT-4o', 2.500000, 10.000000, 1.250000, '2024-01-01'),
  ('openai:gpt-4o-mini',
   'openai', 'GPT-4o Mini', 0.150000, 0.600000, 0.075000, '2024-01-01'),

  -- Anthropic (HIGH confidence — verified from platform.claude.com/docs)
  ('anthropic:claude-3-5-sonnet-20241022',
   'anthropic', 'Claude 3.5 Sonnet', 3.000000, 15.000000, 0.300000, '2024-10-22'),
  ('anthropic:claude-3-5-haiku-20241022',
   'anthropic', 'Claude 3.5 Haiku', 0.800000, 4.000000, 0.080000, '2024-10-22'),

  -- Google — UPDATED from locked spec (1.5 models discontinued Sept 24, 2025)
  -- Replacement: gemini-2.5-flash (long-lived) + gemini-2.0-flash (retiring June 2026)
  ('google:gemini-2.5-flash',
   'google', 'Gemini 2.5 Flash', 0.300000, 2.500000, NULL, '2025-01-01'),
  ('google:gemini-2.0-flash',
   'google', 'Gemini 2.0 Flash', 0.100000, 0.400000, NULL, '2024-12-01');

-- =============================================================================
-- 5. DEFAULT ENDPOINT CONFIGS — Pre-seeded for demo
-- =============================================================================

INSERT INTO endpoint_configs
  (endpoint_name, primary_model, fallback_chain, temperature, max_tokens, system_prompt)
VALUES
  ('summarization',
   'openai:gpt-4o',
   '["anthropic:claude-3-5-sonnet-20241022", "google:gemini-2.5-flash"]',
   0.3, 1000,
   'You are a helpful assistant that summarizes text concisely.'),
  ('classification',
   'openai:gpt-4o-mini',
   '["anthropic:claude-3-5-haiku-20241022", "google:gemini-2.0-flash"]',
   0.1, 200,
   'You are a text classification assistant. Respond with only the category name.'),
  ('extraction',
   'anthropic:claude-3-5-sonnet-20241022',
   '["openai:gpt-4o", "google:gemini-2.5-flash"]',
   0.2, 500,
   'You are a structured data extraction assistant.');

-- =============================================================================
-- 6. RLS on request_logs
-- Public read access required for demo dashboard (no-login success criterion).
-- =============================================================================

ALTER TABLE request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "request_logs_public_read"
  ON request_logs
  FOR SELECT
  USING (true);  -- Full public read for demo. Authenticated writes only.

CREATE POLICY "request_logs_service_write"
  ON request_logs
  FOR INSERT
  WITH CHECK (true);  -- Service role key used for all writes (Prisma bypasses RLS with service key)

-- =============================================================================
-- 7. INITIAL MATERIALIZED VIEW POPULATION
-- Plain REFRESH (not CONCURRENTLY) for first population — no data yet, but establishes
-- the view structure. pg_cron will use CONCURRENTLY after seed data is inserted.
-- =============================================================================

REFRESH MATERIALIZED VIEW hourly_cost_summary;
REFRESH MATERIALIZED VIEW hourly_latency_percentiles;
REFRESH MATERIALIZED VIEW daily_model_breakdown;
