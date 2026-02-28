# Project Research Summary

**Project:** AI Ops Dashboard -- Production-Grade LLM Monitoring Platform
**Domain:** AI Observability / LLM Operations
**Researched:** 2026-03-01
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project is an AI observability platform -- a dashboard for monitoring, evaluating, and optimizing LLM API usage across OpenAI, Anthropic, and Google providers. The competitive landscape (Langfuse, Helicone, Portkey, LangSmith, LiteLLM) is well-established, meaning table-stakes features are clearly defined: per-request logging, cost tracking, latency percentiles, prompt versioning, and multi-model routing. The recommended approach is a Next.js 15 App Router application with Supabase (PostgreSQL + Realtime + Auth), Prisma 7 ORM, Vercel AI SDK for multi-provider orchestration, Recharts for visualization, and Zustand for client state. This stack is internally consistent and well-documented with one critical change from the original spec: **replace LangChain with Vercel AI SDK** for AI orchestration, as LangChain is an application-building framework, not a monitoring tool, and adds unnecessary complexity, bundle size, and edge-runtime incompatibility.

The two highest-value differentiators are A/B testing with statistical significance (no competitor fully automates this) and four-stage graceful degradation (queue, fallback model, cached response, 429 rejection). These features combined with a polished real-time dashboard create the strongest portfolio signal. The primary technical risks are: (1) Prisma 7 performance at high-write scale in serverless -- mitigated by a dual-client strategy using Supabase client for hot-path logging and Prisma for everything else, (2) Supabase connection pooling misconfiguration -- mitigated by dual connection strings from day one, and (3) dashboard aggregation query timeouts on Vercel serverless -- mitigated by pre-computed materialized views refreshed via pg_cron.

The project should be scoped to 4-6 weeks with a firm MVP milestone. A polished implementation of 10 features beats a mediocre implementation of 20. The critical path is: Auth -> API Key Management -> Multi-Model Routing -> Request Logging -> Dashboard -> Prompt Versioning. Everything else branches off that backbone.

**Top decisions:**

- **Replace LangChain with Vercel AI SDK** -- 33% smaller bundle, native edge support, built-in streaming hooks, provider registry pattern. All three research dimensions (Stack, Architecture, Pitfalls) converge on this.
- **Next.js 15 (not 14)** -- Turbopack, React 19, `after()` API for fire-and-forget logging. No reason to start a new project on 14.
- **Dual-client database strategy** -- Prisma for schema/CRUD/migrations, Supabase client for hot-path logging and real-time subscriptions.
- **PostgreSQL-backed rate limiting as primary, Upstash Redis as upgrade path** -- Avoid adding a Redis dependency until proven necessary.
- **Materialized views for dashboard performance** -- Pre-compute hourly aggregations via pg_cron, never scan raw logs on page load.
- **Server-first, client-islands rendering** -- Minimize JS bundle; only charts, filters, and real-time feeds are client components.
- **Scope to 3 phases over 4-6 weeks** -- Foundation + Visual Impact first, Differentiators second, Evaluation + Polish third.

## Key Findings

### Recommended Stack

The stack is a modern Next.js full-stack architecture optimized for serverless deployment on Vercel. All version recommendations are verified against npm as of 2026-03-01. The single most impactful decision is replacing LangChain with Vercel AI SDK -- this eliminates edge runtime incompatibility, reduces bundle size by ~34 kB gzipped, and provides native React streaming hooks (`useChat`, `useCompletion`) that LangChain requires custom code to achieve.

**Core technologies:**

- **Next.js 15.x + React 19 + TypeScript 5.x**: Full-stack framework with App Router, Turbopack, and `after()` API for background logging
- **Vercel AI SDK 6.x (replaces LangChain)**: Multi-provider routing via `createProviderRegistry()`, streaming with `streamText()`, built-in fallback support
- **Supabase (PostgreSQL + Realtime + Auth)**: Unified backend -- database, WebSocket subscriptions, authentication, RLS-based RBAC
- **Prisma 7.x**: ORM for schema management, type-safe CRUD, and migrations -- pure TypeScript engine eliminates Rust dependency, dramatically better serverless cold starts
- **Recharts 3.7.0**: SVG-based chart library for cost trends, latency percentiles, model distribution -- requires server-side data downsampling
- **Zustand 5.x**: Lightweight client state for dashboard filters, time range selection, UI preferences -- no providers needed
- **Tailwind CSS 4.x**: Utility-first styling
- **@upstash/ratelimit 2.x**: Token-bucket rate limiting with HTTP-based Redis (upgrade path from PostgreSQL-backed approach)
- **Vitest + Playwright**: Unit/integration and E2E testing (official Next.js recommendation)

**Critical version requirements:** Prisma 7+ (pure TS engine), Next.js 15+ (`after()` API), Vercel AI SDK 6+ (provider registry), Recharts 3+ (current API).

### Expected Features

**Must have (table stakes):**

- Per-request logging with model, tokens, cost, latency, status
- Cost tracking dashboard with breakdown by model and time period
- Latency percentiles (p50/p95/p99) with time-range filtering
- Error rate tracking with categorization (rate limit, timeout, auth, model error)
- Prompt versioning with immutable snapshots and diff view
- Multi-model support (OpenAI + Anthropic + Google minimum)
- API key management (create, revoke, show-once, SHA-256 hashed)
- RBAC (Admin/Developer/Viewer) enforced via Supabase RLS
- Request playground with streaming and variable substitution
- Data export (CSV/JSON)
- Real-time dashboard updates via Supabase subscriptions
- Date range filtering (24h/7d/30d/custom) on all views

**Should have (differentiators -- highest wow factor):**

- A/B testing with statistical significance and auto-stop at 95% confidence
- Four-stage graceful degradation (queue -> fallback model -> cached -> 429)
- Evaluation pipeline with LLM-as-judge scoring and human review queue
- Fallback chain visualization (degradation timeline view)
- Model comparison view (same prompt, multiple models, side-by-side)

**Defer (v2+):**

- Trace/span waterfall visualization (high value but high complexity)
- Session/conversation tracking for multi-turn applications
- Response caching with TTL
- Usage budgets and spending limits per API key
- OpenTelemetry integration
- Content moderation guardrails beyond PII

**Anti-features (do not build):**

- Full LLM gateway/proxy (LiteLLM/Portkey already do this with 100+ models)
- Fine-tuning management UI (different product category)
- Custom D3 visualizations (Recharts is sufficient)
- Mobile-responsive dashboard (desktop-only tool)
- Billing/payment integration (out of scope)
- Custom alert delivery channels beyond webhooks

### Architecture Approach

Server-first, client-islands architecture on Next.js App Router organized into five logical layers: Edge Middleware (auth, rate-limit pre-check), Next.js App (Server Components for dashboard), API Routes (external LLM proxy + internal dashboard endpoints), Service Layer (model-router, rate-limiter, evaluator, PII-redactor, prompt-manager, cost-tracker, alert-engine), and Data Layer (Prisma + Supabase with partitioned request_logs and materialized views). The dashboard uses Parallel Routes for independent panel loading with per-slot Suspense boundaries and skeleton states.

**Major components:**

1. **Edge Middleware** -- Auth verification (Supabase session or API key), rate-limit pre-check, request ID injection
2. **Model Router Service** -- Multi-provider orchestration with priority-based fallback chains, exponential backoff with jitter, cost tracking per request
3. **Request Logger** -- Async (fire-and-forget via `after()`) structured logging to partitioned request_logs table with PII redaction
4. **Dashboard UI** -- Server Components fetch from materialized views; Client Islands handle Recharts, filters, and Supabase Realtime subscriptions
5. **Rate Limiter** -- PostgreSQL-backed token bucket with four-stage degradation chain
6. **Prompt Manager** -- Version control, A/B traffic splitting with statistical significance testing
7. **Evaluation Service** -- LLM-as-judge scoring with rubrics, human review queue
8. **Alert Engine** -- Sliding-window threshold checks, webhook dispatch

### Critical Pitfalls

1. **Connection pooling misconfiguration (CRITICAL)** -- Use TWO connection strings: `DATABASE_URL` (pooled, port 6543 with `pgbouncer=true`) for Prisma runtime, `DIRECT_URL` (direct, port 5432) for migrations. Set `connection_limit=1` per serverless function. Failure to do this exhausts Supabase connections within minutes under traffic.

2. **Vercel serverless timeout on dashboard aggregations (CRITICAL)** -- Pre-compute all dashboard metrics via materialized views refreshed by pg_cron every 5 minutes. Never scan raw request_logs on page load. Add composite indexes on `(created_at, provider, model)`. Use Vercel Fluid Compute for extended timeouts.

3. **LangChain abstraction tax (CRITICAL -- resolved)** -- LangChain is a category mismatch for an observability platform. Replace with Vercel AI SDK. If LangChain is used at all, isolate it to a separate demo traffic generator, not the monitoring platform itself.

4. **API key exposure in client-side code (CRITICAL)** -- Never prefix LLM API keys or Supabase service_role with `NEXT_PUBLIC_`. All provider calls go through API routes. Add pre-commit hooks to detect `NEXT_PUBLIC_.*KEY` patterns.

5. **Server/Client component boundary mismanagement (HIGH)** -- Default to Server Components. Add `"use client"` only to leaf components (chart wrappers, filter dropdowns, real-time feeds). Use the "donut pattern" for data-fetching parents with interactive children.

6. **Supabase Realtime subscription fragility (HIGH)** -- Implement connection health monitoring, single-channel with filters instead of per-widget channels, visibility change handlers for tab backgrounding, and a connection status indicator in the UI.

7. **Recharts performance with large datasets (HIGH)** -- Downsample to 200-500 data points maximum server-side. Disable animations. Memoize chart data. Lazy-load below-the-fold charts.

## Cross-Dimensional Findings

### Contradictions

| Dimension A | Dimension B | Conflict | Resolution |
|-------------|-------------|----------|------------|
| **STACK.md** | **ARCHITECTURE.md** | STACK recommends replacing LangChain with Vercel AI SDK. ARCHITECTURE uses LangChain provider classes (`ChatOpenAI`, `ChatAnthropic`, `ChatGoogleGenerativeAI`) and references `@langchain/openai` imports in the model router implementation. | **RESOLVED: Use Vercel AI SDK.** All three analysis dimensions converge: STACK says replace it, PITFALLS flags it as category mismatch (Pitfall 3), and the ARCHITECTURE's own Key Decisions table says "Custom router wrapping LangChain providers" which is exactly what the Vercel AI SDK provider registry does natively without LangChain. Replace the `src/lib/model-router/providers.ts` LangChain imports with Vercel AI SDK `createProviderRegistry()`. The ModelRouter class and fallback chain logic remain identical -- only the provider instantiation layer changes. |
| **STACK.md** | **ARCHITECTURE.md** | STACK recommends Next.js 15 explicitly. ARCHITECTURE references Next.js 14 in one data-fetching link and notes to "verify `after()` availability in the exact Next.js 14 version being used." | **RESOLVED: Use Next.js 15.** STACK is correct -- starting on 14 makes no sense in March 2026. The `after()` API is stable in Next.js 15+, which ARCHITECTURE itself relies on for fire-and-forget logging (Pattern 2). All architecture patterns described are fully compatible with Next.js 15. |
| **STACK.md** | **ARCHITECTURE.md** | STACK recommends Upstash Redis (`@upstash/ratelimit`) for rate limiting. ARCHITECTURE implements a PostgreSQL-backed token bucket with a custom `check_rate_limit()` PL/pgSQL function and explicitly states "the PostgreSQL approach avoids adding another service dependency." | **RESOLVED: Start with PostgreSQL-backed, plan Upstash as upgrade.** ARCHITECTURE's reasoning is sound -- PostgreSQL-backed rate limiting at ~15ms per check avoids a new service dependency and works for the demo/early scale. STACK's Upstash recommendation is the better production choice at scale. Build the rate limiter behind an interface so the storage backend is swappable. Start with PostgreSQL; switch to Upstash if latency becomes a concern at high volume. Both researchers agree on this upgrade path. |

### Gaps

| Gap | Affected Dimensions | Impact | Recommendation |
|-----|---------------------|--------|----------------|
| **Trace/span visualization not in architecture** | Features, Architecture | FEATURES.md identifies trace/span waterfall as HIGH priority addition ("arguably table-stakes for an observability platform"). ARCHITECTURE.md has no component or data model for traces/spans. | Defer to v2 as FEATURES recommends. If added later, requires a `spans` table with parent-child relationships and a tree-rendering component. This is a significant addition. |
| **Session/conversation tracking not modeled** | Features, Architecture | FEATURES recommends session tracking (grouping related requests). No `session_id` column exists in the ARCHITECTURE schema, and no component handles session grouping. | Add an optional `session_id` column to `request_logs` in the schema. Do not build session UI for MVP, but capture the data for future use. Low-cost schema addition, high future value. |
| **Seed data generation architecture** | Features, Architecture | FEATURES.md specifies detailed seed data requirements (10K requests, 30-day distribution, realistic patterns). No seed data architecture or script design appears in ARCHITECTURE. | Create a `prisma/seed.ts` that generates realistic data following FEATURES.md seed data spec. This is a Phase 1 deliverable since the dashboard needs data to look credible. The architecture's folder structure already includes `prisma/seed.ts`. |
| **Model comparison view not in architecture** | Features, Architecture | FEATURES recommends side-by-side model comparison in the playground. ARCHITECTURE's playground page exists but the multi-model parallel request pattern is not described. | Address during playground phase. Requires concurrent `Promise.all` calls to multiple providers and a split-pane UI. Medium complexity, high demo value. |
| **Prompt template variables** | Features, Architecture | FEATURES notes that templates without `{{variable}}` syntax are "just static text." No architecture component handles variable extraction, validation, or substitution. | Include in Prompt Manager Service (prompt-mgr). Add a `variables` JSONB column to `prompt_versions` table storing extracted variable names. Build a simple `{{var}}` regex parser. Low complexity, high value. |

### Reinforcements

- **Dual-client database strategy:** STACK, ARCHITECTURE, and PITFALLS all independently converge on using Prisma for schema/CRUD and Supabase client for hot-path writes and real-time. This is the strongest cross-dimensional agreement in the research. Confidence: HIGH.

- **Materialized views for dashboard performance:** ARCHITECTURE designs them, PITFALLS warns about timeout without them (Pitfall 2), and STACK's Recharts analysis requires server-side aggregation. Three-way alignment. Confidence: HIGH.

- **Connection pooling configuration:** STACK specifies dual connection strings with `pgbouncer=true`, ARCHITECTURE shows the Prisma schema configuration, and PITFALLS flags misconfiguration as Critical Pitfall 1. The exact same mitigation appears in all three documents. Confidence: HIGH.

- **Server-first, client-islands rendering:** STACK recommends Zustand only for client state, ARCHITECTURE designs the Server Component / Client Island split, and PITFALLS warns against `"use client"` at page level (Pitfall 5). All aligned. Confidence: HIGH.

- **Fire-and-forget logging with `after()`:** STACK confirms Next.js 15 has stable `after()`, ARCHITECTURE builds the logging pipeline around it (Pattern 2), and PITFALLS warns about timeout risk if logging is synchronous (Pitfall 2). Three-way reinforcement. Confidence: HIGH.

- **LangChain removal:** STACK recommends Vercel AI SDK (with detailed comparison), PITFALLS flags LangChain as Critical Pitfall 3 (category mismatch, 400+ transitive deps, edge incompatibility), and ARCHITECTURE's own analysis acknowledges "LangChain for provider abstraction" is minimal usage that the AI SDK handles natively. Strongest consensus in the entire research. Confidence: HIGH.

- **Supabase Realtime on summary table, not raw logs:** STACK explains Supabase limits (100 msg/s free, 500 Pro), ARCHITECTURE designs the `dashboard_events` pattern, PITFALLS warns about subscription fragility (Pitfall 9). All agree: subscribe to a lightweight event summary table, not request_logs. Confidence: HIGH.

### Dependency Chain

```
1. Foundation (no dependencies)
   +-- Supabase project setup (database, auth, RLS policies)
   +-- Next.js 15 scaffolding with App Router + Tailwind 4
   +-- Prisma schema + partitioned request_logs + materialized views
   +-- Dual connection string configuration
   +-- Supabase Auth with RBAC (Admin/Developer/Viewer)

2. Core Infrastructure (depends on: Foundation)
   +-- API Key management (SHA-256 hashing, show-once pattern)
   +-- Vercel AI SDK provider registry (OpenAI + Anthropic + Google)
   +-- Model Router with fallback chains and retry logic
   +-- Rate Limiter (PostgreSQL token bucket + degradation chain)
   +-- Request Logger (async fire-and-forget with PII redaction)
   +-- Cost Tracker (rate card table, per-request calculation)

3. Dashboard + Visualization (depends on: Core Infrastructure)
   +-- Dashboard layout with Parallel Routes and Suspense
   +-- Metrics cards (cost, latency p50/p95/p99, error rate, request volume)
   +-- Recharts time-series charts (cost trends, latency percentiles)
   +-- Supabase Realtime subscriptions on dashboard_events
   +-- Date range and model filters (Zustand state)
   +-- Seed data generator (10K requests, realistic distributions)

4. Prompt Management (depends on: Core Infrastructure)
   +-- Prompt versioning with immutable snapshots
   +-- Template variable extraction and substitution
   +-- Diff view between versions
   +-- Prompt version selection in Model Router

5. Differentiators (depends on: Dashboard + Prompt Management)
   +-- A/B testing framework with traffic splitting
   +-- Statistical significance calculator (Welch's t-test, chi-square)
   +-- Request playground with streaming
   +-- Graceful degradation visualization (timeline view)
   +-- Model comparison view (side-by-side)

6. Evaluation + Polish (depends on: Differentiators)
   +-- LLM-as-judge evaluation pipeline with rubrics
   +-- Human review queue
   +-- Batch evaluation against test datasets
   +-- Webhook anomaly alerts with configurable rules
   +-- PII redaction configuration UI
   +-- Data export (CSV/JSON)
```

This chain informs phase ordering in ROADMAP.md.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation + Core Infrastructure

**Rationale:** Everything depends on auth, database, and the LLM proxy pipeline. This phase establishes the data backbone so that all subsequent phases have real data to work with. The seed data generator goes here because every demo page needs populated data.

**Delivers:** Functional API that accepts LLM requests, routes them through providers with fallback, logs them with cost/latency tracking, and enforces rate limits. Supabase Auth with RBAC. Database with partitioned tables, materialized views, and pg_cron refresh. Seed data.

**Features addressed:** AUTH-01, SEC-01, INFRA-01, OBS-01, REL-01 (backend only)

**Pitfalls to avoid:**
- Connection pooling misconfiguration (Pitfall 1) -- dual connection strings from day one
- API key exposure (Pitfall 4) -- server-only API routes, no NEXT_PUBLIC keys
- LangChain abstraction tax (Pitfall 3) -- use Vercel AI SDK from the start

### Phase 2: Dashboard + Visualization

**Rationale:** The dashboard is the visual centerpiece and the first thing any portfolio reviewer sees. It requires Phase 1's data pipeline to be functional. This phase transforms raw logged data into compelling visualizations.

**Delivers:** Real-time dashboard with cost trend charts, latency percentile visualization (p50/p95/p99), error rate tracking, request volume over time, model distribution breakdown. Filters for time range and model. Real-time updates via Supabase. Professional skeleton loading states.

**Features addressed:** OBS-02, CONFIG-01

**Pitfalls to avoid:**
- Serverless timeout on aggregations (Pitfall 2) -- use materialized views, never scan raw logs
- Recharts performance (Pitfall 11) -- downsample server-side, disable animations
- Data fetching waterfalls (Pitfall 12) -- Parallel Routes, Promise.all, Suspense boundaries
- Zustand hydration (Pitfall 10) -- skipHydration pattern
- Supabase Realtime fragility (Pitfall 9) -- connection health monitoring, single channel

### Phase 3: Prompt Management + Playground

**Rationale:** Prompt versioning and the playground are both table-stakes features that add interactive demo value. They depend on the model router (Phase 1) and benefit from being visible in the dashboard (Phase 2).

**Delivers:** Prompt template CRUD with variable extraction, version history with diff view, rollback capability. Interactive playground with model selection, streaming responses, and variable substitution.

**Features addressed:** PROMPT-01, DX-01

**Pitfalls to avoid:**
- Streaming format inconsistency (Pitfall 6) -- Vercel AI SDK normalizes this automatically
- Server/client boundary (Pitfall 5) -- Prompt list is Server Component, editor/playground are Client Islands

### Phase 4: Differentiators

**Rationale:** The highest wow-factor features that distinguish this from competitors. Requires prompt versioning (Phase 3) and the full data pipeline (Phases 1-2). This is where portfolio impact happens.

**Delivers:** A/B testing framework with auto-stop at 95% confidence. Graceful degradation timeline visualization. Model comparison view (same prompt to multiple models, side-by-side results with cost/latency). These three features combined create a demo narrative no competitor matches.

**Features addressed:** PROMPT-02, REL-01 (visualization), model comparison (new)

**Pitfalls to avoid:**
- A/B testing requires minimum sample sizes (200-500+ per variant) -- do not allow early stopping ("peeking")
- Cost calculation edge cases (Pitfall 7) -- parse full usage objects including cached tokens

### Phase 5: Evaluation + Alerts + Export

**Rationale:** Evaluation pipeline and alerts add depth to the "production-ready" narrative but have lower demo impact than Phase 4 features. They also have the most complex implementation (judge-LLM scoring, rubric management, human review queue). Placing them last allows the project to ship a strong demo after Phase 4 if time is tight.

**Delivers:** LLM-as-judge evaluation with configurable rubrics. Human review queue for judge disagreements. Batch evaluation against test datasets. Webhook anomaly alerts with configurable rules. PII redaction configuration. CSV/JSON data export.

**Features addressed:** EVAL-01, EVAL-02, ALERT-01, COMP-01, REPORT-01

**Pitfalls to avoid:**
- LLM testing challenges (Pitfall 14) -- use recorded API fixtures with MSW/nock
- Over-engineering (Pitfall 16) -- evaluation pipeline can be basic (single judge, simple rubric) and still impress
- Demo data quality (Pitfall 15) -- ensure seed data includes evaluation scores and alert events

### Phase Ordering Rationale

- **Phase 1 before Phase 2** because the dashboard needs data to display. The API pipeline generates the logged data that the dashboard visualizes.
- **Phase 2 before Phase 3** because prompt versioning benefits from being visible in the dashboard (prompt-filtered views, version comparison in charts).
- **Phase 3 before Phase 4** because A/B testing splits traffic between prompt versions -- it requires prompt versioning to exist.
- **Phase 4 before Phase 5** because the differentiators (A/B, graceful degradation) have higher demo impact per hour invested than evaluation/alerts. If the project runs long, cut Phase 5, not Phase 4.
- **Seed data is in Phase 1** (not separate) because every phase's visual output depends on having realistic data present.

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 4 (A/B Testing):** Statistical significance testing for LLM outputs is a niche area. The FEATURES.md provides the statistical methods (Welch's t-test, chi-square, power analysis), but implementation details for auto-stop sequential testing need validation. Research the sequential probability ratio test (SPRT) pattern for early stopping without peeking bias.
- **Phase 5 (Evaluation Pipeline):** LLM-as-judge is an active research area. Rubric design, judge calibration, and multi-judge consensus patterns need careful implementation. The FEATURES.md evaluation rubric section provides a starting framework but real-world calibration will require experimentation.

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Foundation):** Next.js 15 + Supabase + Prisma setup is extremely well-documented. Connection pooling, RLS, partitioning all have official guides.
- **Phase 2 (Dashboard):** Recharts + Supabase Realtime + App Router parallel routes are standard patterns with abundant tutorials.
- **Phase 3 (Prompt Management):** CRUD with versioning is a solved problem. Diff view libraries exist. Playground is a standard chat UI pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm within 7 days. Vercel AI SDK, Prisma 7, Next.js 15 all confirmed stable. |
| Features | HIGH | Competitive analysis covers 5 major platforms with official documentation. Table-stakes classification is well-supported. |
| Architecture | HIGH | Server-first pattern, partitioning, materialized views, parallel routes all verified against official docs. |
| Pitfalls | HIGH | 16 pitfalls documented, all with official documentation or community issue references. Critical pitfalls have verified prevention strategies. |
| **Cross-Dimensional** | **MEDIUM-HIGH** | Three contradictions identified and resolved. All resolutions are clear and actionable. Five gaps found, all addressable. Seven strong reinforcements across dimensions. |

**Overall confidence:** MEDIUM-HIGH

The one area pulling confidence below HIGH is Prisma 7's real-world performance at scale in serverless. Prisma 7 eliminated the Rust engine and claims 3x faster queries, but high-write performance data under Vercel serverless conditions is still emerging (Prisma's own benchmarks only). The dual-client mitigation strategy (Supabase for hot-path writes) is robust, but validates the "MEDIUM" portion of the confidence.

### Gaps to Address

- **Prisma 7 serverless performance:** Validate high-write performance early in Phase 1. If batch inserts through Prisma exceed 50ms, expand the Supabase client usage for all write operations. Fallback plan is well-defined.
- **Supabase Realtime at scale:** Free tier limits (100 msg/s, 200 connections) are sufficient for demo. Monitor during development. The `dashboard_events` summary table pattern reduces message volume by 100-1000x.
- **Vercel AI Gateway availability:** Model fallback routing via Vercel AI Gateway is tied to Vercel infrastructure. The custom fallback implementation in the model router provides platform independence. Use the custom implementation, consider Gateway as an optimization.
- **Recharts 3.x API stability:** Major version with potential breaking changes from 2.x tutorials. Ensure all code references the 3.x API. Most community examples still reference 2.x.
- **Cost tracking pricing updates:** Provider pricing changes 2-4 times per year. Build the rate card as a database table (not hardcoded constants) that admins can update without deployment.
- **Sequential testing for A/B auto-stop:** Standard fixed-sample t-tests do not support auto-stopping. Research SPRT (Sequential Probability Ratio Test) or group sequential designs during Phase 4 planning for proper early stopping without inflating false positive rates.

## Open Questions

These require user or team decisions during planning, not additional research:

1. **PostgreSQL vs Upstash for rate limiting:** Research recommends starting with PostgreSQL. If the user prefers a single definitive approach, Upstash is the better long-term choice but adds a service dependency. Which approach?
2. **Trace/span support:** FEATURES identifies this as "arguably table-stakes for an observability platform." It was deferred due to high complexity. Should a minimal trace view be included in MVP, or is this firmly post-MVP?
3. **Project timeline:** Research assumes 4-6 weeks. If the timeline is shorter, Phase 5 should be cut entirely. If longer, trace/span and session tracking can be added.
4. **Demo deployment tier:** Free Supabase tier has meaningful limits (200 realtime connections, 60 database connections). If the demo will face concurrent users, Pro tier may be necessary.

## Sources

### Primary (HIGH confidence)

**Official Documentation:**
- Supabase: Realtime with Next.js, Realtime Limits, Prisma Integration, Connection Pooling, RLS, API Keys, Partitioning, pg_partman
- Next.js: App Router Structure, Server/Client Components, Parallel Routes, Data Fetching Patterns, Testing (Vitest + Playwright)
- Prisma: Supabase Guide, Query Optimization, Deploy to Vercel, Prisma 7 Announcement
- Vercel AI SDK: Provider Registry, streamText, Core Reference
- Recharts: Performance Guide
- Zustand: Next.js Guide
- Upstash: Ratelimit for Next.js
- OpenAI: Prompt Caching, Pricing
- Anthropic: Streaming Documentation

**Version Data (npm, verified 2026-03-01):**
- Next.js 15.x, React 19.x, TypeScript 5.x, Tailwind CSS 4.x
- Vercel AI SDK 6.0.105, Prisma 7.x, Recharts 3.7.0, Zustand 5.0.11
- openai 6.25.0, @anthropic-ai/sdk 0.78.0, @google/genai 1.43.0
- @upstash/ratelimit 2.0.8

### Secondary (MEDIUM confidence)

**Competitive Analysis:**
- Helicone: Complete Guide to LLM Observability Platforms
- Firecrawl: Best LLM Observability Tools 2026
- SigNoz: Top LLM Observability Tools 2026
- LangChain vs Vercel AI SDK comparison guides (Strapi, NeuroLink)
- Drizzle vs Prisma 2026 comparison (Bytebase)
- Best React Chart Libraries 2025 (LogRocket)

**Evaluation and Testing Patterns:**
- Confident AI: LLM Evaluation Metrics
- Evidently AI: LLM-as-a-Judge Guide
- LLM-Rubric: Calibrated Approach to Automated Evaluation (arxiv)
- Statsig: LLM Optimization via Online Experimentation
- Langfuse: Testing LLM Applications

### Tertiary (LOW confidence)

- Prisma 7 performance at scale under Vercel serverless: Only Prisma's own benchmarks available. Needs real-world validation.
- Recharts 3.x specific API changes from 2.x: Limited migration documentation.

---
*Research completed: 2026-03-01*
*Cross-dimensional validation: complete -- 3 contradictions resolved, 5 gaps identified, 7 reinforcements confirmed*
*Ready for roadmap: yes*
