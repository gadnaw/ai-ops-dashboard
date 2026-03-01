# Roadmap: AI Ops Dashboard — Production LLM Monitoring

## Overview

This roadmap delivers a production-grade AI operations dashboard in five phases, structured as a prototype-first build. Phases 1-2 produce a deployable, seed-data-loaded demo that proves the core value ("ship AI that works in production") with zero configuration required by a viewer. Phases 3-5 complete the full feature set — prompt versioning, rate-limit degradation, A/B testing, evaluation pipeline, and anomaly alerting — transforming the demo into a portfolio artifact that covers every target Upwork job category.

## Prototype Mode

**Pre-contract phases (demo-ready after Phase 2):**
- Phase 1: Foundation — clean scaffold, CI/CD, auth skeleton
- Phase 2: Working Demo — core value deployable with seed data

**Full-build phases (complete portfolio artifact):**
- Phase 3: Prompt Management + Playground
- Phase 4: Reliability + Differentiators
- Phase 5: Evaluation + Alerts

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions created via `/gsd:insert-phase`

- [ ] **Phase 1: Foundation** — Clean scaffold with deployment pipeline and auth skeleton
- [ ] **Phase 2: Working Demo** — Core value deployable to shareable URL with seed data
- [ ] **Phase 3: Prompt Management + Playground** — Prompt versioning, diff view, rollback, and streaming playground
- [ ] **Phase 4: Reliability + Differentiators** — Graceful degradation + A/B testing with statistical significance
- [ ] **Phase 5: Evaluation + Alerts** — LLM-as-judge pipeline, human review queue, and anomaly alerting

---

## Phase Details

### Phase 1: Foundation

**Goal:** Clean scaffold with deployment pipeline. No features. Establishes the exact technical substrate every subsequent phase builds on — dual connection strings, server-only secrets, pre-commit security guards, and RBAC skeleton.

**Depends on:** Nothing (first phase)

**Requirements:** AUTH-01, SEC-01

**Research flag:** `skip-research` — Next.js 15 + Supabase + Prisma setup is extremely well-documented with official guides for every pattern used here.

**Pitfall mitigations built in:**
- Pitfall 1 (connection pooling): Set up dual connection strings from day one — `DATABASE_URL` (pooled, port 6543, `?pgbouncer=true`, `connection_limit=1`) for Prisma runtime and `DIRECT_URL` (direct, port 5432) for migrations. Configured in `schema.prisma` with `directUrl = env("DIRECT_URL")`.
- Pitfall 4 (API key exposure): Pre-commit hook that rejects any `NEXT_PUBLIC_.*KEY` pattern. All LLM provider calls routed through server-only API routes from the start. No exceptions.
- Pitfall 13 (RLS + Prisma): Document the access pattern split clearly — Prisma for all server-side data access with application-level auth checks, Supabase client for client-side real-time subscriptions only.

**Success Criteria** (what must be TRUE when Phase 1 completes):
1. Running `pnpm dev` starts the application locally with no errors; visiting `/` redirects unauthenticated users to `/login`.
2. Pushing a commit to `main` triggers a Vercel deployment that completes without errors and produces a live preview URL.
3. Attempting to commit a file containing `NEXT_PUBLIC_.*KEY` is blocked by the pre-commit hook with an actionable error message.
4. The folder structure (`src/app/`, `src/lib/`, `src/components/`, `prisma/`) and naming conventions are established and documented in a single architecture decision record.
5. `.env.example` lists every required environment variable with descriptions; no secrets are committed; `pnpm db:migrate` runs against Supabase without error using `DIRECT_URL`.

**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md — Scaffold: Next.js 15 + Tailwind 4 + TypeScript strict, Prisma schema with dual connection strings, Supabase project init, base folder structure
- [ ] 01-02-PLAN.md — Auth + RBAC: Supabase Auth, email + OAuth (GitHub, Google), Admin/Developer/Viewer roles, RLS policies, middleware auth guard
- [ ] 01-03-PLAN.md — DevOps: Vercel CI/CD, preview deployments on PRs, ESLint + Prettier + pre-commit hooks (secret detection, lint, type-check), .env.example

---

### Phase 2: Working Demo

**Goal:** Deployable prototype demonstrating the core value. A reviewer visits the URL, sees a live dashboard populated with 10K realistic requests showing cost trends, latency percentiles, fallback events, and model breakdowns — all without providing a single API key. The demo proves "ship AI that works in production" is not marketing copy.

**Depends on:** Phase 1

**Requirements:** INFRA-01, OBS-01, OBS-02, CONFIG-01

**Research flag:** `standard` — Recharts + Supabase Realtime + App Router parallel routes are well-documented patterns, though the Recharts 3.x API differs from most community examples (still on 2.x).

**Pitfall mitigations built in:**
- Pitfall 2 (serverless timeout): Materialized views refreshed by pg_cron every 5 minutes for all dashboard aggregations. `request_logs` table is range-partitioned on `created_at`. Composite indexes on `(created_at, provider, model)` and `(prompt_version_id, created_at)`. Dashboard page routes NEVER scan raw logs.
- Pitfall 9 (Realtime fragility): Subscribe to lightweight `dashboard_events` summary table, not `request_logs`. Single Supabase channel with filters per dashboard (not per widget). Connection health monitoring with status indicator. Manual refresh fallback button.
- Pitfall 11 (Recharts performance): Server-side downsampling to 200-500 points maximum before data reaches client. `isAnimationActive={false}` on all dashboard charts. Recharts 3.x API used exclusively (not 2.x patterns from community tutorials).
- Pitfall 5 (server/client boundary): Dashboard layout, data fetch, and aggregations in Server Components. Only chart wrappers, filter dropdowns, and real-time feed components carry `"use client"`.
- Pitfall 10 (Zustand hydration): `skipHydration: true` in persist options; manual `rehydrate()` in `useEffect`. Store initialized per-request via React Context + Zustand ref pattern, not as module-level singleton.
- Pitfall 8 (Prisma N+1): All dashboard aggregations use `$queryRaw` for time-bucketed and percentile queries. Prisma `groupBy` for dimensional breakdowns. `select` never `include` in dashboard routes.

**Seed data requirement:** `prisma/seed.ts` must generate:
- 10,000 requests spanning 30 days with log-normal latency distribution (p50 ~400ms, p95 ~1200ms, occasional spikes)
- Cost spike on day 15 (3x normal volume, visible in trend chart)
- Fallback events scattered throughout (primary model → fallback model chain with logged degradation reason)
- Requests spread across OpenAI GPT-4o, Claude 3.5 Sonnet, Gemini 2.5 Flash in realistic proportions (~60/25/15)
- 5 named prompt versions across 2-3 endpoints (summarization, classification, extraction)
- Error rate of 1-3% with realistic categorization (rate limit, timeout, model error)
- Business-hours traffic pattern (higher Mon-Fri 9am-6pm, lower evenings/weekends)

**Success Criteria** (what must be TRUE when Phase 2 completes):
1. Visiting the deployed Vercel URL without logging in shows a public demo dashboard — cost trends, latency p50/p95/p99 sparklines, model distribution chart, and request volume bar chart — all populated with seed data.
2. The multi-model router accepts a request via `POST /api/v1/chat`, routes it through the provider priority chain (OpenAI → Claude → Gemini), falls back automatically on 429/5xx, and the fallback event appears in the dashboard timeline within 30 seconds.
3. Per-request cost and latency (with full token breakdown including cached tokens) are recorded for every request through the router; the dashboard cost-by-model breakdown matches the sum of individual request costs.
4. The model configuration UI lets a user change temperature, max tokens, and system prompt for an endpoint; the next request through that endpoint uses the new configuration.
5. Running `pnpm db:seed` populates the database with 10K requests including the day-15 cost spike and fallback events; the dashboard renders the spike visually without timeout errors.

**Plans:** 4 plans

Plans:
- [ ] 02-01-PLAN.md — Data layer: `request_logs` partitioned table, materialized views (`hourly_cost_summary`, `hourly_latency_percentiles`, `daily_model_breakdown`), pg_cron refresh jobs, cost rate-card table, `dashboard_events` summary table, `endpoint_configs` table, cost calculator service
- [ ] 02-02-PLAN.md — Model router: Vercel AI SDK `createProviderRegistry()`, OpenAI + Anthropic + Google providers, priority-based fallback chains with exponential backoff + jitter, `after()` fire-and-forget logging with full usage object parsing (including cached tokens via `usage.inputTokens`/`usage.outputTokens`)
- [ ] 02-03-PLAN.md — Dashboard UI: App Router parallel routes (`@cost`, `@latency`, `@requests`, `@models`), Recharts 3.x charts (area/line/pie/bar), Supabase Realtime on `dashboard_events`, Zustand filter store (time range, model filter), skeleton loading states, connection status indicator, dynamic import with `ssr: false`
- [ ] 02-04-PLAN.md — Config UI + seed data: Model config management UI (temperature, max tokens, system prompts per endpoint), `prisma/seed.ts` with modular `seedBaseData()` + day-15 cost spike, `pnpm db:seed` script, public dashboard middleware update

---

### Phase 3: Prompt Management + Playground

**Goal:** Users can version, compare, and roll back prompt templates — and test them live with streaming responses. This phase completes the "prompt engineering workflow" loop: create a version, test it in the playground, compare it against prior versions in the dashboard, promote or roll back with one click.

**Depends on:** Phase 2

**Requirements:** PROMPT-01, DX-01

**Research flag:** `standard` — Prompt versioning CRUD with diff view is a solved problem (immutable snapshot pattern, established diff libraries). Streaming playground is a standard chat UI pattern via Vercel AI SDK `useChat`.

**Pitfall mitigations built in:**
- Pitfall 6 (streaming format inconsistency): Vercel AI SDK `streamText()` normalizes OpenAI / Anthropic / Google streaming formats automatically. No custom SSE parsers needed. Token usage reporting (input/output/cached) extracted from the SDK's unified response object.
- Pitfall 5 (server/client boundary): Prompt list and version history rendered as Server Components. Diff view, editor, and playground are Client Islands — only these carry `"use client"`.

**Success Criteria** (what must be TRUE when Phase 3 completes):
1. A user can create a named prompt version with template text containing `{{variable}}` syntax; the system extracts and displays variable names, and the version is stored as an immutable snapshot.
2. Selecting any two prompt versions shows a side-by-side diff with character-level changes highlighted; no version can be edited after creation (append-only model).
3. A user can roll back to any prior version with one click; the model router begins routing requests through the rolled-back version immediately, and the dashboard shows the version switch in the request timeline.
4. The request playground sends a message to any configured model/prompt combination, streams the response token-by-token with a live token counter, and the completed request appears in the dashboard's request log (proving playground requests flow through the production tracking pipeline).
5. All playground requests go through API routes — no LLM API keys appear in client-side JavaScript or browser network requests to external provider endpoints.

**Plans:** TBD

Plans:
- [ ] 03-01: Prompt manager service — `prompt_versions` table with immutable snapshots, `variables` JSONB column for extracted `{{var}}` names, version selection in model router, rollback API endpoint
- [ ] 03-02: Prompt UI — version list (Server Component), diff view (Client Island, character-level), create/rollback actions, prompt version filter in dashboard charts
- [ ] 03-03: Playground — streaming chat UI via Vercel AI SDK `useChat`, live token counter, model/prompt/parameter selectors, request logged through production pipeline, raw API response view for token count verification

---

### Phase 4: Reliability + Differentiators

**Goal:** The two features that no competitor demo includes at this level of polish: (1) four-stage graceful degradation with a timeline visualization showing every fallback event and its reason, and (2) A/B testing between prompt versions with automatic stopping when statistical significance is reached. Together they create the demo narrative — this is what production-grade AI infrastructure actually looks like.

**Depends on:** Phase 3 (A/B testing requires prompt versions to split between)

**Requirements:** REL-01, PROMPT-02

**Research flag:** `needs-research` — A/B testing auto-stop for LLM outputs requires Sequential Probability Ratio Test (SPRT) or group sequential design to avoid peeking bias. Standard fixed-sample t-tests do not support early stopping without inflating false positive rates. Research SPRT implementation during plan-phase.

**Pitfall mitigations built in:**
- Pitfall 7 (cost edge cases): Rate-limit degradation events log the full cost at each stage (queue time cost, fallback model cost differential); cached token costs parsed separately from standard input tokens.
- A/B peeking: Auto-stop uses sequential testing (SPRT), not repeated significance checks. Minimum sample size (200+ per variant) enforced before any significance check runs. Dashboard shows "insufficient data" state with sample count progress.
- Rate limiter interface: PostgreSQL token-bucket implementation is abstracted behind a `RateLimiter` interface so the storage backend is swappable to Upstash Redis without changing call sites.

**Success Criteria** (what must be TRUE when Phase 4 completes):
1. A request that exceeds the token-bucket rate limit progresses through the four-stage degradation chain — queue → fallback model → cached response → 429 with `Retry-After` — and each transition is logged with reason, timestamp, and latency at that stage.
2. The dashboard degradation timeline view shows fallback events as annotated markers on the request volume chart; clicking a marker reveals the full degradation chain for that request group.
3. A user can create an A/B test between two prompt versions with a configured traffic split (e.g., 70/30); the router correctly distributes requests according to the split ratio across a test run of 1000 requests (within ±3% of target split).
4. When one variant reaches statistical significance at 95% confidence (via SPRT sequential test), the A/B test auto-stops; the dashboard displays the winning variant, the confidence level, effect size, and per-variant breakdown (latency, cost, error rate).
5. A user can manually stop an A/B test at any time and promote the winning variant to the primary prompt version with one click.

**Plans:** TBD

Plans:
- [ ] 04-01: Rate limiter — PostgreSQL token-bucket behind `RateLimiter` interface, four-stage degradation chain (queue → fallback → cache → 429), `Retry-After` header, all degradation events logged to `rate_limit_events` table
- [ ] 04-02: Degradation visualization — timeline view component, fallback event markers on dashboard request volume chart, per-request degradation chain detail view
- [ ] 04-03: A/B testing framework — traffic split router, per-variant metrics accumulation, SPRT sequential significance calculator (research-informed), auto-stop at 95% confidence, minimum sample size guard (200+ per variant), A/B test management UI (create, monitor, stop, promote)

---

### Phase 5: Evaluation + Alerts

**Goal:** Complete the "production-ready AI ops" narrative with the infrastructure that separates systems that ship from systems that improve: automated quality scoring via LLM-as-judge with human review for disagreements, and webhook anomaly alerting so teams know about cost spikes and latency regressions before their customers do.

**Depends on:** Phase 4

**Requirements:** EVAL-01, ALERT-01

**Research flag:** `needs-research` — LLM-as-judge calibration, rubric design, and multi-dimension scoring are active research areas. Judge LLM selection (same provider vs. independent), score normalization, and human-judge disagreement thresholds need implementation decisions during plan-phase. Reference EVAL rubric from FEATURES.md as starting framework.

**Pitfall mitigations built in:**
- Pitfall 14 (LLM testing): Evaluation pipeline tested with recorded API response fixtures via MSW. Judge LLM calls are intercepted and replayed deterministically in tests. E2E tests verify that the review queue correctly surfaces requests, not that the judge LLM produces specific scores.
- Pitfall 16 (over-engineering): Evaluation starts with a single judge model, one rubric template, and three dimensions (accuracy, coherence, safety). Human review queue is a simple list with approve/override actions. No ML-based calibration in this phase.
- Pitfall 15 (demo data realism): Seed data updated in this phase to include evaluation scores, alert events (cost spike on day 15 triggers an alert), and a sample of human-reviewed requests in the queue. Demo must show at least one resolved alert.

**Success Criteria** (what must be TRUE when Phase 5 completes):
1. Any request routed through the system can be queued for evaluation; a judge LLM scores it on 1-5 scales for configured rubric dimensions (minimum: accuracy, coherence, safety) and stores the result linked to the original request log.
2. Requests where the judge LLM score is below a configurable threshold (e.g., accuracy < 3) automatically appear in the human review queue; a reviewer can approve the judge score, override it with a manual score, and add a note — all from the review queue UI.
3. A user can configure an alert rule — metric (cost/latency/error rate), threshold, sliding window (5m/15m/1h), and cooldown — and the system fires a POST to a configured webhook URL when the threshold is crossed; the alert appears in the dashboard alert history within one minute of the threshold being crossed.
4. Each alert has acknowledge and resolve workflow states; an acknowledged alert stops re-firing during the cooldown window; a resolved alert is marked with a timestamp and resolver note.
5. The dashboard shows evaluation score trends over time (per prompt version, per model) alongside the existing cost and latency charts, giving a single-screen view of cost + performance + quality.

**Plans:** TBD

Plans:
- [ ] 05-01: Evaluation service — judge LLM integration (configurable model), scoring rubric schema (multi-dimension 1-5), `evaluation_scores` table linked to `request_logs`, evaluation queue, automated trigger on request completion (configurable: all requests vs. sampled %)
- [ ] 05-02: Human review queue — review queue UI (Server Component list, Client Island for score override), approve/override/note actions, disagreement threshold configuration, bulk review actions
- [ ] 05-03: Alert engine — sliding-window threshold checks via pg_cron or Supabase scheduled functions, webhook dispatch with retry, configurable rules (metric, threshold, window, cooldown), acknowledge/resolve workflow, alert history in dashboard, seed data updated to include alert events

---

## Deferred Requirements

These requirements are documented but NOT mapped to any phase in this milestone. They are candidates for a future milestone.

| REQ-ID | Requirement | Deferral Reason |
|--------|-------------|-----------------|
| EVAL-02 | Batch evaluation mode for running prompt versions against test datasets with comparison reports | Higher complexity (test dataset management, batch job orchestration, report generation) — lower demo ROI than live evaluation pipeline |
| COMP-01 | Request/response logging with PII redaction (email, phone, configurable regex) and configurable retention policies | Important for real production use but does not add portfolio demo impact — `session_id` column already captured in data model for future use |
| REPORT-01 | Export functionality for cost reports (CSV) and evaluation results (JSON) | Mechanical feature with no visual demo value — trivially addable if a client specifically requests it |

---

## Requirement Coverage

| REQ-ID | Requirement | Phase | Status |
|--------|-------------|-------|--------|
| AUTH-01 | Supabase Auth with RBAC (Admin/Developer/Viewer), RLS enforcement | Phase 1 | Pending |
| SEC-01 | API key management with per-key usage tracking, SHA-256 hashing, rotation | Phase 1 | Pending |
| INFRA-01 | Multi-model routing with fallback chains (OpenAI, Claude, Gemini) | Phase 2 | Pending |
| OBS-01 | Per-request cost and latency tracking with breakdown by model/prompt/endpoint | Phase 2 | Pending |
| OBS-02 | Real-time dashboard (cost trends, latency p50/p95/p99, error rates) via Recharts | Phase 2 | Pending |
| CONFIG-01 | Model configuration UI for temperature, max tokens, system prompts | Phase 2 | Pending |
| PROMPT-01 | Prompt version control with named versions, diff view, rollback | Phase 3 | Pending |
| DX-01 | Request playground with streaming and live token counter | Phase 3 | Pending |
| REL-01 | Token-bucket rate limiting with 4-stage graceful degradation | Phase 4 | Pending |
| PROMPT-02 | A/B testing with statistical significance and auto-stop at 95% confidence | Phase 4 | Pending |
| EVAL-01 | Evaluation pipeline with judge LLM + human review queue + rubrics | Phase 5 | Pending |
| ALERT-01 | Webhook anomaly alerts with configurable rules and cooldown | Phase 5 | Pending |
| EVAL-02 | Batch evaluation against test datasets | **Deferred** | Not in scope |
| COMP-01 | PII redaction with configurable retention policies | **Deferred** | Not in scope |
| REPORT-01 | Export CSV/JSON | **Deferred** | Not in scope |

**Coverage: 12/12 active requirements mapped. 3 deferred. 0 orphans.**

---

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5

| Phase | Name | Plans Complete | Status | Completed |
|-------|------|----------------|--------|-----------|
| 1 | Foundation | 0/3 | Not started | — |
| 2 | Working Demo | 0/4 | Planned | — |
| 3 | Prompt Management + Playground | 0/3 | Not started | — |
| 4 | Reliability + Differentiators | 0/3 | Not started | — |
| 5 | Evaluation + Alerts | 0/3 | Not started | — |

---

## Architecture Decisions (Roadmap-Level)

These are confirmed decisions from research that constrain all phases. Do not re-litigate during planning.

| Decision | Rationale | Phases Affected |
|----------|-----------|-----------------|
| Vercel AI SDK 6 replaces LangChain | 3-way research consensus — smaller bundle, native edge support, provider registry pattern, built-in streaming normalization | 2, 3, 4 |
| Dual connection strings from day one | Pitfall 1 — pooled port 6543 for runtime, direct port 5432 for migrations. `connection_limit=1` in serverless | 1 (established), all |
| Materialized views, never raw log scans | Pitfall 2 — pg_cron refresh every 5 minutes. All dashboard queries hit pre-aggregated views | 2 (established), all dashboard work |
| Subscribe to `dashboard_events`, not `request_logs` | Pitfall 9 — reduces Realtime message volume 100-1000x, stays within free tier limits | 2 (established), all |
| PostgreSQL token bucket, Upstash as upgrade path | Research consensus — avoid Redis dependency until proven necessary; rate limiter behind swappable interface | 4 |
| Server-first, client islands only for charts/filters/realtime | Pitfalls 5, 10 — Server Components for data fetch, Client Islands only for Recharts, filter dropdowns, Supabase Realtime | 2, 3, 4, 5 |
| `after()` fire-and-forget logging | Next.js 15 stable API — keeps logging out of request critical path, <50ms overhead target | 2 |
| Recharts 3.x API, server-side downsampled to 200-500 points | Pitfall 11 — community tutorials use 2.x API; animations disabled on all dashboard charts | 2 |
| Pricing as database table, not constants | Pitfall 7 — updatable without deployment when providers change rates | 2 |
| SPRT for A/B auto-stop (not repeated t-tests) | Fixed-sample tests do not support early stopping without peeking bias inflation | 4 |
| Google model IDs updated: gemini-2.5-flash + gemini-2.0-flash | gemini-1.5-pro and gemini-1.5-flash discontinued September 24, 2025. Intent preserved: cheap flash tier + capable tier from Google | 2, 3, 4, 5 |

---

*Roadmap version: 1.1*
*Created: 2026-03-01*
*Updated: 2026-03-01 (Phase 2 plans finalized)*
*Milestone: Portfolio Demo*
*Coverage: 12/12 active requirements mapped, 3 deferred*
