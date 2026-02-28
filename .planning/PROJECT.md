# AI Ops Dashboard — Production LLM Monitoring

## What This Is

A production-grade AI operations platform that gives engineering teams real-time visibility into their LLM integrations — prompt versioning, per-request cost tracking, latency monitoring, and graceful degradation under load. Built as a portfolio demo that proves the ability to ship AI infrastructure that runs reliably at scale with multi-model routing, evaluation pipelines, and anomaly alerting.

## Core Value

**Ship AI that works in production, not just in notebooks.** This platform demonstrates the exact operational layer that separates hobbyist LLM integrations from production-grade AI systems — the monitoring, cost control, fallback routing, and evaluation infrastructure that real clients need but rarely see in portfolios.

## Project Mode

Greenfield

## Requirements

### Active

- [ ] INFRA-01: Multi-model routing engine supporting OpenAI, Claude, and Gemini with configurable fallback chains
- [ ] PROMPT-01: Prompt version control system with named versions, diff view, and rollback capability
- [ ] PROMPT-02: A/B test framework comparing prompt versions with statistical significance tracking
- [ ] OBS-01: Per-request cost and latency tracking with breakdown by model, prompt version, and endpoint
- [ ] OBS-02: Real-time dashboard with cost trends, latency percentiles (p50/p95/p99), and error rates via Recharts
- [ ] EVAL-01: Evaluation pipeline with structured scoring rubrics and human-in-the-loop review queue
- [ ] REL-01: Rate limiting with token bucket algorithm and graceful degradation (queue → fallback model → cached response → error)
- [ ] ALERT-01: Webhook alerts for anomaly detection: cost spikes, latency regression, error rate thresholds
- [ ] AUTH-01: Supabase Auth with role-based access: Admin, Developer, Viewer
- [ ] SEC-01: API key management with per-key usage tracking and rotation support
- [ ] COMP-01: Request/response logging with PII redaction and configurable retention policies
- [ ] CONFIG-01: Model configuration UI for adjusting temperature, max tokens, system prompts per endpoint
- [ ] EVAL-02: Batch evaluation mode for running prompt versions against test datasets
- [ ] DX-01: Streaming response support with real-time token count display in the playground
- [ ] REPORT-01: Export functionality for cost reports (CSV) and evaluation results (JSON)

### Out of Scope

- Multi-tenant organization support — portfolio demo targets single-team use
- Mobile native apps — web-only for this milestone
- Custom model fine-tuning UI — out of scope for monitoring platform
- Billing/payment integration — demo product, no monetization layer

## Context

- **Purpose:** Portfolio demonstration for Upwork freelance positioning
- **Target audience:** Engineering managers and AI teams evaluating LLM infrastructure capabilities
- **Market alignment:** Covers 7 Upwork job categories: AI/LLM API Integration (34%), Next.js Full-Stack (36%), Supabase/BaaS (16%), Dashboard/Data Viz (10%), SaaS Architecture, Production Reliability, AI Evaluation
- **Demo strategy:** Ships with seed data (10K requests, 5 prompt versions, 2 A/B tests) for instant demonstration without live API keys

## Constraints

- **Tech stack**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase, Prisma, LangChain, Recharts, Vercel — chosen to match highest-demand Upwork job requirements
- **Performance**: Dashboard cold start < 2s, real-time updates < 1s, logging overhead < 50ms, aggregation queries < 500ms for 1M requests
- **Security**: OWASP Top 10 compliance, SHA-256 hashed API keys, RLS enforcement, PII redaction
- **Quality**: TypeScript strict mode, ESLint + Prettier, 80% test coverage on business logic, E2E tests for critical flows
- **Deployment**: Vercel with preview deployments on PRs, Prisma migrations in CI/CD

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js 14 App Router | Matches 100% of target Upwork jobs requiring Next.js | — Pending |
| Supabase over custom auth | Auth + DB + RLS + real-time in one service, matches 16% of job listings | — Pending |
| LangChain for orchestration | Provider-agnostic model abstraction, explicitly requested in target jobs | — Pending |
| Prisma ORM | Type-safe DB access, migration support, database-agnostic if migrating from Supabase later | — Pending |
| Recharts over D3 | Lighter weight for dashboard use cases, React-native, sufficient for monitoring charts | — Pending |
| Zustand for client state | Lightweight state management for dashboard filters and real-time updates | — Pending |

## Marketing Brief

**Value Proposition:** Production-grade AI operations dashboard that gives engineering teams real-time visibility into LLM costs, performance, and quality across multiple providers
**Target Audience:** Engineering managers, AI/ML leads, and platform engineers running LLM integrations in production
**Core Message:** Ship AI that works in production — monitoring, cost control, fallback routing, and evaluation infrastructure that separates hobby projects from production-grade systems
**Competitive Angle:** Unlike basic API wrappers or prototype-stage demos, this shows the full operational layer: multi-model routing, prompt versioning, A/B testing, evaluation pipelines, and anomaly alerting — all in one dashboard
**Brand Voice Direction:** Technical-professional — confident, specific, backed by real numbers and architectural decisions

---
*Last updated: 2026-03-01 after project initialization*
