# Project State

**Project:** AI Ops Dashboard — Production LLM Monitoring
**Milestone:** Portfolio Demo
**Updated:** 2026-03-01

## Current Position

**Status:** Analysis complete — ready to plan
**Phase:** Phase 1 — Foundation (not started)
**Plan:** —
**Task:** —

## Progress

### Milestone Progress

| Phase | Name | Status | Plans | Notes |
|-------|------|--------|-------|-------|
| 1 | Foundation | Researched (skip) | 0/3 | Auth skeleton, CI/CD, dual connection strings |
| 2 | Working Demo | Researched | 0/4 | 1,360 lines — AI SDK 6, Recharts 3.x, mat views, Realtime |
| 3 | Prompt Management + Playground | Researched | 0/3 | 1,085 lines — useCompletion, diff, CodeMirror 6, triggers |
| 4 | Reliability + Differentiators | Researched | 0/3 | 1,881 lines — SPRT, token bucket, degradation, FNV-1a |
| 5 | Evaluation + Alerts | Researched | 0/3 | 1,802 lines — LLM-as-judge, pg_cron alerts, MSW, webhooks |

### Current Phase Detail

**Phase 1: Foundation** — Not yet started.

| Plan | Status | Tasks | Last Commit |
|------|--------|-------|-------------|
| 01-01 | Pending | — | — |
| 01-02 | Pending | — | — |
| 01-03 | Pending | — | — |

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

## Blockers

No current blockers.

## Checkpoints Pending

No pending checkpoints.

## Checkpoint Files

No checkpoint files.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-01)

**Core value:** Ship AI that works in production, not just in notebooks.
**Current focus:** Phase 1 — Foundation (scaffold, CI/CD, auth, dual connection strings, pre-commit security)

## Configuration

- **Mode:** Autonomous
- **Depth:** Thorough
- **Model Profile:** Budget (sonnet for all agents)
- **Workflow:** Sequential (research-all → analyze-research → plan-all)
- **Prototype Mode:** Active (demo-ready after Phase 2)

## Next Steps

**Recommended:** `/gsd:plan-all`
**Reason:** Research complete and cross-validated. 4 CRITICAL issues resolved, 18 cross-phase constraints documented in ANALYSIS-REPORT.md for planners. Ready to create execution plans.

---

*Last updated: 2026-03-01*
*Updated by: /gsd:analyze-research (analysis complete)*
