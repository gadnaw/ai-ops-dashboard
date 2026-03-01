# ADR-002: Data Layer — Phase 2

## Status: Accepted

## Context

Phase 2 requires a database schema capable of handling high-volume LLM request logging without
causing serverless timeouts on the dashboard. The schema must also support per-request cost
calculation, Realtime notifications, and per-endpoint model configuration.

## Decisions

### request_logs Partitioning

Range-partitioned by created_at (monthly). Composite PK (id, created_at) satisfies PostgreSQL
partition key constraint. Prisma maps to parent table — partitions managed via raw SQL migration.
Monthly partitions created for 2026-01 through 2026-04 to cover seed data range.

**Rationale:** Range partitioning by month enables fast partition pruning for time-range queries.
Old partitions can be detached and archived without table-level locks. Prisma cannot generate
partitioned DDL, so the table is created via raw SQL in the advanced SQL migration.

### Analysis Constraint H1 (id column)

request_logs.id is UUID DEFAULT gen_random_uuid() with composite PK (id, created_at). NOT BIGSERIAL.
Matches analysis constraint schema requirement exactly.

### Analysis Constraint H3 (token property names)

Column names in request_logs: input_tokens, output_tokens (not prompt_tokens/completion_tokens).
When reading from AI SDK: use usage.inputTokens and usage.outputTokens (not promptTokens/completionTokens).

### Analysis Constraint H5 (prompt_text/response_text)

request_logs includes prompt_text TEXT and response_text TEXT columns. Logged in the after() callback.

### Analysis Constraint H12 (prompt_version_id)

prompt_version_id UUID NULL added WITHOUT FK constraint. Phase 3 adds the FK when prompt_versions
table is created.

### Analysis Constraint M7 (Phase 5 alert indexes)

Indexes added on request_logs for (created_at, cost_usd), (created_at, duration_ms),
(created_at, status) to support Phase 5 alert engine direct queries.

### Materialized View Strategy

Three views: hourly_cost_summary, hourly_latency_percentiles, daily_model_breakdown.
pg_cron refreshes CONCURRENTLY every 5 minutes (requires unique index — created in migration).
Dashboard NEVER queries request_logs directly.

**Rationale (Pitfall 2 mitigation):** Scanning request_logs on each page load would trigger
serverless timeout at moderate data volumes. Materialized views pre-aggregate the data so dashboard
queries complete in milliseconds regardless of log volume.

### dashboard_events for Realtime

Supabase Realtime subscribes to dashboard_events INSERT events, not request_logs.
This limits Realtime volume to 1 event per 5-minute cron cycle instead of per request.

**Rationale:** Subscribing to request_logs inserts would generate hundreds of Realtime events per
minute under load, overwhelming the browser WebSocket connection. The dashboard_events table acts as
a lightweight notification channel — the browser receives a single "data refreshed" signal and then
fetches fresh data via ISR revalidation (router.refresh()).

### Pricing in Database (not Constants)

Cost rate cards stored in cost_rate_cards table, not hardcoded in source. Updated without
redeployment when providers change pricing.

**Rationale:** LLM pricing changes frequently. Hardcoded constants would require a code deploy to
update pricing, which is unacceptable for an operational monitoring tool.

### Google Model IDs (Locked Spec Correction)

gemini-1.5-pro and gemini-1.5-flash discontinued September 24, 2025.
Replaced with: gemini-2.5-flash (primary) and gemini-2.0-flash (secondary).
Intent preserved: capable tier + cheap flash tier from Google.

## Consequences

- request_logs cannot use Prisma's standard migrate workflow for creation (raw SQL required)
- Materialized views must be initially populated before dashboard renders meaningful data
- pg_cron extension must be enabled in Supabase Dashboard before the migration SQL is applied
- Monthly partitions must be created in advance (or via automation) as data grows past 2026-04
