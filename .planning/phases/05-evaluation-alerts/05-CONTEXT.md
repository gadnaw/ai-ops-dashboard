# Phase 5: Evaluation + Alerts — Context

*Auto-generated from project research and roadmap. Review and edit before planning.*

## Phase Boundary

**Goal:** Complete the "production-ready AI ops" narrative with automated quality scoring via LLM-as-judge with human review for disagreements, and webhook anomaly alerting so teams know about cost spikes and latency regressions before customers do.

**Success Criteria:**
1. Requests can be queued for judge LLM evaluation; scores stored linked to original request log
2. Low-scoring requests auto-appear in human review queue; reviewer can approve, override, annotate
3. Alert rule fires webhook POST within 60s of threshold crossing; alert appears in dashboard history
4. Acknowledged alerts stop re-firing during cooldown; resolved alerts are timestamped
5. Dashboard shows evaluation score trends per prompt version alongside cost and latency charts

## Requirements In Scope

| REQ-ID | Requirement |
|--------|-------------|
| EVAL-01 | Evaluation pipeline with structured scoring rubrics (multi-dimension 1-5), automated judge-LLM scoring, human review queue |
| ALERT-01 | Webhook alerts for cost spikes, latency regression, error rate thresholds with configurable rules and cooldown |

## What's NOT In Scope

- EVAL-02 (batch evaluation) — Deferred
- COMP-01 (PII redaction config UI) — Deferred
- REPORT-01 (export CSV/JSON) — Deferred
- ML-based judge calibration — over-engineering for a portfolio demo
- Custom alert delivery channels beyond webhooks — over-engineering

## Technical Decisions

- **Evaluation pipeline:**
  - `evaluation_rubrics` table: multi-dimension scoring (accuracy, coherence, safety at minimum), 1-5 scale per dimension
  - `evaluation_scores` table: linked to `request_logs` via `request_id`, stores per-dimension scores + overall
  - Judge LLM: configurable model (default GPT-4o evaluating other models' output), rubric injected as system prompt
  - Trigger: configurable — all requests or sampled % (default 10%)
  - Human review threshold: configurable (default: any dimension < 3)
- **Human review queue:**
  - Simple list UI showing: original request, response, context, rubric, judge scores
  - Actions: approve judge score, override with manual score, add notes
  - Server Component list, Client Island for score interaction
- **Alert engine:**
  - `alert_rules` table: metric, threshold, window (5m/15m/1h), cooldown, webhook URL
  - `alert_history` table: rule_id, triggered_at, value, threshold, status (fired/acknowledged/resolved)
  - Sliding-window checks via pg_cron or Supabase scheduled functions
  - Webhook dispatch with retry (3 attempts, exponential backoff)
  - Default rules: cost > 2x daily average, p95 latency > 5s, error rate > 5%
- **Seed data update:** Add evaluation scores, alert events (day-15 cost spike triggers alert), sample human-reviewed requests

## Key Risks

- **LLM-as-judge calibration:** NEEDS RESEARCH during plan-phase. Judge model selection, score normalization, and rubric design need implementation decisions.
- **Pitfall 14 (LLM testing):** Use recorded API fixtures via MSW for evaluation pipeline tests. Don't test judge output content, test the pipeline mechanics.
- **Pitfall 16 (Over-engineering):** Start simple — single judge model, one rubric template, three dimensions. No ML calibration.
- **Pitfall 15 (Demo data):** Seed data must include evaluation scores and alert events for demo credibility.

## Dependencies

- Phase 4 must be complete (rate limiting events to alert on, A/B metrics to evaluate)
- Phase 2 data pipeline for request logs that evaluation scores link to

## Claude's Discretion

- Judge LLM model selection (GPT-4o recommended but configurable)
- Rubric template design beyond the three minimum dimensions
- Alert check frequency (pg_cron interval)
- Human review queue batch actions (bulk approve, bulk reject)
- Evaluation score visualization design (sparklines, trend charts)
- Whether to add email notification in addition to webhooks (probably not — keep simple)
