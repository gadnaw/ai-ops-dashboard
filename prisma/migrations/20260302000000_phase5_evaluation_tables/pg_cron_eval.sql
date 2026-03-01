-- =============================================================================
-- pg_cron setup for evaluation processor
-- Run this in the Supabase SQL Editor after deploying the app.
-- Requires pg_cron and pg_net extensions (enabled in Supabase by default).
-- =============================================================================

-- Step 1: Store secrets in Vault (replace with actual values)
-- SELECT vault.create_secret('https://your-app.vercel.app', 'app_url');
-- SELECT vault.create_secret('your-internal-cron-secret', 'internal_cron_secret');

-- Step 2: Schedule evaluation processor every 5 minutes
-- (Remove the space in '* /5' — added to avoid SQL comment parsing issues)
SELECT cron.schedule(
  'process-evaluation-jobs',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_url')
      || '/api/internal/process-evaluations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);

-- Step 3: Verify the job was created
-- SELECT * FROM cron.job WHERE jobname = 'process-evaluation-jobs';

-- To remove the job:
-- SELECT cron.unschedule('process-evaluation-jobs');
