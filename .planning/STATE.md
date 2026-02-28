# Project State

**Project:** AI Ops Dashboard — Production LLM Monitoring
**Milestone:** Portfolio Demo
**Updated:** 2026-03-01

## Current Position

**Status:** Roadmap created
**Phase:** Phase 1 — Foundation (not started)
**Plan:** —
**Task:** —

## Progress

### Milestone Progress

| Phase | Name | Status | Plans | Notes |
|-------|------|--------|-------|-------|
| 1 | Foundation | Pending | 0/3 | Auth skeleton, CI/CD, dual connection strings |
| 2 | Working Demo | Pending | 0/4 | Core value demo, seed data, real-time dashboard |
| 3 | Prompt Management + Playground | Pending | 0/3 | Versioning, diff view, streaming playground |
| 4 | Reliability + Differentiators | Pending | 0/3 | Rate limiting, degradation viz, A/B testing |
| 5 | Evaluation + Alerts | Pending | 0/3 | Judge LLM pipeline, review queue, alerting |

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
- **SPRT for A/B auto-stop:** Sequential Probability Ratio Test, not repeated t-tests; minimum 200 samples per variant before any significance check — Phase 4 (needs-research during plan-phase)
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

**Recommended:** `/gsd:research-all`
**Reason:** Sequential workflow enabled. Research all phases first with cross-phase context accumulation, then analyze for conflicts, then plan all phases with full cross-phase awareness.

---

*Last updated: 2026-03-01*
*Updated by: /gsd:new-project (roadmap creation)*
