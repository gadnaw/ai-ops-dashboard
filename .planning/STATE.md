# Project State

**Project:** AI Ops Dashboard — Production LLM Monitoring
**Milestone:** Portfolio Demo
**Updated:** 2026-03-01

## Current Position

**Status:** Phase 1 in progress — Plan 01-01 complete
**Phase:** Phase 1 — Foundation (in progress)
**Plan:** 01-01 complete, 01-02 next
**Task:** —
**Last activity:** 2026-03-01 — Completed 01-01 Scaffold (4/4 tasks)

## Progress

```
Phase 1 ██░░░ 1/3 plans complete
Phase 2 ░░░░░ 0/4 plans complete
Phase 3 ░░░░░ 0/3 plans complete
Phase 4 ░░░░░ 0/3 plans complete
Phase 5 ░░░░░ 0/3 plans complete
Overall: 1/16 plans complete (6%)
```

### Milestone Progress

| Phase | Name | Status | Plans | Notes |
|-------|------|--------|-------|-------|
| 1 | Foundation | In Progress | 3/3 | Scaffold done, Auth+RBAC + DevOps pending |
| 2 | Working Demo | Planned | 4/4 | Data layer, Model router, Dashboard UI, Config+Seed — 24 tasks |
| 3 | Prompt Management + Playground | Planned | 3/3 | Prompt service, Prompt UI, Playground — 7 tasks |
| 4 | Reliability + Differentiators | Planned | 3/3 | Rate limiter, Degradation viz, A/B testing — 8 tasks |
| 5 | Evaluation + Alerts | Planned | 3/3 | Eval service, Human review, Alert engine — 9 tasks |

### Current Phase Detail

**Phase 1: Foundation** — Plan 01-01 complete.

| Plan | Status | Tasks | Last Commit |
|------|--------|-------|-------------|
| 01-01 Scaffold | Complete | 4/4 | 97fe70b |
| 01-02 Auth+RBAC | Ready | 5 | — |
| 01-03 DevOps | Ready | 4 | — |

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

### New Decisions from 01-01

- **Prisma 7 adapter pattern:** Prisma 7 removes `url`/`directUrl` from `schema.prisma`. Use `prisma.config.ts` with `defineConfig({ datasource: { url: DIRECT_URL } })` for migrations. Runtime uses `@prisma/adapter-pg` + `pg.Pool` with `DATABASE_URL` (pooled). ALL downstream plans must use `import { prisma } from '@/lib/db/prisma'` — no other PrismaClient instantiation.
- **Next.js version:** Installed as Next.js 16.1.6 (latest). Full API compatibility with Next.js 15 maintained.
- **Zod 4 URL validation:** `z.url()` (standalone) used in env.ts — more ergonomic than `z.string().url()` in Zod 4.
- **Testing stack:** Vitest 4 + jsdom (NOT vitest-environment-jsdom which doesn't exist). @playwright/test 1.58.2.

## Blockers

No current blockers.

## Checkpoints Pending

No pending checkpoints.

## Checkpoint Files

No checkpoint files.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-01)

**Core value:** Ship AI that works in production, not just in notebooks.
**Current focus:** Phase 1 — Plan 01-02 Auth+RBAC is next

## Configuration

- **Mode:** Autonomous
- **Depth:** Thorough
- **Model Profile:** Budget (sonnet for all agents)
- **Workflow:** Sequential (research-all → analyze-research → plan-all)
- **Prototype Mode:** Active (demo-ready after Phase 2)

## Session Continuity

**Last session:** 2026-03-01 14:45 UTC
**Stopped at:** Completed 01-01-PLAN.md (4/4 tasks)
**Resume file:** None — continue with Plan 01-02

## Next Steps

**Recommended:** Execute Plan 01-02 (Auth+RBAC)
**Command:** `/gsd:execute-phase 1` (will pick up 01-02 next)

**Key handoff context for Plan 01-02:**
- PrismaClient singleton: `import { prisma } from '@/lib/db/prisma'`
- Prisma 7 runtime: @prisma/adapter-pg with pg.Pool (DATABASE_URL pooled)
- Prisma 7 migrations: `pnpm db:migrate:dev` uses DIRECT_URL from prisma.config.ts
- Route groups ready: `(auth)` for login/signup, `(dashboard)` for protected pages
- Testing: `pnpm test:run` runs Vitest (2 tests passing)

---

*Last updated: 2026-03-01*
*Updated by: /gsd:execute-phase — Plan 01-01 complete*
