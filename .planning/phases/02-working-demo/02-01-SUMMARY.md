---
phase: 2
plan: "02-01"
title: "Data Layer — Partitioned request_logs, Materialized Views, pg_cron, Rate Cards, Prisma Schema"
subsystem: "database"
tags: ["postgresql", "prisma", "partitioning", "materialized-views", "pg-cron", "supabase-realtime", "cost-calculation"]
status: "complete"

dependency-graph:
  requires: ["01-01", "01-02", "01-03"]
  provides:
    - "Prisma schema with RequestLog, CostRateCard, DashboardEvent, EndpointConfig models"
    - "Partitioned request_logs table with monthly child partitions (2026-01 to 2026-04)"
    - "Three materialized views: hourly_cost_summary, hourly_latency_percentiles, daily_model_breakdown"
    - "pg_cron schedule (4 jobs, every 5 min) for mat view refresh and Realtime notifications"
    - "Cost rate card seed data for 6 active models"
    - "Default endpoint configs for 3 demo endpoints"
    - "calculateCost() service at src/lib/cost/calculator.ts"
  affects: ["02-02", "02-03", "02-04"]

tech-stack:
  added:
    - "ai@6.0.105 — Vercel AI SDK 6"
    - "@ai-sdk/openai@3.0.37 — OpenAI provider for AI SDK"
    - "@ai-sdk/anthropic@3.0.50 — Anthropic provider for AI SDK"
    - "@ai-sdk/google@3.0.34 — Google provider for AI SDK"
    - "recharts@3.7.0 — Chart library for dashboard"
    - "zustand@5.0.11 — State management"
    - "@faker-js/faker@10.3.0 — Fake data generation for seeding (dev)"
    - "date-fns@4.1.0 — Date utilities (dev)"
    - "tsx@4.21.0 — TypeScript execution for seed scripts (dev)"
  patterns:
    - "Prisma 7 driver adapter: Pool + PrismaPg + PrismaClient (runtime)"
    - "Module-scoped rate card cache with TTL (1 minute)"
    - "PostgreSQL range partitioning by month (Prisma maps to parent table)"
    - "Materialized view refresh with CONCURRENT (non-blocking)"

key-files:
  created:
    - "prisma/migrations/20260301000001_phase2_base_tables/migration.sql"
    - "prisma/migrations/20260301000002_phase2_advanced_sql/migration.sql"
    - "src/lib/cost/calculator.ts"
    - "docs/ADR-002-data-layer.md"
  modified:
    - "prisma/schema.prisma — appended 4 new models"
    - "prisma.config.ts — added schema, migrations path, seed script"
    - "src/lib/env.ts — added 3 LLM provider API key vars"
    - "src/lib/db/prisma.ts — updated to max:1 pool with globalForPrisma.pool"
    - ".env.example — added LLM provider API key entries"
    - "supabase/setup.sql — appended pg_cron and Realtime publication setup"

decisions:
  - id: "D-02-01-01"
    decision: "request_logs is a partitioned table — not Prisma-managed DDL"
    rationale: "Prisma cannot generate partitioned table DDL. Parent table created via raw SQL migration. Prisma schema maps to parent for ORM queries."
    impact: "Plans 02-02+ must use prisma.requestLog.create() — Prisma handles insert routing to correct partition automatically."
  - id: "D-02-01-02"
    decision: "pg_cron and Realtime publication in supabase/setup.sql (not migration)"
    rationale: "CREATE EXTENSION pg_cron and ALTER PUBLICATION require superuser. Supabase manages these via Dashboard or setup SQL run manually. Migration SQL would fail in automated context."
    impact: "User must manually enable pg_cron extension in Supabase Dashboard and run supabase/setup.sql after applying migrations."
  - id: "D-02-01-03"
    decision: "Rate card cache TTL = 1 minute (module-scoped)"
    rationale: "Pricing rarely changes. Cache avoids DB round-trip on every request. 1 minute is safe — serverless functions restart frequently anyway, resetting cache naturally."
    impact: "Price changes take up to 1 minute to propagate to active function instances."
  - id: "D-02-01-04"
    decision: "prisma.config.ts at root updated (not a separate prisma/config.ts)"
    rationale: "Prisma 7 expects prisma.config.ts at project root. The plan artifact 'prisma/config.ts' is merged into the existing root-level prisma.config.ts."
    impact: "No change to migration workflow — same file, added schema/migrations/seed fields."

metrics:
  tasks-total: 3
  tasks-completed: 3
  duration: "14 minutes"
  completed: "2026-03-01"
---

# Phase 2 Plan 01: Data Layer Summary

**One-liner:** Partitioned PostgreSQL data layer with pg_cron materialized view auto-refresh, Prisma 7 driver adapter, and TTL-cached cost calculator reading from database rate cards.

## What Was Built

### Database Schema (4 new models)

| Model | Table | Key Feature |
|-------|-------|-------------|
| RequestLog | request_logs | Range-partitioned by month (2026-01 to 2026-04), composite PK (id, created_at) |
| CostRateCard | cost_rate_cards | Pricing for 6 active models, seeded in migration |
| DashboardEvent | dashboard_events | Realtime subscription target; RLS disabled for demo |
| EndpointConfig | endpoint_configs | Per-endpoint model config for router (02-02) and config UI (02-04) |

### Migration Files

1. **20260301000001_phase2_base_tables** — Standard Prisma-compatible SQL for cost_rate_cards, dashboard_events, endpoint_configs
2. **20260301000002_phase2_advanced_sql** — Raw SQL migration to apply via Supabase SQL Editor:
   - Drops plain request_logs (if any) and creates partitioned version
   - Creates 4 monthly child partitions + all indexes
   - Creates 3 materialized views with unique indexes (CONCURRENTLY-compatible)
   - Seeds cost rate cards (6 models) and default endpoint configs (3 endpoints)
   - RLS policies on request_logs (public read, service write)
   - Initial REFRESH MATERIALIZED VIEW for all 3 views

### supabase/setup.sql (Phase 2 additions)

- `ALTER PUBLICATION supabase_realtime ADD TABLE dashboard_events`
- pg_cron jobs (4 schedules, every 5 minutes):
  - `refresh-cost-summary` — REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_cost_summary
  - `refresh-latency-percentiles` — REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_latency_percentiles
  - `refresh-model-breakdown` — REFRESH MATERIALIZED VIEW CONCURRENTLY daily_model_breakdown
  - `notify-dashboard-refresh` — INSERT INTO dashboard_events (event_type) VALUES ('refresh_complete')

### Cost Calculator Service

**File:** `src/lib/cost/calculator.ts`

```typescript
import { calculateCost } from '@/lib/cost/calculator';

// Usage in after() logger (Plan 02-02):
const { costUsd } = await calculateCost({
  modelId: 'openai:gpt-4o',
  inputTokens: usage.inputTokens,   // H3: AI SDK 6 property names
  outputTokens: usage.outputTokens,
  cachedTokens: usage.cachedTokens ?? 0,
});
```

- Rate card cache: 1-minute TTL, module-scoped
- Cached token pricing: uses cached rate if available, falls back to full input rate
- Error handling: returns `{costUsd: 0, rateCardFound: false}` — never throws

### Prisma Client Update

Updated `src/lib/db/prisma.ts`:
- `max: 1` pool size (Pitfall 1 mitigation — serverless connection limit)
- `globalForPrisma.pool` reference stored for cleanup
- Pool type uses named import `{ Pool } from 'pg'` (not default)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | ec4a274 | feat(02-01): extend Prisma schema with request_logs, cost_rate_cards, dashboard_events, endpoint_configs |
| Task 2 | 6a8330c | feat(02-01): add partitioned request_logs, materialized views, and pg_cron refresh jobs |
| Task 3 | 5feb694 | feat(02-01): add cost calculator service and update Prisma client to driver adapter pattern |

## Deviations from Plan

### Auto-merged artifact — prisma/config.ts → prisma.config.ts

- **Found during:** Task 1
- **Issue:** Plan specified artifact at `prisma/config.ts` but existing project already had `prisma.config.ts` at root (Prisma 7 standard location from Phase 1). Creating a separate `prisma/config.ts` would cause Prisma to load the wrong config.
- **Fix:** Updated the root-level `prisma.config.ts` to include the `schema`, `migrations.path`, and `migrations.seed` fields from the plan. Deleted the accidentally created `prisma/config.ts`.
- **Files modified:** `prisma.config.ts` (root)
- **Rule:** Rule 1 (bug fix — duplicate config would cause incorrect behavior)

### pg_cron and Realtime in setup.sql (not migration)

- **Found during:** Task 2
- **Issue:** The critical context note explicitly states: "pg_cron and Supabase Realtime publication SQL should go in a setup.sql file (not run via Prisma migrate) since they require Supabase-specific extensions."
- **Fix:** Moved `CREATE EXTENSION IF NOT EXISTS pg_cron`, all `cron.schedule()` calls, and `ALTER PUBLICATION supabase_realtime ADD TABLE dashboard_events` to `supabase/setup.sql` (Phase 2 section). The main migration SQL still has the table DDL, views, seed data, and RLS.
- **Files modified:** `supabase/setup.sql` (appended), `prisma/migrations/20260301000002_phase2_advanced_sql/migration.sql` (pg_cron and Realtime sections removed)
- **Rule:** Rule 3 (blocking issue — migration would fail in automated context without superuser)

## Manual Steps Required Before Phase 2 Plans Run

1. **Enable pg_cron extension:** Supabase Dashboard > Database > Extensions > enable pg_cron
2. **Apply migrations via Supabase SQL Editor:**
   - Paste and run `prisma/migrations/20260301000001_phase2_base_tables/migration.sql`
   - Paste and run `prisma/migrations/20260301000002_phase2_advanced_sql/migration.sql`
3. **Run supabase/setup.sql Phase 2 section** (pg_cron jobs + Realtime publication)
4. **Add LLM provider API keys to .env.local:**
   - `OPENAI_API_KEY="sk-..."`
   - `ANTHROPIC_API_KEY="sk-ant-..."`
   - `GOOGLE_GENERATIVE_AI_API_KEY="AIza..."`

## Next Phase Readiness

**Plans 02-02, 02-03, 02-04 can proceed after:**
- Database schema applied and verified
- LLM API keys set in environment
- pg_cron jobs confirmed active (verify with `SELECT jobname FROM cron.job`)

**Interface for downstream plans:**

- `import { calculateCost } from '@/lib/cost/calculator'` — cost computation
- `import { prisma } from '@/lib/db/prisma'` — database access (ALL plans must use this import)
- `prisma.requestLog.create()` — insert to partitioned table
- `prisma.endpointConfig.findUnique({ where: { endpointName: '...' } })` — read endpoint config
- `prisma.$queryRaw` — query materialized views (NEVER use `prisma.requestLog.findMany()` for dashboard)
