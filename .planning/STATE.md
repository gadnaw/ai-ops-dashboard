# Project State

**Project:** AI Ops Dashboard — Production LLM Monitoring
**Milestone:** Portfolio Demo
**Updated:** 2026-03-01

## Current Position

**Status:** Phase 2 in progress — 2/4 plans done
**Phase:** Phase 2 — Working Demo (in progress)
**Plan:** 02-02 complete
**Task:** —
**Last activity:** 2026-03-01 — Completed 02-02 Model Router (3/3 tasks)

## Progress

```
Phase 1 █████ 3/3 plans complete
Phase 2 ██░░░ 2/4 plans complete
Phase 3 ░░░░░ 0/3 plans complete
Phase 4 ░░░░░ 0/3 plans complete
Phase 5 ░░░░░ 0/3 plans complete
Overall: 5/16 plans complete (31%)
```

### Milestone Progress

| Phase | Name | Status | Plans | Notes |
|-------|------|--------|-------|-------|
| 1 | Foundation | Complete | 3/3 | Scaffold, Auth+RBAC, DevOps all done |
| 2 | Working Demo | In Progress | 2/4 | Data layer + Model router complete; Dashboard UI, Config+Seed remaining |
| 3 | Prompt Management + Playground | Planned | 3/3 | Prompt service, Prompt UI, Playground — 7 tasks |
| 4 | Reliability + Differentiators | Planned | 3/3 | Rate limiter, Degradation viz, A/B testing — 8 tasks |
| 5 | Evaluation + Alerts | Planned | 3/3 | Eval service, Human review, Alert engine — 9 tasks |

### Current Phase Detail

**Phase 1: Foundation** — All plans complete.

| Plan | Status | Tasks | Last Commit |
|------|--------|-------|-------------|
| 01-01 Scaffold | Complete | 4/4 | 97fe70b |
| 01-02 Auth+RBAC | Complete | 5/5 | 8be37a9 |
| 01-03 DevOps | Complete | 4/4 | eeeacc6 |

**Phase 2: Working Demo** — In progress.

| Plan | Status | Tasks | Last Commit |
|------|--------|-------|-------------|
| 02-01 Data Layer | Complete | 3/3 | 5feb694 |
| 02-02 Model Router | Complete | 3/3 | 75ab9dc |
| 02-03 Dashboard UI | Planned | — | — |
| 02-04 Config+Seed | Planned | — | — |

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

## Blockers

No current blockers.

## Checkpoints Pending

No pending checkpoints.

## Checkpoint Files

No checkpoint files.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-01)

**Core value:** Ship AI that works in production, not just in notebooks.
**Current focus:** Phase 2 Working Demo in progress — 02-02 Model Router complete

## Configuration

- **Mode:** Autonomous
- **Depth:** Thorough
- **Model Profile:** Budget (sonnet for all agents)
- **Workflow:** Sequential (research-all → analyze-research → plan-all)
- **Prototype Mode:** Active (demo-ready after Phase 2)

## Session Continuity

**Last session:** 2026-03-01
**Stopped at:** Completed 02-02-PLAN.md (3/3 tasks)
**Resume file:** None — continue with Phase 2 Plan 02-03

## Next Steps

**Recommended:** Execute Phase 2 Plan 02-03 (Dashboard UI)
**Command:** `/gsd:execute-phase 2` (plan 02-03)

**Key handoff context for Phase 2 remaining plans:**
- Database schema: apply migrations manually via Supabase SQL Editor (see 02-01-SUMMARY.md)
- pg_cron: must be enabled in Supabase Dashboard > Database > Extensions
- supabase/setup.sql: Phase 2 section must be run after migrations
- Model router: `import { streamWithFallback, loadEndpointConfig } from '@/lib/model-router/router'`
- Registry: `import { registry } from '@/lib/model-router/registry'`
- Logger: `import { logRequest } from '@/lib/logging/request-logger'` — only call from after() callbacks
- Materialized views: NEVER query request_logs directly in dashboard slots — use hourly_cost_summary, hourly_latency_percentiles, daily_model_breakdown
- Token properties: `usage.inputTokens`, `usage.outputTokens`, `usage.inputTokenDetails.cacheReadTokens`
- maxOutputTokens: AI SDK 6 renamed maxTokens to maxOutputTokens in streamText()
- Optional fields: use conditional spread `...(val ? { key: val } : {})` not `val: undefined`
- Lint script: `pnpm lint` = `eslint src/` (not `next lint`)
- Pre-commit hooks active: ESLint + Prettier run on every commit automatically
- Auth helpers: `import { requireAuth, requireRole } from '@/lib/auth/guards'`
- Prisma client: `import { prisma } from '@/lib/db/prisma'`

---

*Last updated: 2026-03-01*
*Updated by: /gsd:execute-phase — Plan 02-02 complete*
