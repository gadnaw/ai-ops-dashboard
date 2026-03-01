# Project State

**Project:** AI Ops Dashboard — Production LLM Monitoring
**Milestone:** Portfolio Demo
**Updated:** 2026-03-02

## Current Position

**Status:** ALL PHASES COMPLETE -- 16/16 plans done
**Phase:** Phase 5 -- Evaluation + Alerts (COMPLETE)
**Plan:** 05-03 complete (Alert Engine)
**Task:** --
**Last activity:** 2026-03-02 -- Completed 05-03 (alert tables, check_alert_rules() PL/pgSQL, HMAC webhook dispatch, /alerts UI, seed data with day-15 incident)

## Progress

```
Phase 1 █████ 3/3 plans complete
Phase 2 █████ 4/4 plans complete
Phase 3 █████ 3/3 plans complete
Phase 4 █████ 3/3 plans complete
Phase 5 █████ 3/3 plans complete
Overall: 16/16 plans complete (100%)
```

### Milestone Progress

| Phase | Name | Status | Plans | Notes |
|-------|------|--------|-------|-------|
| 1 | Foundation | Complete | 3/3 | Scaffold, Auth+RBAC, DevOps all done |
| 2 | Working Demo | Complete | 4/4 | All plans complete -- data layer, model router, dashboard UI, config UI + seed |
| 3 | Prompt Management + Playground | Complete | 3/3 | Prompt service + UI + Playground all done |
| 4 | Reliability + Differentiators | Complete | 3/3 | Rate Limiter, Degradation Viz, A/B Testing all done |
| 5 | Evaluation + Alerts | Complete | 3/3 | Eval service + Human review + Alert engine all done |

### Current Phase Detail

**Phase 1: Foundation** — All plans complete.

| Plan | Status | Tasks | Last Commit |
|------|--------|-------|-------------|
| 01-01 Scaffold | Complete | 4/4 | 97fe70b |
| 01-02 Auth+RBAC | Complete | 5/5 | 8be37a9 |
| 01-03 DevOps | Complete | 4/4 | eeeacc6 |

**Phase 2: Working Demo** — Verified (5/5 must-haves).

| Plan | Status | Tasks | Last Commit |
|------|--------|-------|-------------|
| 02-01 Data Layer | Complete | 3/3 | 5feb694 |
| 02-02 Model Router | Complete | 3/3 | 75ab9dc |
| 02-03 Dashboard UI | Complete | 3/3 | 10d4ea9 |
| 02-04 Config+Seed | Complete | 3/3 | afaf45f |

**Phase 3: Prompt Management + Playground** — Verified (20/20 must-haves).

| Plan | Status | Tasks | Last Commit |
|------|--------|-------|-------------|
| 03-01 Prompt Manager Service | Complete | 3/3 | db3c604 |
| 03-02 Prompt UI | Complete | 2/2 | ca73379 |
| 03-03 Playground | Complete | 2/2 | ab243cc |

**Phase 4: Reliability + Differentiators** — Complete (3/3 plans done).

| Plan | Status | Tasks | Last Commit |
|------|--------|-------|-------------|
| 04-01 Rate Limiter | Complete | 3/3 | 7516885 |
| 04-02 Degradation Visualization | Complete | 2/2 | 9a0e260 |
| 04-03 A/B Testing | Complete | 3/3 | d2046fc |

**Phase 5: Evaluation + Alerts** -- Complete (3/3 plans done).

| Plan | Status | Tasks | Last Commit |
|------|--------|-------|-------------|
| 05-01 Evaluation Service | Complete | 3/3 | f99a990 |
| 05-02 Human Review | Complete | 3/3 | febdab2 |
| 05-03 Alert Engine | Complete | 3/3 | fe59600 |

## Accumulated Decisions

Key architectural decisions locked at roadmap creation. These do NOT need re-evaluation during planning.

- **LangChain removed:** Vercel AI SDK 6 (`createProviderRegistry()`, `streamText()`) replaces LangChain everywhere — Phase 2+
- **Dual connection strings:** `DATABASE_URL` pooled port 6543 (`?pgbouncer=true`, `connection_limit=1`) for runtime; `DIRECT_URL` direct port 5432 for migrations — established Phase 1
- **Materialized views:** All dashboard aggregations pre-computed via pg_cron (5-minute refresh); raw `request_logs` never scanned on page load — established Phase 2
- **Realtime on `dashboard_events`:** Subscribe to lightweight summary table, not `request_logs`; single channel per dashboard, not per widget — established Phase 2
- **PostgreSQL token bucket:** Rate limiter behind swappable interface; Upstash Redis is the named upgrade path, not default — Phase 4
- **SPRT for A/B auto-stop:** Sequential Probability Ratio Test with Wald boundaries (upper=2.773, lower=-1.558 for α=0.05, β=0.20); minimum 200 samples per variant — Phase 4 (RESEARCHED)
- **Gemini 1.5 deprecated:** Use gemini-2.5-flash (stable) and gemini-2.0-flash as replacements — discovered Phase 2 research
- **AI SDK 6 token properties:** `usage.inputTokens` / `usage.outputTokens` (NOT promptTokens/completionTokens) — Phase 3 research
- **LLM-as-judge:** AI SDK 6 `Output.object()` with Zod schema, GPT-4o as judge with self-preference bias documented — Phase 5 research
- **Alert engine:** pg_cron → pg_net → Next.js route for webhook dispatch with HMAC + retry — Phase 5 research
- **Server-first rendering:** `"use client"` only on Recharts wrappers, filter dropdowns, and Realtime feed components — all phases
- **Prototype mode active:** Demo-ready after Phase 2; Phases 3-5 complete the full feature set

### Decisions from 01-01

- **Prisma 7 adapter pattern:** Prisma 7 removes `url`/`directUrl` from `schema.prisma`. Use `prisma.config.ts` with `defineConfig({ datasource: { url: DIRECT_URL } })` for migrations. Runtime uses `@prisma/adapter-pg` + `pg.Pool` with `DATABASE_URL` (pooled). ALL downstream plans must use `import { prisma } from '@/lib/db/prisma'` — no other PrismaClient instantiation.
- **Next.js version:** Installed as Next.js 16.1.6 (latest). Full API compatibility with Next.js 15 maintained.
- **Zod 4 URL validation:** `z.url()` (standalone) used in env.ts — more ergonomic than `z.string().url()` in Zod 4.
- **Testing stack:** Vitest 4 + jsdom (NOT vitest-environment-jsdom which doesn't exist). @playwright/test 1.58.2.

### Decisions from 01-02

- **Auth helper import pattern:** All Phase 2+ Server Actions and Route Handlers use `import { requireAuth, requireRole, requireAdmin, requireDeveloper } from '@/lib/auth/guards'`. requireAuth() redirects; requireRole() throws for API Route Handlers.
- **Supabase SSR cookie pattern:** createServerClient() with getAll/setAll used in both middleware and server client. cookies() called inside request context (not at module level).
- **Client-side login/signup forms:** Login and signup use Client Components with createSupabaseBrowserClient() for immediate error/loading state. Server Actions (actions.ts) exist as fallback.
- **Dashboard clean URL:** Dashboard page at src/app/(dashboard)/page.tsx renders at /dashboard. Root page.tsx redirects /→/dashboard.
- **Nav as Server Component:** Nav is an async Server Component reading session server-side. No client-side context provider needed for session display.
- **PKCE OAuth callback:** /auth/callback Route Handler exchanges authorization code for session. OAuth redirect URL = `${window.location.origin}/auth/callback`.

### Decisions from 01-03

- **lint script:** `pnpm lint` = `eslint src/` (NOT `next lint` — removed in Next.js 16). All Phase 2+ code must pass `eslint src/` cleanly.
- **Husky v9 format:** Pre-commit hooks use plain shell scripts without deprecated `#!/usr/bin/env sh . husky.sh` sourcing. Husky v9 wraps execution itself.
- **Secret detection scope:** Pre-commit scans `.ts/.tsx/.js/.jsx/.mjs/.cjs/.env*` files only. Docs and .env.example are exempt. Pattern: `NEXT_PUBLIC_[A-Z_]*KEY` on non-comment added lines.
- **ESLint rules locked:** `@typescript-eslint/no-explicit-any: error`, `@typescript-eslint/consistent-type-imports: error`, `@typescript-eslint/no-unused-vars: error`. These are enforced pre-commit with `--max-warnings=0`.
- **Vercel build command:** `pnpm db:migrate && pnpm build` — migrations run before build in CI. Uses DIRECT_URL (port 5432).

### Decisions from 02-01

- **request_logs is partitioned — not Prisma-managed DDL:** Prisma schema maps to parent table for ORM queries. Partitions created via raw SQL. Plans 02-02+ use `prisma.requestLog.create()` — Prisma routes to correct partition automatically.
- **pg_cron and Realtime in supabase/setup.sql:** `CREATE EXTENSION pg_cron` and `ALTER PUBLICATION` require superuser/Supabase-specific handling. Moved to `supabase/setup.sql` Phase 2 section.
- **Dashboard never queries request_logs directly:** All dashboard data flows through 3 materialized views (hourly_cost_summary, hourly_latency_percentiles, daily_model_breakdown). Plans 02-03+ use `prisma.$queryRaw` on the views only.
- **Rate card cache TTL = 1 minute:** Module-scoped cache in calculator.ts avoids per-request DB round-trip. Serverless function restarts reset cache naturally.
- **calculateCost returns 0 on missing card (not error):** Allows request logging to succeed even for unknown model IDs. Plans 02-02+ should log costUsd=0 and handle rateCardFound=false in monitoring.

### Decisions from 02-02

- **AI SDK 6 maxOutputTokens (not maxTokens):** `streamText()` parameter renamed. FallbackChainConfig keeps `maxTokens` for DB field name compatibility; streamText() call uses `maxOutputTokens`.
- **StreamTextResult.text is PromiseLike<string>:** No `.catch()` on PromiseLike. Must use `Promise.resolve(result.text).catch()` in after() callbacks.
- **exactOptionalPropertyTypes — conditional spread pattern:** `...(value ? { key: value } : {})` for all optional fields in streamText(), Prisma create(), and logRequest() to satisfy TypeScript strict optional types.
- **registry.languageModel() type assertion:** Dynamic modelId from DB is `string`; registry expects template literal union. Cast as `` `openai:${string}` | `anthropic:${string}` | `google:${string}` `` at call site.
- **Prisma optional fields: null not undefined:** All optional Prisma fields use `?? null` coercion in logRequest() — Prisma optional fields are `string | null`, not `string | undefined`.
- **cachedTokens from inputTokenDetails.cacheReadTokens:** AI SDK 6 caches token count accessed via `usage.inputTokenDetails?.cacheReadTokens` (not a top-level `cachedTokens` property).

### Decisions from 02-03

- **Dashboard route restructure:** `(dashboard)/page.tsx` is at URL `/` (not `/dashboard`) because route groups add no URL segment. Real dashboard at `(dashboard)/dashboard/page.tsx` → URL `/dashboard`. Old placeholder replaced with redirect.
- **Middleware public dashboard:** `/dashboard` removed from `isProtectedRoute`. Dashboard is read-only public access. API routes, settings, prompts, playground remain protected.
- **Prisma.sql for dynamic fragments:** Dynamic SQL clauses (provider filter) use `Prisma.sql` template tags + `Prisma.empty` for no-op case. `$queryRaw` called in function form `prisma.$queryRaw(Prisma.sql\`...\`)` to allow fragment interpolation. Nested `$queryRaw` is prohibited.
- **Latency panel aggregation:** `fetchLatencyPercentiles` returns per-provider rows. `@latency/page.tsx` averages p50/p95/p99 across providers per bucket before passing to LatencyChart (which shows system-level trend, not per-provider).
- **Dynamic import ssr:false pattern:** All 4 Recharts chart components dynamically imported with `ssr: false` in slot pages to prevent ResponsiveContainer zero-dimension SSR failure.
- **Zustand skipHydration:** `persist({ skipHydration: true })` in dashboard-filter store. FilterBar calls `useDashboardFilterStore.persist.rehydrate()` in `useEffect` to avoid SSR/client mismatch.

### Decisions from 02-04

- **Server Action try/catch for requireRole():** In Server Actions called from `"use client"` components, uncaught errors from `requireRole()` propagate as generic failures. Wrap in try/catch and return `{ error: string }` to give the form a displayable error message.
- **ESLint relaxed rules for prisma/:** Added `"prisma/**"` to the eslint.config.mjs relaxed-rules override (`no-console: off`). Seed scripts need console.log for progress reporting; `--max-warnings=0` caused pre-commit failures without this.
- **'error' in result for discriminated union narrowing:** Server Actions return `{ success: true } | { error: string }`. Use `'error' in result` (not `result.error`) to correctly narrow TypeScript union and avoid false negatives on empty-string errors.

### Decisions from 03-01

- **PromptTemplate/PromptVersion use UUID PKs:** `request_logs.prompt_version_id` is type UUID. Using TEXT (cuid) for version IDs would cause FK type mismatch. Both models use `@default(dbgenerated("gen_random_uuid()")) @db.Uuid`.
- **activeVersionId has @unique constraint:** Prisma 7 requires @unique on the FK side of a one-to-one relation. Each version can only be active for one template at a time — semantically correct.
- **Migration applied via Node.js pg client:** `prisma migrate dev` fails with "Tenant or user not found" on pooler URL. Direct Supabase host (`db.ksrmiaigyezhvuktimqt.supabase.co:5432`) with plain `postgres` username works. No `_prisma_migrations` table — track migrations in git.
- **lint-staged --no-stash flag:** lint-staged's git stash backup fails with many untracked planning files. `--no-stash` flag in pre-commit hook skips backup and allows commit to proceed.
- **createPromptVersion sets version: 0 as placeholder:** PostgreSQL BEFORE INSERT trigger `assign_prompt_version` overwrites with the correct per-template incremented value. Prisma requires a non-null value at the app layer.
- **Version ID type fix for modelConfig:** Prisma's Json field requires `Prisma.InputJsonValue`, not `Record<string, unknown>`. Use `import type { Prisma }` and cast at call site.

### Decisions from 03-03

- **@ai-sdk/react for useCompletion:** AI SDK 6 does NOT export `useCompletion` from the main `ai` package. Must install `@ai-sdk/react` and import from there. The plan referenced `ai/react` which doesn't exist.
- **toTextStreamResponse() + streamProtocol: text:** `useCompletion` with `streamProtocol: 'data'` + `toUIMessageStreamResponse()` renders garbled JSON in the response panel. Use `toTextStreamResponse()` on server + `streamProtocol: 'text'` on client for clean streaming. Phase 4 consumers of `/api/v1/chat` must match this.
- **useMemo for token count:** TokenCounter uses `useMemo` not `useEffect + setState` to count tokens. ESLint `react-hooks/set-state-in-effect` blocks synchronous setState inside useEffect.
- **Next.js Link for internal nav:** ESLint rule `@next/next/no-html-link-for-pages` requires `<Link>` from `next/link` for all internal routes — `<a href>` is only for external URLs.

### Decisions from 04-01

- **RateLimiterInterface abstraction:** PostgresRateLimiter is the Phase 4 default. `getRateLimiter()` singleton at `src/lib/rate-limiter/index.ts` is the ONLY import call sites use. Upstash Redis is the named upgrade path — swap one line in index.ts, zero call-site changes.
- **PL/pgSQL token bucket (no Upstash):** `check_rate_limit()` function: atomic UPDATE + RETURNING + INSERT ON CONFLICT for concurrent-safe initialization. ~10-15ms per call. Bucket ID format: `apikey:{uuid}:rpm`.
- **Four-stage degradation before 429:** Stage 1=queue 10s, Stage 2=fallback model (FALLBACK_MODEL_MAP), Stage 3=response_cache lookup, Stage 4=429 with Retry-After. Every transition logged to `rate_limit_events`.
- **Rate limiting skips unauthenticated requests:** Only `Authorization: Bearer {key}` requests are rate-limited. Dashboard/playground demo traffic without API keys bypasses degradation chain entirely.
- **SHA-256 prompt hash for cache key:** Normalized (trim+lowercase+whitespace-collapse) prompt hashed to hex string. Composite unique key `(prompt_hash, model)` in `response_cache`. TTL default 24h.
- **exactOptionalPropertyTypes requires conditional spread in setCachedResponse opts:** When calling functions with optional number fields, must use `...(val !== undefined ? { key: val } : {})` not `{ key: val }` (val may be undefined).
- **Stage 2 fallback uses same API key bucket:** Simplification for demo — production would use per-model buckets. Means if bucket is deeply negative, both Stage 1 and Stage 2 fail, progressing to Stage 3.

### Decisions from 04-02

- **constants.ts for browser-safe shared state:** STAGE_CONFIG and DegradationEvent/DegradationChain interfaces live in `src/lib/degradation/constants.ts` (no prisma imports). Client components import from constants.ts; queries.ts (server-only) imports from constants.ts and re-exports. Prevents webpack from bundling pg/tls into client bundle.
- **export const revalidate = 0 instead of export const dynamic:** Server Component pages that also use `import dynamic from 'next/dynamic'` MUST use `revalidate = 0` for force-dynamic behavior. Using both `import dynamic` and `export const dynamic` causes a naming conflict/build error.
- **Per-feature lazy.tsx pattern:** Each feature with Recharts components gets its own `components/lazy.tsx` ("use client" file) that exports `dynamic(..., { ssr: false })` wrappers. The Server Component page imports from lazy.tsx. Never call next/dynamic with ssr:false directly in a Server Component (Pitfall 18).
- **30-second chain grouping window:** Events within 30s for the same API key are grouped into one DegradationChain. Heuristic for demo — production would use a request_id FK column on rate_limit_events.
- **Recharts Tooltip formatter types:** Use `(value: unknown, name: unknown)` signature for Tooltip formatter in Recharts. The `name` param is `string | undefined` and overloads are strict. Avoid labelFormatter in strict TypeScript mode.

### Decisions from 05-02

- **Raw SQL for evaluation-request joins:** EvaluationScore has no Prisma relation to RequestLog (partitioned table, no FK constraints). All queries needing request metadata use `prisma.$queryRaw` with `LEFT JOIN request_logs r ON e.request_id = r.id`. Same pattern as rate_limit_events.
- **Server Action try/catch return pattern:** approveScore/overrideScore return `{ success: true } | { error: string }`. Client uses `'error' in result` discriminated union. Follows 02-04 pattern.
- **Per-feature lazy.tsx for EvalTrend:** `src/components/evaluation/lazy.tsx` exports `EvalTrendLazy` with `ssr: false`. Server Component page imports from lazy.tsx. Follows 04-02 per-feature pattern.
- **Recharts Tooltip formatter: `(v: number | undefined)`:** Matches established pattern from CostTrendChart/LatencyChart. Avoid `(value: unknown, name: unknown)` signature which causes type errors.

## Last Deploy

- Status: DEPLOYED
- Platform: Vercel
- Environment: Production
- URL: https://c1-ai-observability-platform.vercel.app
- Timestamp: 2026-03-01T12:22:00Z
- Risk score: 33/100 (MEDIUM)
- Git SHA: ae3c024
- Monitoring: ACTIVE (24h health check window)

## Blockers

No current blockers.

## Checkpoints Pending

No pending checkpoints.

## Checkpoint Files

No checkpoint files.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-01)

**Core value:** Ship AI that works in production, not just in notebooks.
**Current focus:** ALL PHASES COMPLETE -- 16/16 plans done across 5 phases

## Configuration

- **Mode:** Autonomous
- **Depth:** Thorough
- **Model Profile:** Budget (sonnet for all agents)
- **Workflow:** Sequential (research-all → analyze-research → plan-all)
- **Prototype Mode:** Active (demo-ready after Phase 2)

## Session Continuity

**Last session:** 2026-03-02
**Stopped at:** Phase 5 Plan 05-03 complete -- Alert engine with tables, PL/pgSQL function, HMAC webhook dispatch, UI, and seed data
**Resume file:** None -- ALL PHASES COMPLETE (16/16 plans)

## Next Steps

**All 5 phases complete.** The AI Ops Dashboard portfolio demo is feature-complete.

**Recommended next actions:**
1. Run `pnpm db:seed` to populate seed data with Phase 5 evaluation + alert data
2. Deploy to production: `vercel --prod`
3. Verify /alerts and /alerts/rules pages in production
4. Configure pg_cron alert jobs in Supabase SQL Editor (see prisma/migrations/pg_cron_alerts.sql)

**Key additions from 04-02 for 04-03:**
- Degradation queries: `import { getDegradationEvents, groupIntoChains, getDegradationStats } from '@/lib/degradation/queries'`
- Degradation constants (browser-safe): `import { STAGE_CONFIG } from '@/lib/degradation/constants'`
- Types: `import type { DegradationEvent, DegradationChain } from '@/lib/degradation/constants'`
- REST: `GET /api/v1/degradation?format=chains&window=60` — returns chains, stats, eventCount
- REST: `GET /api/v1/degradation/[eventId]` — single event with apiKey relation
- Page: `/dashboard/degradation` — Server Component, revalidate=0
- Pattern (constants.ts): shared STAGE_CONFIG + interfaces live in constants.ts (no prisma) — client components import from there to avoid tls module error
- Pattern (lazy.tsx): per-feature lazy.tsx as "use client" wrapper for next/dynamic ssr:false
- Pattern (revalidate=0): use `export const revalidate = 0` NOT `export const dynamic = 'force-dynamic'` when page also uses `import dynamic from 'next/dynamic'`

**Key additions from 04-01 for 04-02/04-03:**
- Rate limiter: `import { getRateLimiter } from '@/lib/rate-limiter'`
- Degradation chain: `import { runDegradationChain } from '@/lib/rate-limiter'`
- Response cache: `import { getCachedResponse, setCachedResponse, hashPrompt } from '@/lib/rate-limiter'`
- Tables for 04-02 viz: `rate_limit_events` (stage 1-4 rows), `rate_limit_buckets` (current token state), `response_cache` (hit count)
- Interface types: `import type { RateLimiterInterface, RateLimitResult, DegradationResult } from '@/lib/rate-limiter'`
- Migration applied: direct pg client to db.ksrmiaigyezhvuktimqt.supabase.co:5432 (same pattern as 03-01)
- Rate limiting skips requests without Authorization header (unauthenticated playground traffic unaffected)

**Key handoff context for Phase 3:**
- Config UI: `import { updateEndpointConfig } from '@/app/(dashboard)/config/actions'`
- Seed data: run `pnpm db:seed` after DB migrations to populate 10K rows
- seedBaseData(): `import { seedBaseData } from 'prisma/seed'` — Phase 5 extends this
- Model router: `import { streamWithFallback, loadEndpointConfig } from '@/lib/model-router/router'`
- Registry: `import { registry } from '@/lib/model-router/registry'`
- Logger: `import { logRequest } from '@/lib/logging/request-logger'` — only call from after() callbacks
- Materialized views: NEVER query request_logs directly — use hourly_cost_summary, hourly_latency_percentiles, daily_model_breakdown
- Dashboard is PUBLIC: /dashboard not in isProtectedRoute — no auth required
- /config is PROTECTED: requires auth + DEVELOPER role (both middleware + requireRole guard)
- Dashboard queries: `import { fetchCostSummary, fetchLatencyPercentiles, fetchDailyModelBreakdown, fetchRequestVolume } from '@/lib/dashboard/queries'`
- Filter store: `import { useDashboardFilterStore } from '@/stores/dashboard-filter'`
- Chart components: `import { CostTrendChart, LatencyChart, ModelPieChart, RequestVolumeChart } from '@/components/charts'`
- Dynamic import pattern: `import dynamic from 'next/dynamic'` with `ssr: false` for all Recharts wrappers
- Prisma.sql pattern: use `Prisma.sql` + `Prisma.empty` for dynamic SQL fragments (no nested $queryRaw)
- Token properties: `usage.inputTokens`, `usage.outputTokens`, `usage.inputTokenDetails.cacheReadTokens`
- maxOutputTokens: AI SDK 6 renamed maxTokens to maxOutputTokens in streamText()
- Optional fields: use conditional spread `...(val ? { key: val } : {})` not `val: undefined`
- Lint script: `pnpm lint` = `eslint src/` (not `next lint`)
- ESLint relaxed rules: prisma/** has no-console off (seed scripts can use console.log)
- Pre-commit hooks active: ESLint + Prettier run on every commit automatically
- Auth helpers: `import { requireAuth, requireRole } from '@/lib/auth/guards'`
- Server Action role guard pattern: wrap requireRole() in try/catch, return { error } not throw
- Prisma client: `import { prisma } from '@/lib/db/prisma'`

---

**Key additions from 03-01 for 03-02/03-03:**
- Prompt queries: `import { getTemplates, getTemplateWithVersions, getVersion, getTwoVersionsForDiff } from '@/lib/prompts/queries'`
- Prompt actions: `import { createPromptTemplate, createPromptVersion, rollbackToVersion } from '@/lib/prompts/actions'`
- Variable utils: `import { extractVariables, interpolateVariables } from '@/lib/prompts/variables'`
- REST endpoints: GET/POST /api/v1/prompts, POST /api/v1/prompts/[id]/rollback
- Chat extension: POST /api/v1/chat accepts promptVersionId + modelId for playground routing
- Migration auth: Use postgres:REDACTED@db.ksrmiaigyezhvuktimqt.supabase.co:5432 for direct SQL

---

**Key additions from 03-02 for 03-03:**
- Prompt UI routes: /prompts, /prompts/new, /prompts/[slug], /prompts/[slug]/new-version, /prompts/[slug]/diff
- PromptEditor (SSR-safe): `import { PromptEditor } from '@/components/prompts/PromptEditor'` — CodeMirror 6 with amber {{var}} highlighting
- Playground link: /prompts/[slug] has "Test in Playground" button → `/playground?promptVersionId=UUID`
- Query additions: `getTemplateWithVersionsBySlug(slug)`, `getTwoVersionsByIds(v1Id, v2Id)` added to queries.ts
- getTemplates() now includes `versions: { take: 1 }` (latest version number for list view)
- @requests panel: has prompt version filter dropdown (URL param: ?promptVersionId=UUID)

---

**Key additions from 03-03 for Phase 4:**
- Playground: `/playground?promptVersionId=UUID` — streaming test environment for prompt versions
- Playground components: `import { PlaygroundForm } from '@/components/playground/PlaygroundForm'`
- Token counter: `import { TokenCounter } from '@/components/playground/TokenCounter'`
- Model selector: `import { ModelSelector } from '@/components/playground/ModelSelector'`
- Stream format: `/api/v1/chat` now uses `toTextStreamResponse()` — consumers must use `streamProtocol: 'text'`
- @ai-sdk/react 3.0.107 installed — provides `useCompletion` hook for React streaming
- Nav: Prompts + Playground links added to `src/components/layout/nav.tsx`

---

---

**Key additions from 04-03 for Phase 5:**
- A/B service: `import { getActiveExperiment, runExperiment } from '@/lib/ab-testing/experiment-runner'`
- SPRT engine: `import { initSPRT, checkSPRT, updateSPRTProportions, computeSequentialZTest } from '@/lib/ab-testing/sprt'`
- Metrics: `import { computeVariantStats, recordVariantObservation } from '@/lib/ab-testing/metrics'`
- Hash: `import { fnv1a32, assignVariant } from '@/lib/ab-testing/hash'`
- REST endpoints: GET/POST /api/v1/experiments, GET/PATCH /api/v1/experiments/[id], GET /api/v1/experiments/[id]/metrics
- UI: /experiments (list), /experiments/[id] (SPRT chart + variant metrics table + controls)
- Nav: Experiments link added to nav.tsx at `/experiments`
- Phase 5 eval hook: `prisma.variantMetric.update({ data: { evalN: { increment: 1 }, evalScoreSum: { increment: overallScore } } })` after judge evaluation
- SPRT boundaries locked: upper ≈ 2.773, lower ≈ -1.558 (α=0.05, β=0.20)
- Experiment cache invalidated on auto-stop (cacheExpiry = 0)
- experiment_variants.prompt_version_id is UUID type (FK to prompt_versions.id)

---

**Key additions from 05-02 for 05-03:**
- Server Actions: `import { approveScore, overrideScore } from '@/app/actions/evaluation'`
- REST: `GET /api/v1/evaluation/scores?page=1&pageSize=50&days=30` — paginated scores with request metadata
- Components: ScoreDisplay, QueueStats, ReviewInteractionPanel (Client Island), EvalTrend (via lazy.tsx)
- Routes: /evaluation (overview), /evaluation/review (queue)
- Nav: Evaluation link added to nav.tsx at `/evaluation`
- Pattern: raw SQL with LEFT JOIN for evaluation-request queries (no Prisma relation to partitioned request_logs)
- Pattern: `(v: number | undefined) => [formatted, label]` for Recharts Tooltip formatter
- Pattern: Server Action returns `{ success: true } | { error: string }`, client checks `'error' in result`

---

**Key additions from 05-01 for Phase 5 plans 02-03:**
- Evaluator: `import { judgeRequest, safeJudgeRequest, maybeQueueEvaluation, buildRubricText } from '@/lib/evaluator'`
- Schema: evaluation_rubrics, evaluation_jobs, evaluation_scores tables (migration 20260302000000)
- Default rubric: "General Quality Rubric v1" (accuracy 40%, coherence 30%, safety 30%) — seeded
- Internal processor: `POST /api/internal/process-evaluations` with `x-internal-secret` header
- MSW mocks: `import { server } from '@/mocks/node'` — intercepts `/v1/responses` (Responses API)
- Env: `INTERNAL_CRON_SECRET` (optional, min 32 chars) added to env.ts
- FNV-1a sampling: `maybeQueueEvaluation(requestId, 0.1)` in chat route after() callback
- No FK on request_id columns — partitioned table constraint (same as rate_limit_events)
- Variant metrics update: uses assignVariant() to re-derive variant (no experimentVariantId column)
- MSW format: @ai-sdk/openai v3 uses Responses API (/v1/responses), not /v1/chat/completions
- pg_cron setup: `prisma/migrations/20260302000000_phase5_evaluation_tables/pg_cron_eval.sql`

---

### Decisions from 05-03

- **Auth pattern in Server Actions:** Use `import { getSession } from '@/lib/auth/session'` with `session?.userId` check. The plan's `auth()` does not exist in this codebase.
- **Server Action return pattern:** `{ success: true } | { error: string }` with try/catch wrapping. Client uses `'error' in result` for discriminated union. Matches 05-02 pattern.
- **Seed functions accept PrismaClient parameter:** `seedEvaluations(prisma)` and `seedAlerts(prisma)` take explicit PrismaClient to isolate from Next.js runtime (seed runs via `tsx prisma/seed.ts`).
- **src/db/seed/ ESLint relaxation:** Added `"src/db/seed/**"` to eslint.config.mjs relaxed-rules override (no-console: off). Seed scripts need console.log for progress reporting.
- **startTransition void return:** Wrap Server Action calls in `async () => { await action(); }` to satisfy React's `() => void | Promise<void>` type requirement when actions return discriminated unions.
- **Alert seed dates are relative:** Computed from `now() - 30 days` (seed start) rather than hardcoded calendar dates, keeping the day-15 incident story consistent regardless of when seed runs.

---

**Key additions from 05-03:**
- Alert services: `import { runAlertCheck } from '@/lib/alerts/check'`, `import { dispatchWebhook } from '@/lib/alerts/dispatch'`
- Schema: alert_rules, alert_history tables (migration 20260302100000)
- PL/pgSQL: `check_alert_rules()` function -- uses duration_ms and SUM(cost_usd) per ANALYSIS-REPORT C2/C3
- Internal route: `POST /api/internal/check-alerts` with x-internal-secret header (INTERNAL_CRON_SECRET)
- pg_cron setup: `prisma/migrations/pg_cron_alerts.sql` (pg_cron + pg_net + Vault configuration)
- Server Actions: acknowledgeAlert, resolveAlert, createAlertRule, toggleAlertRule, deleteAlertRule, testWebhook at `src/app/actions/alerts.ts`
- Components: AlertStatusBadge, AlertHistoryTable (Client Island), AlertRuleForm (Client Island)
- Routes: /alerts (history with acknowledge/resolve), /alerts/rules (CRUD form + rule list)
- Nav: Alerts link added to nav.tsx at `/alerts`
- Seed: `src/db/seed/evaluations.ts` (FNV-1a 10% sample, score distribution), `src/db/seed/alerts.ts` (3 rules + 3 history events)
- Updated `prisma/seed.ts`: seedBaseData() then seedEvaluationAndAlerts()

---

*Last updated: 2026-03-02*
*Updated by: /gsd:execute-phase 5 -- Plan 05-03 complete (alert tables, check_alert_rules() PL/pgSQL, HMAC webhook dispatch, alert UI, seed data)*
