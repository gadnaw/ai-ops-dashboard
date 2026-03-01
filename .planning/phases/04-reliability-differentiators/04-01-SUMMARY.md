---
phase: "04-reliability-differentiators"
plan: "04-01"
title: "Rate Limiter — PostgreSQL Token-Bucket, Four-Stage Degradation Chain, response_cache"
status: "complete"
subsystem: "rate-limiting"
tags: ["postgresql", "rate-limiting", "token-bucket", "pl-pgsql", "degradation", "caching"]
completed: "2026-03-01"
duration: "14 minutes"

requires:
  - "01-01"  # PrismaClient singleton + api_keys table
  - "02-02"  # streamWithFallback, /api/v1/chat route
  - "03-01"  # prompt_versions table (schema dependency)

provides:
  - RateLimiterInterface  # swappable abstraction at src/lib/rate-limiter/interface.ts
  - PostgresRateLimiter   # PL/pgSQL token bucket implementation
  - runDegradationChain   # four-stage graceful degradation orchestrator
  - ResponseCacheService  # SHA-256 keyed response store
  - RateLimitSchema       # rate_limit_buckets, rate_limit_events, response_cache tables

affects:
  - "04-02"  # Degradation visualization reads rate_limit_events table
  - "04-03"  # A/B testing may use getRateLimiter() interface
  - "05-01"  # Eval service may check rate limits on eval API keys

tech-stack:
  added: []  # No new dependencies — uses Node.js crypto module (built-in) + Prisma + pg
  patterns:
    - "PL/pgSQL atomic token bucket (UPDATE with RETURNING + INSERT ON CONFLICT)"
    - "Four-stage degradation chain (queue → fallback model → cached → 429 reject)"
    - "Singleton pattern via globalThis for rate limiter instance"
    - "SHA-256 prompt hashing for exact-match response cache"
    - "after() async callback for non-blocking cache writes"
    - "Swappable interface (RateLimiterInterface) for future Upstash Redis upgrade"

key-files:
  created:
    - prisma/migrations/20260301000004_phase4_rate_limiter/migration.sql
    - src/lib/rate-limiter/interface.ts
    - src/lib/rate-limiter/postgres-rate-limiter.ts
    - src/lib/rate-limiter/response-cache.ts
    - src/lib/rate-limiter/degradation-chain.ts
    - src/lib/rate-limiter/index.ts
  modified:
    - prisma/schema.prisma  # Added RateLimitBucket, RateLimitEvent, ResponseCache models + ApiKey relation
    - src/app/api/v1/chat/route.ts  # Phase 4 degradation chain + cache-write integration

decisions:
  - id: "04-01-D1"
    decision: "PostgreSQL PL/pgSQL for token bucket (no Upstash)"
    rationale: "Analysis constraint H2: do not install @upstash/redis or @upstash/ratelimit. PL/pgSQL atomic UPDATE + INSERT ON CONFLICT handles concurrent requests safely. RateLimiterInterface abstraction allows zero-call-site-change swap to Upstash."
  - id: "04-01-D2"
    decision: "SHA-256 of normalized (trim+lowercase+collapse-whitespace) prompt for cache key"
    rationale: "Exact-match cache requires deterministic hashing. Normalization prevents trivial misses from whitespace differences. Combined with model ID as composite unique key."
  - id: "04-01-D3"
    decision: "Degrade gracefully through 4 stages before 429 (not immediate rejection)"
    rationale: "Core demo narrative: show production-grade AI infrastructure. Hard 429 = amateur. Four stages (queue 10s, fallback model, cached response, reject) = enterprise-ready."
  - id: "04-01-D4"
    decision: "Rate limiting only applies to requests with Authorization: Bearer header"
    rationale: "Dashboard demo traffic (playground, API docs) should not be rate-limited. Only requests that provide an API key are subject to the degradation chain."
  - id: "04-01-D5"
    decision: "Migration applied via Node.js pg client (NOT prisma migrate dev)"
    rationale: "Established in 03-01: prisma migrate dev fails with 'Tenant or user not found' on pooler URL. Direct Supabase host (db.ksrmiaigyezhvuktimqt.supabase.co:5432) works reliably."
  - id: "04-01-D6"
    decision: "Stage 2 fallback uses same API key bucket (not separate per-model buckets)"
    rationale: "Simplicity for demo. A production system would have separate per-model rate limits. Documented in code comment. No separate bucket means Stage 2 also fails if bucket is deeply negative."
  - id: "04-01-D7"
    decision: "exactOptionalPropertyTypes fix: conditional spread for setCachedResponse opts"
    rationale: "TypeScript strict mode with exactOptionalPropertyTypes=true rejects passing undefined as optional number. Used conditional spread pattern (established in 02-02) for inputTokens/outputTokens."

metrics:
  completed: "2026-03-01"
  duration: "14 minutes"
  tasks: 3
  commits: 3
  files-created: 6
  files-modified: 2
---

# Phase 4 Plan 01: Rate Limiter — PostgreSQL Token-Bucket, Four-Stage Degradation Chain, response_cache Summary

**One-liner:** PostgreSQL PL/pgSQL token-bucket rate limiter with four-stage graceful degradation (queue → fallback model → cached response → 429) behind a swappable RateLimiterInterface.

## What Was Built

### Database Layer (Task 1)
Three new tables and one PL/pgSQL function added via direct SQL migration:

**`rate_limit_buckets`** — Token state per API key bucket (one row per key). Fields: `id` (TEXT PK, format `apikey:{uuid}:rpm`), `tokens` (DOUBLE PRECISION), `last_refill`, `capacity`, `refill_rate`.

**`rate_limit_events`** — Degradation audit log with one row per stage transition. Fields: `stage` (1-4), `stage_name`, `reason`, `bucket_id`, `queued_ms`, `fallback_model`, `cache_hit_key`, `retry_after_sec`. FK to `api_keys(id)`.

**`response_cache`** — SHA-256 keyed response store for Stage 3. Composite unique on `(prompt_hash, model)`. Includes `hit_count`, `expires_at`, `last_used_at` for cache management.

**`check_rate_limit(p_id, p_capacity, p_refill_rate)`** PL/pgSQL function — Atomic UPDATE with RETURNING. Refills accrued tokens since `last_refill`, subtracts 1 for the current request, returns remaining tokens. Returns -1 if rate-limited. Auto-initializes bucket on first call via INSERT ON CONFLICT.

RLS enabled on all 3 new tables. Seed rows added for `demo-bucket-low` (5 rpm) and `demo-bucket-high` (60 rpm).

### Service Layer (Task 2)

**`src/lib/rate-limiter/interface.ts`** — `RateLimiterInterface` with `check()` and `blockUntilReady()` methods. `RateLimitResult`, `DegradationResult`, `DegradationAction` types.

**`src/lib/rate-limiter/postgres-rate-limiter.ts`** — `PostgresRateLimiter` class. `check()` calls `check_rate_limit()` PL/pgSQL via `prisma.$queryRaw`. `blockUntilReady()` polls every 500ms up to `maxWaitMs`.

**`src/lib/rate-limiter/response-cache.ts`** — `hashPrompt()` (SHA-256 of normalized prompt), `getCachedResponse()` (unique lookup with TTL check and hit-count update), `setCachedResponse()` (upsert with 24h default TTL).

**`src/lib/rate-limiter/degradation-chain.ts`** — `runDegradationChain()` orchestrator:
- **Stage 1:** Queue — `blockUntilReady(apiKeyId, 10_000)` — returns `proceed` if token available within 10s
- **Stage 2:** Fallback model — `FALLBACK_MODEL_MAP` lookup → cheaper model → `check()` again → returns `proceed` with `isFallback: true`
- **Stage 3:** Cached response — `getCachedResponse(promptHash, requestedModel)` → returns `cached` with `cachedResponse` text
- **Stage 4:** Reject — returns `reject` with `retryAfterSec`
- Each stage transition creates a `rate_limit_events` row via `prisma.rateLimitEvent.create()`

**`src/lib/rate-limiter/index.ts`** — `getRateLimiter()` singleton factory via `globalThis`. Re-exports all public symbols.

### Route Integration (Task 3) — Cross-Phase H10

**`src/app/api/v1/chat/route.ts`** modified with:
- `effectiveModelId` declared as `let` (allows Stage 2 override)
- Authorization header extraction and SHA-256 key hash lookup against `api_keys`
- `runDegradationChain()` called before LLM routing for authenticated requests
- `reject` response: HTTP 429 with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-Degradation-Stages` headers
- `cached` response: HTTP 200 with `X-Served-From: cache`, `X-Cache-Hit: true`, `X-Degradation-Stages` headers
- `proceed` response: continues to `streamWithFallback()` (uses `degradation.model` if Stage 2 overrode it)
- `after()` callback: `setCachedResponse()` called after each successful LLM completion

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed unused DEFAULT_REFILL_RATE constant**

- **Found during:** Task 2 lint check
- **Issue:** `DEFAULT_REFILL_RATE = 1.0` was declared but never used (refill rate is computed from `capacity / 60.0`). ESLint `no-unused-vars: error` caught it.
- **Fix:** Removed the constant — the `refillRate` is always computed inline from `capacity / 60.0`
- **Files modified:** `src/lib/rate-limiter/postgres-rate-limiter.ts`

**2. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes error in setCachedResponse call**

- **Found during:** Task 3 type-check
- **Issue:** `{ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }` passes `number | undefined` where `exactOptionalPropertyTypes: true` requires the field to be absent (not `undefined`) when not set.
- **Fix:** Applied conditional spread pattern (established in 02-02): `...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {})`
- **Files modified:** `src/app/api/v1/chat/route.ts`

## Cross-Phase Modifications (H10)

`/api/v1/chat` (Phase 2 code) was modified to:
1. Import and call `runDegradationChain()` before LLM routing
2. Handle `reject`/`cached`/`proceed` actions
3. Write successful LLM responses to `response_cache` in the `after()` callback

This is the documented H10 cross-phase constraint — Phase 4 scope explicitly includes modifying the Phase 2 chat route.

## Interface Provided to 04-02 and 04-03

### RateLimiterService
```typescript
import { getRateLimiter } from '@/lib/rate-limiter';
const limiter = getRateLimiter();
await limiter.check(apiKeyId);          // check + consume 1 token
await limiter.blockUntilReady(apiKeyId, 10_000); // poll up to 10s
```

### DegradationChain
```typescript
import { runDegradationChain } from '@/lib/rate-limiter';
const result = await runDegradationChain(apiKeyId, prompt, model, rateLimiter);
// result.action: 'proceed' | 'cached' | 'reject'
// result.stagesTraversed: number[]  (e.g. [1, 2, 3, 4])
```

### ResponseCacheService
```typescript
import { getCachedResponse, setCachedResponse, hashPrompt } from '@/lib/rate-limiter';
const cached = await getCachedResponse(promptHash, model);
await setCachedResponse(prompt, model, responseText, { inputTokens, outputTokens });
const hash = hashPrompt(prompt); // SHA-256 of normalized prompt — for 04-02 visualization
```

### RateLimitSchema (for 04-02 queries)
- `rate_limit_events`: read via `prisma.rateLimitEvent.findMany()` for degradation timeline viz
- `rate_limit_buckets`: read via raw SQL for current token state display
- `response_cache`: read via `prisma.responseCache.findMany()` for cache stats

## Commits

| Hash | Message |
|------|---------|
| `bdf211e` | feat(04-01): add rate_limit_buckets, rate_limit_events, response_cache schema and check_rate_limit() function |
| `a26cd1a` | feat(04-01): add RateLimiterInterface, PostgresRateLimiter, queue, and four-stage degradation chain |
| `7516885` | feat(04-01): integrate degradation chain into /api/v1/chat with cache-write and rate-limit headers |

## Verification Results

- `pnpm type-check` — passes (0 errors)
- `pnpm lint` — passes (0 warnings)
- `pnpm build` — passes (all 18 routes compile)
- Migration applied: `rate_limit_buckets`, `rate_limit_events`, `response_cache` tables exist in production DB
- `check_rate_limit()` function verified: returns 59 on first call for 60-capacity bucket
- Prisma types generated: `prisma.rateLimitBucket`, `prisma.rateLimitEvent`, `prisma.responseCache` available

## Next Phase Readiness

**Phase 04-02 (Degradation Visualization)** can start immediately:
- `rate_limit_events` table populated on every degradation transition
- `getRateLimiter()`, `runDegradationChain()` available as singleton services
- `hashPrompt()` exported for cache hit rate visualization

**Phase 04-03 (A/B Testing)** can start immediately:
- No blocking dependencies on 04-01 completion (A/B testing is independent)
- If A/B test variants need rate limiting, use `getRateLimiter()` from index.ts

---
*Generated: 2026-03-01*
*Executor: /gsd:execute-phase 4 — Plan 04-01*
