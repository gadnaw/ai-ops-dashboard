# Requirements — AI Ops Dashboard

**Milestone:** Portfolio Demo
**Generated:** 2026-03-01
**Source:** User specs (PROJECT.md, REQUIREMENTS.md, FEATURES.md)

## Active Requirements

### Core Infrastructure (INFRA)

| REQ-ID | Requirement | Priority | Source | Phase |
|--------|-------------|----------|--------|-------|
| INFRA-01 | Multi-model routing engine supporting OpenAI, Claude, and Gemini with configurable fallback chains, automatic retry on 429/5xx, and unified response normalization | Core | Explicit | TBD |

### Authentication & Security (AUTH / SEC)

| REQ-ID | Requirement | Priority | Source | Phase |
|--------|-------------|----------|--------|-------|
| AUTH-01 | Supabase Auth with role-based access (Admin, Developer, Viewer), email + OAuth (GitHub, Google), RLS enforcement | Core | Explicit | TBD |
| SEC-01 | API key management with per-key usage tracking, rotation support, SHA-256 hashing, expiration dates | Supporting | Explicit | TBD |

### Observability (OBS)

| REQ-ID | Requirement | Priority | Source | Phase |
|--------|-------------|----------|--------|-------|
| OBS-01 | Per-request cost and latency tracking with breakdown by model, prompt version, and endpoint. Token counts from provider metadata, configurable rate card | Core | Explicit | TBD |
| OBS-02 | Real-time dashboard with cost trends (area), latency percentiles p50/p95/p99 (line), cost by model (pie), request volume (bar) via Recharts. 30s refresh via Supabase real-time | Core | Explicit | TBD |

### Prompt Management (PROMPT)

| REQ-ID | Requirement | Priority | Source | Phase |
|--------|-------------|----------|--------|-------|
| PROMPT-01 | Prompt version control with named versions, immutable snapshots, diff view, one-click rollback. Stored in Supabase/PostgreSQL via Prisma | Core | Explicit | TBD |
| PROMPT-02 | A/B test framework with configurable traffic split, per-variant metrics (latency, cost, eval score, error rate), statistical significance testing, auto-stop at 95% confidence | Core | Explicit | TBD |

### Evaluation (EVAL)

| REQ-ID | Requirement | Priority | Source | Phase |
|--------|-------------|----------|--------|-------|
| EVAL-01 | Evaluation pipeline with structured scoring rubrics (multi-dimension 1-5), automated judge-LLM scoring, human-in-the-loop review queue. Scores linked to request logs | Core | Explicit | TBD |
| EVAL-02 | Batch evaluation mode for running prompt versions against test datasets with comparison reports | Supporting | Explicit | TBD |

### Reliability (REL)

| REQ-ID | Requirement | Priority | Source | Phase |
|--------|-------------|----------|--------|-------|
| REL-01 | Token-bucket rate limiting per API key with four-stage degradation: queue → fallback model → cached response → 429 with Retry-After. All events logged and surfaced in dashboard timeline | Core | Explicit | TBD |

### Alerting (ALERT)

| REQ-ID | Requirement | Priority | Source | Phase |
|--------|-------------|----------|--------|-------|
| ALERT-01 | Webhook alerts for cost spikes, latency regression, error rate thresholds. Configurable rules with sliding windows (5m/15m/1h), cooldown, acknowledge/resolve workflow | Supporting | Explicit | TBD |

### Compliance (COMP)

| REQ-ID | Requirement | Priority | Source | Phase |
|--------|-------------|----------|--------|-------|
| COMP-01 | Request/response logging with PII redaction (email, phone, configurable regex) and configurable retention policies | Supporting | Explicit | TBD |

### Configuration & Developer Experience (CONFIG / DX)

| REQ-ID | Requirement | Priority | Source | Phase |
|--------|-------------|----------|--------|-------|
| CONFIG-01 | Model configuration UI for adjusting temperature, max tokens, system prompts per endpoint | Core | Explicit | TBD |
| DX-01 | Request playground with streaming response, live token counter, model/prompt/parameter selection. Requests logged through production tracking pipeline | Supporting | Explicit | TBD |

### Reporting (REPORT)

| REQ-ID | Requirement | Priority | Source | Phase |
|--------|-------------|----------|--------|-------|
| REPORT-01 | Export functionality for cost reports (CSV) and evaluation results (JSON) | Supporting | Explicit | TBD |

*Implicit requirements (industry-standard) will be added after research.*

## Non-Functional Requirements

| NFR-ID | Requirement | Category |
|--------|-------------|----------|
| NFR-01 | Dashboard < 2s cold start, real-time < 1s update, logging < 50ms overhead, aggregations < 500ms for 1M rows | Performance |
| NFR-02 | SHA-256 API keys, PII redaction, HTTPS, OWASP Top 10, parameterized queries, CSP headers, auth rate limiting | Security |
| NFR-03 | WCAG 2.1 AA, keyboard navigation, color-blind-safe palettes, screen reader labels | Accessibility |
| NFR-04 | Vercel deploy, preview on PRs, env vars for secrets, Prisma migrations in CI/CD, seed script for demo data | Deployment |
| NFR-05 | TypeScript strict, ESLint + Prettier pre-commit, 80% test coverage on business logic, E2E for critical flows | Code Quality |

## Out of Scope

- Multi-tenant organization support — portfolio demo targets single-team use
- Mobile native apps — web-only for this milestone
- Custom model fine-tuning UI — out of scope for monitoring platform
- Billing/payment integration — demo product, no monetization layer

## Traceability

| REQ-ID | Source | Status | Phase | Notes |
|--------|--------|--------|-------|-------|
| INFRA-01 | User spec | Active | TBD | |
| AUTH-01 | User spec | Active | TBD | |
| SEC-01 | User spec | Active | TBD | |
| OBS-01 | User spec | Active | TBD | |
| OBS-02 | User spec | Active | TBD | |
| PROMPT-01 | User spec | Active | TBD | |
| PROMPT-02 | User spec | Active | TBD | |
| EVAL-01 | User spec | Active | TBD | |
| EVAL-02 | User spec | Active | TBD | |
| REL-01 | User spec | Active | TBD | |
| ALERT-01 | User spec | Active | TBD | |
| COMP-01 | User spec | Active | TBD | |
| CONFIG-01 | User spec | Active | TBD | |
| DX-01 | User spec | Active | TBD | |
| REPORT-01 | User spec | Active | TBD | |
