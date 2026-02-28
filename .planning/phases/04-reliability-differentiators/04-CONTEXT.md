# Phase 4: Reliability + Differentiators — Context

*Auto-generated from project research and roadmap. Review and edit before planning.*

## Phase Boundary

**Goal:** The two features that no competitor demo includes at this level: (1) four-stage graceful degradation with timeline visualization, and (2) A/B testing between prompt versions with SPRT auto-stop at 95% confidence. Together they create the demo narrative — this is what production-grade AI infrastructure actually looks like.

**Success Criteria:**
1. Rate-limited requests progress through all 4 degradation stages with each transition logged
2. Dashboard degradation timeline shows fallback events as annotated markers; clicking reveals full chain
3. A/B test distributes traffic within +/-3% of target split across 1000 requests
4. SPRT auto-stop fires at 95% confidence; dashboard shows winner, confidence, effect size, per-variant breakdown
5. User can manually stop a test and promote the winning variant with one click

## Requirements In Scope

| REQ-ID | Requirement |
|--------|-------------|
| REL-01 | Token-bucket rate limiting per API key with 4-stage degradation: queue -> fallback model -> cached response -> 429 with Retry-After |
| PROMPT-02 | A/B test framework with configurable traffic split, per-variant metrics, SPRT auto-stop at 95% confidence |

## What's NOT In Scope

- EVAL-01 (evaluation pipeline) — Phase 5
- ALERT-01 (webhook alerts) — Phase 5
- Batch evaluation, PII config UI, export — Deferred
- Upstash Redis migration — future optimization, not this phase

## Technical Decisions

- **Rate limiter:** PostgreSQL token-bucket behind a `RateLimiter` interface (swappable to Upstash later)
  - Atomic `check_rate_limit()` PL/pgSQL function with `FOR UPDATE` row locking (~15ms per check)
  - Configurable per API key: requests/minute, tokens/minute, concurrent requests
  - `rate_limit_events` table logging every degradation event with stage, reason, timestamp, latency
- **Four-stage degradation chain:**
  1. Queue (configurable max wait, default 10s)
  2. Fallback to cheaper/faster model (e.g., GPT-4o -> GPT-4o-mini)
  3. Return cached response with `X-Served-From: cache` header
  4. Return 429 with `Retry-After` header
- **A/B testing:**
  - Traffic split router using deterministic hashing (request ID + experiment ID) for consistent assignment
  - Per-variant accumulation: response count, avg latency, avg cost, avg eval score, error rate
  - **SPRT (Sequential Probability Ratio Test)** for auto-stop — NOT repeated t-tests (avoids peeking bias)
  - Minimum sample size guard: 200+ per variant before any significance check
  - Dashboard shows "insufficient data" state with sample count progress bar
  - Manual stop + promote-winner-to-primary workflow

## Key Risks

- **A/B SPRT implementation:** NEEDS RESEARCH during plan-phase. Fixed-sample t-tests do not support early stopping. SPRT or group sequential design required.
- **Pitfall 7 (cost edge cases):** Rate-limit degradation events must log full cost at each stage including cached token costs.
- **Rate limiter latency:** ~15ms per check is within budget but should be monitored. Upstash upgrade path if PostgreSQL locking becomes a bottleneck.

## Dependencies

- Phase 3 must be complete (prompt versions exist for A/B to split between)
- Phase 2 data pipeline for logging degradation events and A/B metrics

## Claude's Discretion

- Exact SPRT implementation details (research during plan-phase)
- Cache storage strategy for degradation stage 3 (in-memory vs DB-backed)
- A/B dashboard layout (comparison table, charts, significance indicators)
- Degradation timeline visualization design
- Whether to implement confidence intervals or just point estimates for A/B metrics
