# Project State

**Project:** AI Ops Dashboard — Production LLM Monitoring
**Milestone:** Portfolio Demo
**Updated:** 2026-03-01

## Current Position

**Status:** All phases planned — ready to execute
**Phase:** Phase 1 — Foundation (not started)
**Plan:** —
**Task:** —

## Progress

### Milestone Progress

| Phase | Name | Status | Plans | Notes |
|-------|------|--------|-------|-------|
| 1 | Foundation | Planned | 3/3 | Scaffold, Auth+RBAC, DevOps — 13 tasks |
| 2 | Working Demo | Planned | 4/4 | Data layer, Model router, Dashboard UI, Config+Seed — 24 tasks |
| 3 | Prompt Management + Playground | Planned | 3/3 | Prompt service, Prompt UI, Playground — 7 tasks |
| 4 | Reliability + Differentiators | Planned | 3/3 | Rate limiter, Degradation viz, A/B testing — 8 tasks |
| 5 | Evaluation + Alerts | Planned | 3/3 | Eval service, Human review, Alert engine — 9 tasks |

### Current Phase Detail

**Phase 1: Foundation** — Ready to execute.

| Plan | Status | Tasks | Last Commit |
|------|--------|-------|-------------|
| 01-01 Scaffold | Ready | 4 | d1c5ecc |
| 01-02 Auth+RBAC | Ready | 5 | d1c5ecc |
| 01-03 DevOps | Ready | 4 | d1c5ecc |

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

**Recommended:** `/gsd:execute-phase 1`
**Reason:** All 5 phases planned with 16 plans and ~61 tasks. Cross-phase constraints from ANALYSIS-REPORT.md incorporated into all plans. Begin execution with Phase 1 Foundation.

---

*Last updated: 2026-03-01*
*Updated by: /gsd:plan-all (all phases planned)*
