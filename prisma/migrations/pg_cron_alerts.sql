-- ============================================================
-- Phase 5: Alert Engine -- pg_cron + pg_net Setup
-- Run in Supabase SQL Editor (requires pg_cron and pg_net enabled)
-- ============================================================

-- Step 1: Enable extensions (Supabase has these available)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Store secrets in Vault
-- Replace placeholder values with actual values
-- SELECT vault.create_secret('https://your-app.vercel.app', 'app_url');
-- SELECT vault.create_secret('your-32-char-internal-cron-secret', 'internal_cron_secret');

-- Step 3: Schedule alert check every minute
SELECT cron.schedule(
  'check-alert-rules',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_url')
      || '/api/internal/check-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
  $cron$
);

-- Step 4: Verify jobs are scheduled
-- SELECT * FROM cron.job;

-- Step 5: Monitor job runs
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Step 6: To remove jobs (if needed)
-- SELECT cron.unschedule('check-alert-rules');
