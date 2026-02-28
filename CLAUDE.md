# AI Ops Dashboard — Production LLM Monitoring

## Project Overview

Production-grade AI operations dashboard for monitoring LLM integrations. Portfolio demo for Upwork freelance positioning.

**Stack:** Next.js 15, TypeScript, Vercel AI SDK 6, Supabase, Prisma 7, Recharts 3, Tailwind CSS 4, Zustand 5
**Deploy:** Vercel

## Key Decisions

- Vercel AI SDK 6 replaces LangChain (3-way research consensus)
- Dual-client DB: Prisma for CRUD, Supabase client for hot-path writes and Realtime
- Materialized views for dashboard queries — never scan raw request_logs
- PostgreSQL token bucket for rate limiting (Upstash Redis as upgrade path)
- Fire-and-forget logging via Next.js 15 `after()` API
- SPRT (not repeated t-tests) for A/B auto-stop

## Codebase Navigation

### Planning Toolkit
- `.planning/toolkit/toolkit.db` — SQLite database for decisions, patterns, errors, health checks, dependencies, and analytics
- `.planning/toolkit/dependencies/phase-graph.json` — Phase dependency graph (DAG) with critical path
- `.planning/toolkit/requirements.json` — Machine-readable requirements baseline with status tracking
- `.planning/toolkit/memory/` — Persistent memory store: `decisions/`, `patterns/`, `errors/`
- `.planning/toolkit/health/` — Health check baselines and results
- `.planning/toolkit/analytics/` — Execution analytics and metrics
- `.planning/toolkit/adr/` — Architecture Decision Records (ADR-0001+)

### Planning Artifacts
- `.planning/PROJECT.md` — Project vision, core value, constraints
- `.planning/REQUIREMENTS.md` — Requirements with REQ-IDs and traceability
- `.planning/ROADMAP.md` — Phase-based roadmap with dependency ordering
- `.planning/STATE.md` — Current project state and progress
- `.planning/config.json` — Project configuration (profile, effort, workflow)
- `.planning/research/` — Research artifacts: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, SUMMARY.md
- `.planning/phases/{NN}-{name}/` — Per-phase context, plans, and summaries
