-- Phase 5 Plan 05-03: Alert Engine Tables + check_alert_rules() PL/pgSQL Function
-- Applied via Node.js pg client to db.ksrmiaigyezhvuktimqt.supabase.co:5432

-- ============================================================
-- 1. Create alert_rules table
-- ============================================================
CREATE TABLE IF NOT EXISTS alert_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  metric          TEXT NOT NULL,          -- cost_per_window | p95_latency_ms | error_rate_pct | eval_score_avg
  threshold_type  TEXT NOT NULL DEFAULT 'absolute',  -- absolute | relative_daily_avg
  threshold_value NUMERIC(12, 4) NOT NULL,
  window_minutes  INT NOT NULL DEFAULT 15,
  cooldown_minutes INT NOT NULL DEFAULT 60,
  webhook_url     TEXT NOT NULL,
  webhook_secret  TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_fired_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Create alert_history table
-- ============================================================
CREATE TABLE IF NOT EXISTS alert_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id             UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  triggered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  metric_value        NUMERIC(12, 4) NOT NULL,
  threshold_value     NUMERIC(12, 4) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'fired',  -- fired | acknowledged | resolved
  acknowledged_at     TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  resolver_note       TEXT,
  webhook_status_code INT,
  webhook_response    TEXT,
  webhook_attempts    INT NOT NULL DEFAULT 0
);

-- ============================================================
-- 3. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_alert_history_rule
  ON alert_history (rule_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_history_status
  ON alert_history (status);

-- ============================================================
-- 4. check_alert_rules() PL/pgSQL Function
-- CRITICAL: Uses duration_ms (NOT latency_ms) and SUM(cost_usd) (NOT SUM(total_cost))
-- per ANALYSIS-REPORT constraints C2 and C3.
-- Cooldown enforced at SQL level: UPDATE last_fired_at BEFORE yielding.
-- ============================================================
CREATE OR REPLACE FUNCTION check_alert_rules()
RETURNS TABLE (
  rule_id UUID,
  rule_name TEXT,
  metric TEXT,
  current_value NUMERIC,
  threshold_value NUMERIC,
  webhook_url TEXT,
  webhook_secret TEXT
) AS $$
DECLARE
  r RECORD;
  current_val NUMERIC;
  daily_avg NUMERIC;
  effective_threshold NUMERIC;
  window_start TIMESTAMPTZ;
BEGIN
  FOR r IN
    SELECT *
    FROM alert_rules
    WHERE is_active = true
      AND (
        last_fired_at IS NULL
        OR last_fired_at < now() - (cooldown_minutes * interval '1 minute')
      )
  LOOP
    window_start := now() - (r.window_minutes * interval '1 minute');

    -- Compute metric value for the sliding window
    -- CRITICAL: use duration_ms (not latency_ms) and SUM(cost_usd) (not SUM(total_cost))
    CASE r.metric
      WHEN 'cost_per_window' THEN
        SELECT COALESCE(SUM(cost_usd), 0)
        INTO current_val
        FROM request_logs
        WHERE created_at > window_start;

      WHEN 'p95_latency_ms' THEN
        SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)
        INTO current_val
        FROM request_logs
        WHERE created_at > window_start
          AND duration_ms IS NOT NULL;

      WHEN 'error_rate_pct' THEN
        SELECT
          CASE WHEN COUNT(*) = 0 THEN 0
               ELSE (COUNT(*) FILTER (WHERE status = 'error') * 100.0 / COUNT(*))
          END
        INTO current_val
        FROM request_logs
        WHERE created_at > window_start;

      WHEN 'eval_score_avg' THEN
        SELECT COALESCE(AVG(overall_score), 5.0)
        INTO current_val
        FROM evaluation_scores
        WHERE created_at > window_start;

      ELSE
        CONTINUE; -- Unknown metric type, skip this rule
    END CASE;

    -- Handle NULL (no data in window)
    IF current_val IS NULL THEN
      CONTINUE;
    END IF;

    -- Compute effective threshold
    IF r.threshold_type = 'relative_daily_avg' THEN
      CASE r.metric
        WHEN 'cost_per_window' THEN
          SELECT COALESCE(SUM(cost_usd) / NULLIF(EXTRACT(EPOCH FROM interval '24 hours') / 3600, 0), 0)
          INTO daily_avg
          FROM request_logs
          WHERE created_at > now() - interval '24 hours';
        ELSE
          daily_avg := r.threshold_value; -- fallback to absolute for non-cost metrics
      END CASE;
      effective_threshold := COALESCE(daily_avg, 0) * r.threshold_value;
    ELSE
      effective_threshold := r.threshold_value;
    END IF;

    -- Check threshold:
    -- eval_score_avg fires when BELOW threshold (low quality)
    -- all other metrics fire when ABOVE threshold
    IF (r.metric = 'eval_score_avg' AND current_val < effective_threshold)
      OR (r.metric != 'eval_score_avg' AND current_val > effective_threshold)
    THEN
      -- Update last_fired_at BEFORE yielding (prevents race condition / duplicate fires)
      -- ANALYSIS-REPORT: cooldown enforced at SQL level
      UPDATE alert_rules
      SET last_fired_at = now()
      WHERE id = r.id;

      -- Insert history record
      INSERT INTO alert_history (rule_id, metric_value, threshold_value)
      VALUES (r.id, current_val, effective_threshold);

      -- Yield rule for webhook dispatch
      rule_id := r.id;
      rule_name := r.name;
      metric := r.metric;
      current_value := current_val;
      threshold_value := effective_threshold;
      webhook_url := r.webhook_url;
      webhook_secret := r.webhook_secret;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
