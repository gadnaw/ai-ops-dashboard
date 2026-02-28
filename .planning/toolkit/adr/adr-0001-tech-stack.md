# ADR-0001: Technology Stack Selection

**Status:** Accepted
**Date:** 2026-03-01
**Phase:** Pre-planning (project initialization)

## Context

Building a production-grade AI operations dashboard as a portfolio demo. The tech stack must demonstrate proficiency across the highest-demand Upwork job categories (Next.js 36%, AI/LLM 34%, Supabase/BaaS 16%) while being technically sound for the monitoring/observability domain.

## Decision

- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript 5
- **AI Orchestration:** Vercel AI SDK 6 (replaces originally planned LangChain)
- **Database:** Supabase (PostgreSQL + Realtime + Auth)
- **ORM:** Prisma 7 with dual-client strategy (Prisma for CRUD, Supabase client for hot-path writes)
- **Charts:** Recharts 3.7
- **State:** Zustand 5
- **Styling:** Tailwind CSS 4
- **Testing:** Vitest + Playwright
- **Deployment:** Vercel
- **Rate Limiting:** PostgreSQL token bucket (Upstash Redis as upgrade path)

## Consequences

### Positive
- Vercel AI SDK provides native multi-provider routing via `createProviderRegistry()`, 34% smaller bundle than LangChain, edge runtime compatible
- Next.js 15 `after()` API enables fire-and-forget logging without blocking responses
- Prisma 7 pure TypeScript engine eliminates Rust dependency, dramatically better serverless cold starts
- Dual-client strategy mitigates Prisma high-write concerns for logging workload
- Stack covers 100% of target Upwork job categories

### Negative
- Prisma 7 high-write performance at scale is unproven beyond vendor benchmarks
- Recharts 3.x migration docs are sparse; most community examples use 2.x API
- Supabase free tier has meaningful limits (200 realtime connections, 60 DB connections)

### Neutral
- PostgreSQL-backed rate limiting adds ~15ms per check; acceptable for demo, Upstash available as upgrade
- SPRT for A/B auto-stop is niche — implementation research needed in Phase 4

## Alternatives Considered

- **LangChain:** Rejected — category mismatch for monitoring (application-building framework, not observability), 400+ transitive deps, blocks edge runtime, 34% larger bundle. 3-way research consensus.
- **Next.js 14:** Rejected — two versions behind, missing `after()` API, no Turbopack, no React 19.
- **Drizzle ORM:** Considered — closer to SQL, slightly better raw performance. Rejected for weaker migration tooling and less ecosystem support with Supabase.
- **D3 for charts:** Rejected — overkill for dashboard use cases, Recharts is React-native and sufficient.
- **Upstash Redis for rate limiting:** Deferred — adds service dependency; PostgreSQL approach is sufficient for demo scale.
