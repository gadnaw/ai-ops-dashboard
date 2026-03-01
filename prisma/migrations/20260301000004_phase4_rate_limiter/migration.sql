-- =============================================================================
-- Phase 4: Rate Limiter — rate_limit_buckets, rate_limit_events, response_cache
-- =============================================================================

-- 1. Token bucket state per API key
CREATE TABLE rate_limit_buckets (
  id          TEXT PRIMARY KEY,
  tokens      DOUBLE PRECISION NOT NULL,
  last_refill TIMESTAMPTZ NOT NULL,
  capacity    INTEGER NOT NULL,
  refill_rate DOUBLE PRECISION NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Degradation event audit log
CREATE TABLE rate_limit_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id      UUID NOT NULL REFERENCES api_keys(id),
  request_log_id  UUID,
  stage           INTEGER NOT NULL,
  stage_name      TEXT NOT NULL,
  reason          TEXT NOT NULL,
  bucket_id       TEXT NOT NULL,
  tokens_at_event DOUBLE PRECISION,
  queued_ms       INTEGER,
  fallback_model  TEXT,
  cache_hit_key   TEXT,
  retry_after_sec INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rate_limit_events_api_key_created_idx ON rate_limit_events (api_key_id, created_at DESC);
CREATE INDEX rate_limit_events_stage_created_idx   ON rate_limit_events (stage, created_at DESC);

-- 3. Response cache for Stage 3 degradation
CREATE TABLE response_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_hash   TEXT NOT NULL,
  model         TEXT NOT NULL,
  response_text TEXT NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      DECIMAL(10, 6),
  hit_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ,
  UNIQUE (prompt_hash, model)
);

CREATE INDEX response_cache_expires_idx ON response_cache (expires_at);

-- =============================================================================
-- Phase 4: Rate Limiter Advanced SQL
-- =============================================================================

-- 4. PL/pgSQL atomic token bucket check-and-consume function.
--    Returns remaining tokens after consuming 1 token.
--    Returns -1 if bucket is exhausted (rate limited).
--    Automatically initializes bucket on first call for a given p_id.
--    UPDATE acquires row lock automatically — no SELECT FOR UPDATE needed.
--    Performance: ~10-15ms per call, ~125 tx/s under contention (per-key, acceptable).
--
-- Analysis constraint H2: Do NOT install @upstash/redis or @upstash/ratelimit.
-- This PL/pgSQL implementation IS the rate limiter for Phase 4.
-- Upstash is the documented upgrade path via the RateLimiterInterface abstraction.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_id          TEXT,
  p_capacity    INTEGER DEFAULT 60,
  p_refill_rate DOUBLE PRECISION DEFAULT 1.0
) RETURNS DOUBLE PRECISION AS $$
DECLARE
  v_tokens DOUBLE PRECISION;
BEGIN
  -- Atomic UPDATE: refill accrued tokens, subtract 1 for this request.
  -- clock_timestamp() is evaluated fresh each call (not cached like now()).
  UPDATE rate_limit_buckets
  SET
    last_refill = clock_timestamp(),
    tokens = GREATEST(
      LEAST(
        tokens
          - 1
          + p_refill_rate * EXTRACT(EPOCH FROM (clock_timestamp() - last_refill)),
        p_capacity
      ),
      -1
    )
  WHERE id = p_id
  RETURNING tokens INTO v_tokens;

  -- Initialize bucket on first call (INSERT ... ON CONFLICT handles concurrent init)
  IF v_tokens IS NULL THEN
    INSERT INTO rate_limit_buckets (id, tokens, last_refill, capacity, refill_rate)
    VALUES (p_id, p_capacity - 1, clock_timestamp(), p_capacity, p_refill_rate)
    ON CONFLICT (id) DO UPDATE
      SET tokens = EXCLUDED.tokens
    RETURNING tokens INTO v_tokens;
  END IF;

  RETURN v_tokens;
END;
$$ LANGUAGE plpgsql;

-- 5. Seed default rate limit buckets for demo purposes.
--    Set low capacity (5 requests/minute) for demo — easy to trigger degradation.
--    ON CONFLICT DO NOTHING — safe to run multiple times.
INSERT INTO rate_limit_buckets (id, tokens, last_refill, capacity, refill_rate)
VALUES
  ('demo-bucket-low',  5, now(), 5, 0.0833),  -- 5 req/min, 5 burst (for demo)
  ('demo-bucket-high', 60, now(), 60, 1.0)    -- 60 req/min, 60 burst (default)
ON CONFLICT (id) DO NOTHING;

-- 6. RLS on new tables — rate limit data is sensitive (reveals API key usage patterns).
--    Prisma with service role bypasses RLS. These policies are defense-in-depth.
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_cache     ENABLE ROW LEVEL SECURITY;

-- Admins and Developers can read rate limit events for their own API keys.
-- Public read NOT allowed (rate limit data is API key-specific).
CREATE POLICY "rate_limit_events_select_own"
  ON rate_limit_events
  FOR SELECT
  USING (
    api_key_id IN (
      SELECT id FROM api_keys WHERE profile_id = auth.uid()
    )
  );

-- response_cache: public read (cached responses contain no PII in this demo).
CREATE POLICY "response_cache_select_all"
  ON response_cache
  FOR SELECT
  USING (true);
