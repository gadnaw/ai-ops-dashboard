# Phase 2: Working Demo — Context

*Auto-generated from project research and roadmap. Review and edit before planning.*

## Phase Boundary

**Goal:** Deployable prototype demonstrating the core value: "Ship AI that works in production, not just in notebooks." A reviewer visits the URL, sees a live dashboard populated with 10K realistic requests showing cost trends, latency percentiles, fallback events, and model breakdowns — all without providing a single API key.

**Success Criteria:**
1. Deployed URL shows a populated dashboard with seed data — no login or API key required for demo view
2. Multi-model router falls back on 429/5xx and the fallback event appears in the dashboard within 30 seconds
3. Per-request cost (including cached tokens) is recorded and matches the dashboard cost breakdown
4. Model config UI changes take effect on the next request through that endpoint
5. `pnpm db:seed` populates 10K requests including the day-15 cost spike without timeout errors

## Requirements In Scope

| REQ-ID | Requirement |
|--------|-------------|
| INFRA-01 | Multi-model routing engine with configurable fallback chains (OpenAI, Claude, Gemini) |
| OBS-01 | Per-request cost and latency tracking with breakdown by model, prompt version, endpoint |
| OBS-02 | Real-time dashboard (cost trends, latency p50/p95/p99, error rates) via Recharts with 30s refresh |
| CONFIG-01 | Model configuration UI for temperature, max tokens, system prompts per endpoint |

## What's NOT In Scope

- PROMPT-01 (prompt versioning) — Phase 3
- DX-01 (playground) — Phase 3
- REL-01 (rate limiting/degradation) — Phase 4. The model router implements basic retry/fallback but NOT the full 4-stage degradation chain
- PROMPT-02 (A/B testing) — Phase 4
- EVAL-01 (evaluation) — Phase 5
- ALERT-01 (webhook alerts) — Phase 5
- PII redaction, batch evaluation, export — Deferred

## Technical Decisions

- **Vercel AI SDK 6** `createProviderRegistry()` for multi-model routing. NOT LangChain.
- **Provider adapters:** OpenAI (GPT-4o, GPT-4o-mini), Anthropic (Claude Sonnet 4, Haiku 3.5), Google (Gemini 2.5 Flash, Gemini 2.0 Flash)
- **Fallback chain:** Priority-based with exponential backoff + jitter on 429/5xx
- **Logging:** Fire-and-forget via `after()` — async, outside request critical path
- **Database schema:**
  - `request_logs` — range-partitioned on `created_at` by month
  - Materialized views: `hourly_cost_summary`, `hourly_latency_percentiles`, `daily_model_breakdown`
  - `pg_cron` refresh every 5 minutes
  - `dashboard_events` summary table for Supabase Realtime subscriptions
  - `cost_rate_cards` table for provider pricing (database, not constants)
  - `session_id` optional column on `request_logs` for future use
  - Composite indexes: `(created_at, provider, model)`, `(prompt_version_id, created_at)`
- **Dashboard architecture:**
  - Parallel routes (`@cost`, `@latency`, `@requests`, `@models`) for independent loading
  - Server Components fetch from materialized views
  - Client Islands only for Recharts charts, filter dropdowns, Realtime feeds
  - Zustand for filter state (time range, model filter) with `skipHydration` pattern
  - Server-side downsampling to 200-500 data points max
  - `isAnimationActive={false}` on all charts
- **Seed data:** 10K requests over 30 days with cost spike on day 15, fallback events, 60/25/15 model split, 5 prompt versions, 1-3% error rate, business-hours pattern

## Key Risks

- **Pitfall 2 (Serverless timeout):** CRITICAL — materialized views non-negotiable. Dashboard NEVER scans raw logs.
- **Pitfall 9 (Realtime fragility):** HIGH — subscribe to `dashboard_events`, not `request_logs`. Single channel with filters.
- **Pitfall 11 (Recharts performance):** HIGH — downsample server-side, disable animations.
- **Pitfall 5 (Server/client boundary):** HIGH — default Server Components, `"use client"` only on chart wrappers and filter components.
- **Pitfall 8 (Prisma N+1):** MEDIUM — use `$queryRaw` for time-bucketed aggregations, `groupBy` for dimensional breakdowns.

## Dependencies

- Phase 1 must be complete (auth, DB schema, deployment pipeline)

## Claude's Discretion

- Exact materialized view SQL (optimize for the specific chart queries)
- Recharts 3.x component configuration details
- Exact seed data distributions (follow the spec but tune for visual appeal)
- Dashboard layout and responsive behavior
- API route organization (`/api/v1/chat`, `/api/v1/models`, `/api/dashboard/*`)
- Whether to use ISR or full SSR for dashboard pages
