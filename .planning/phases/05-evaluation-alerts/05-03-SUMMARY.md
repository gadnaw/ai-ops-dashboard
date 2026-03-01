---
phase: "05"
plan: "03"
subsystem: "alerts"
tags: [alerts, pg_cron, webhook, hmac, seed-data, evaluation, plpgsql]
dependency-graph:
  requires: ["05-01", "05-02", "02-01"]
  provides: ["AlertEngine", "AlertSchema", "AlertUI", "SeedData"]
  affects: []
tech-stack:
  added: []
  patterns: ["PL/pgSQL function for threshold checks", "HMAC-SHA256 webhook signing", "exponential backoff retry", "Server Component + Client Island", "idempotent seed functions"]
key-files:
  created:
    - prisma/migrations/20260302100000_phase5_alert_tables/migration.sql
    - prisma/migrations/pg_cron_alerts.sql
    - src/lib/alerts/check.ts
    - src/lib/alerts/dispatch.ts
    - src/app/api/internal/check-alerts/route.ts
    - src/app/actions/alerts.ts
    - src/components/alerts/AlertStatusBadge.tsx
    - src/components/alerts/AlertHistoryTable.tsx
    - src/components/alerts/AlertRuleForm.tsx
    - src/app/(dashboard)/alerts/page.tsx
    - src/app/(dashboard)/alerts/rules/page.tsx
    - src/db/seed/evaluations.ts
    - src/db/seed/alerts.ts
  modified:
    - prisma/schema.prisma
    - prisma/seed.ts
    - src/components/layout/nav.tsx
    - eslint.config.mjs
decisions:
  - "Auth pattern: getSession() from @/lib/auth/session (not auth() which does not exist)"
  - "Server Action return pattern: { success: true } | { error: string } with try/catch (matches 05-02 pattern)"
  - "Seed functions take PrismaClient parameter instead of importing @/lib/db/prisma (seed runs outside Next.js runtime)"
  - "Added src/db/seed/** to ESLint relaxed rules for console.log in seed scripts"
  - "Alert dates computed relative to seed start (30 days ago) not hardcoded to specific calendar dates"
  - "startTransition wrapper: async () => { await action(); } to discard non-void return type"
metrics:
  duration: "21 minutes"
  completed: "2026-03-02"
  tasks: "3/3"
---

# Phase 05 Plan 03: Alert Engine Summary

Complete alert engine with database schema, PL/pgSQL threshold check function, webhook dispatcher with HMAC signing and retry, alert management UI, and Phase 5 seed data with day-15 incident story.

## One-liner

pg_cron alert engine with check_alert_rules() PL/pgSQL, HMAC-SHA256 webhook dispatch with 3-attempt exponential backoff, /alerts and /alerts/rules UI, seed data with day-15 cost spike incident.

## What Was Built

### Task 1: Alert Tables, PL/pgSQL Function, and Services (0f82a64)

**Database Schema:**
- `alert_rules` table: name, metric (cost_per_window | p95_latency_ms | error_rate_pct | eval_score_avg), threshold_type (absolute | relative_daily_avg), threshold_value, window_minutes, cooldown_minutes, webhook_url, webhook_secret, is_active, last_fired_at
- `alert_history` table: rule_id FK, triggered_at, metric_value, threshold_value, status (fired | acknowledged | resolved), acknowledged_at, resolved_at, resolver_note, webhook_status_code, webhook_attempts
- Indexes: idx_alert_history_rule (rule_id, triggered_at DESC), idx_alert_history_status

**check_alert_rules() PL/pgSQL Function:**
- Uses `duration_ms` (NOT latency_ms) and `SUM(cost_usd)` (NOT SUM(total_cost)) per ANALYSIS-REPORT constraints C2/C3
- Four metric types: cost_per_window, p95_latency_ms, error_rate_pct, eval_score_avg
- Cooldown enforced at SQL level: UPDATE last_fired_at BEFORE yielding (prevents duplicate fires from concurrent invocations)
- eval_score_avg fires when BELOW threshold (low quality); all other metrics fire when ABOVE
- relative_daily_avg threshold type for cost metrics

**Services:**
- `src/lib/alerts/check.ts`: `runAlertCheck()` wraps check_alert_rules() SQL, returns typed FiredAlert array
- `src/lib/alerts/dispatch.ts`: `dispatchWebhook()` with HMAC-SHA256 signing (t=timestamp,v1=hex), 3-attempt exponential backoff (0s, 2s, 4s), 10s AbortController timeout, non-retryable on 4xx except 429

**API Route:**
- `POST /api/internal/check-alerts`: validates INTERNAL_CRON_SECRET header, calls runAlertCheck(), dispatches webhooks via Promise.allSettled

**pg_cron Setup:**
- `prisma/migrations/pg_cron_alerts.sql`: pg_cron + pg_net + Vault configuration for every-minute alert checks

### Task 2: Alert Management UI (0a6978c)

**Server Actions** (`src/app/actions/alerts.ts`):
- `acknowledgeAlert()`: sets status=acknowledged, acknowledgedAt=now()
- `resolveAlert()`: sets status=resolved, resolvedAt=now(), optional resolverNote
- `createAlertRule()`: validates FormData, creates rule with proper conditional spread for optional fields
- `toggleAlertRule()`: toggle is_active
- `deleteAlertRule()`: cascade delete rule and history
- `testWebhook()`: sends test payload with 5s timeout
- All use getSession() auth pattern and { success: true } | { error: string } return pattern

**Components:**
- `AlertStatusBadge`: fired (red), acknowledged (yellow), resolved (green)
- `AlertHistoryTable` ("use client" island): table with acknowledge/resolve buttons, resolve note input, webhook delivery info
- `AlertRuleForm` ("use client" island): metric select, threshold value, window selector, cooldown, webhook URL with test button, optional HMAC secret

**Pages:**
- `/alerts`: Server Component with force-dynamic, shows alert history (last 30 days, max 100), active count badge, link to Manage Rules
- `/alerts/rules`: Server Component with force-dynamic, lists existing rules with fire count and active status, AlertRuleForm for creating new rules

**Navigation:**
- Added "Alerts" link to nav.tsx between Evaluation and Config

### Task 3: Seed Data with Day-15 Incident Story (fe59600)

**Evaluation Seeds** (`src/db/seed/evaluations.ts`):
- FNV-1a deterministic sampling: ~10% of request_logs selected for evaluation
- Score distribution: 40% good (4-5), 35% acceptable (3-4), 15% needs review (2-3), 10% serious issues (1-2)
- 30-40% of flagged items left pending human review (demo: queue has items to review)
- Default rubric: "General Quality Rubric v1" (accuracy 40%, coherence 30%, safety 30%)
- Creates linked evaluation_job + evaluation_score pairs

**Alert Seeds** (`src/db/seed/alerts.ts`):
- 3 alert rules: Cost Spike (relative_daily_avg, 2x, 60m), High Latency (absolute, 5000ms, 15m), Error Rate (absolute, 5%, 15m)
- Day-15 incident story: cost spike at 2:32 PM (resolved by 4:00 PM with note), latency regression at 2:35 PM (resolved by 4:05 PM), recent error rate (acknowledged, not resolved)
- Dates computed relative to seed start (not hardcoded)

**Updated prisma/seed.ts:**
- main() truncates Phase 5 data before Phase 2 data (FK ordering)
- Calls seedBaseData() then seedEvaluationAndAlerts()
- Summary shows request_logs, evaluation_scores, alert_rules, alert_history counts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] startTransition void return type**
- **Found during:** Task 2
- **Issue:** React's startTransition expects `() => void | Promise<void>` but Server Actions return `Promise<{ success } | { error }>`, causing TypeScript error
- **Fix:** Wrapped calls in `async () => { await action(); }` to discard non-void return value
- **Files modified:** src/components/alerts/AlertHistoryTable.tsx
- **Commit:** 0a6978c

**2. [Rule 3 - Blocking] ESLint no-console rule blocks seed script commits**
- **Found during:** Task 3
- **Issue:** `src/db/seed/**` files use console.log for progress reporting but were not covered by the ESLint relaxed rules override (only `prisma/**` was)
- **Fix:** Added `src/db/seed/**` to the ESLint relaxed-rules files array in eslint.config.mjs
- **Files modified:** eslint.config.mjs
- **Commit:** fe59600

**3. [Rule 2 - Missing Critical] Auth pattern correction**
- **Found during:** Task 2
- **Issue:** Plan referenced `import { auth } from '@/lib/auth'` which does not exist in this codebase
- **Fix:** Used `import { getSession } from '@/lib/auth/session'` with `session?.userId` check (matches established 05-02 pattern)
- **Files modified:** src/app/actions/alerts.ts
- **Commit:** 0a6978c

**4. [Rule 2 - Missing Critical] Delete alert rule action**
- **Found during:** Task 2
- **Issue:** Plan specified CRUD but only included create/toggle, missing delete
- **Fix:** Added `deleteAlertRule()` Server Action for completeness
- **Files modified:** src/app/actions/alerts.ts
- **Commit:** 0a6978c

## Verification Results

- `pnpm type-check`: PASSED (zero errors)
- `pnpm build`: PASSED (all routes compiled, /alerts and /alerts/rules in route table)
- Migration: Applied via Node.js pg client to db.ksrmiaigyezhvuktimqt.supabase.co:5432
- Tables verified: alert_rules, alert_history present in information_schema
- Function verified: check_alert_rules() present in information_schema.routines

## Next Phase Readiness

Phase 5 is now complete (3/3 plans done). The full evaluation + alerts feature set is operational:
- 05-01: LLM-as-judge evaluation service with quality scoring
- 05-02: Human review queue with approve/override workflow
- 05-03: Alert engine with threshold checks, webhook dispatch, and management UI

All phases (1-5) are now complete. The project is ready for final verification and deployment.
