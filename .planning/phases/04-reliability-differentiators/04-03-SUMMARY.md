---
phase: "04-reliability-differentiators"
plan: "04-03"
title: "A/B Testing — Traffic Split, Accumulator Metrics, SPRT Auto-Stop, Management UI"
subsystem: "ab-testing"
tags: ["sprt", "ab-testing", "fnv1a", "statistics", "recharts", "prisma"]
status: "completed"
completed: "2026-03-01"
duration: "~90 minutes"

dependency-graph:
  requires:
    - "03-01"   # prompt_versions table, rollbackToVersion() action
    - "04-01"   # profiles table FK, prisma client patterns
  provides:
    - "ab-testing schema (experiments, experiment_variants, variant_metrics, sprt_history)"
    - "FNV-1a deterministic traffic splitting"
    - "SPRT engine with Wald boundaries"
    - "Accumulator metrics with SELECT FOR UPDATE row lock"
    - "Experiment REST API (GET/POST/PATCH)"
    - "Management UI at /experiments and /experiments/[id]"
  affects:
    - "05-*"    # eval columns in variant_metrics for Phase 5 LLM judge scores

tech-stack:
  added: []
  patterns:
    - "FNV-1a 32-bit hash for deterministic traffic splitting (M11 constraint)"
    - "Accumulator columns (sum/sum_sq/n) with SELECT FOR UPDATE row lock (H8 constraint)"
    - "SPRT Wald boundaries: upper=ln(16)≈2.773, lower=ln(0.2105)≈-1.558 for α=0.05, β=0.20"
    - "Module-level experiment cache with 30s TTL to avoid per-request DB queries"
    - "use-client lazy wrapper pattern (src/components/experiments/lazy.tsx) for SSR-safe Recharts in Server Components"

key-files:
  created:
    - prisma/migrations/20260301000005_phase4_ab_testing/migration.sql
    - src/lib/ab-testing/hash.ts
    - src/lib/ab-testing/sprt.ts
    - src/lib/ab-testing/metrics.ts
    - src/lib/ab-testing/experiment-runner.ts
    - src/app/api/v1/experiments/route.ts
    - src/app/api/v1/experiments/[id]/route.ts
    - src/app/api/v1/experiments/[id]/metrics/route.ts
    - src/app/(dashboard)/experiments/page.tsx
    - src/app/(dashboard)/experiments/[id]/page.tsx
    - src/app/(dashboard)/experiments/[id]/components/SPRTChart.tsx
    - src/app/(dashboard)/experiments/[id]/components/VariantMetricsTable.tsx
    - src/app/(dashboard)/experiments/[id]/components/ExperimentControls.tsx
    - src/components/experiments/lazy.tsx
  modified:
    - prisma/schema.prisma
    - src/app/api/v1/chat/route.ts
    - src/components/layout/nav.tsx
    - src/app/(dashboard)/degradation/components/DegradationTimeline.tsx

decisions:
  - id: "FNV-1a-over-crypto"
    summary: "Used Math.imul() FNV-1a 32-bit hash for deterministic traffic splitting"
    rationale: "No external dependencies, compatible with Edge Runtime, 5ns per hash vs crypto.createHash overhead. Analysis constraint M11."
  - id: "accumulator-over-welford"
    summary: "Simple sum/sum_sq/n accumulators instead of Welford's online algorithm"
    rationale: "Concurrent SQL increments to sum/sum_sq are safe; Welford's mean/M2 has race conditions under concurrent writes. H8 constraint."
  - id: "select-for-update-lock"
    summary: "SELECT FOR UPDATE row lock in prisma.$transaction for SPRT update"
    rationale: "Ensures SPRT state is consistent with accumulated metrics; prevents interleaved partial updates from concurrent requests."
  - id: "sprt-over-t-tests"
    summary: "SPRT with Wald boundaries instead of repeated t-tests"
    rationale: "Repeated t-tests with early stopping inflate Type I error from 5% to ~30% (peeking bias). SPRT controls error rates at α=0.05, β=0.20 regardless of when you check."
  - id: "lazy-wrapper-for-recharts"
    summary: "Created src/components/experiments/lazy.tsx as 'use client' wrapper for dynamic imports"
    rationale: "Next.js 16 disallows next/dynamic with ssr:false in Server Components. Pattern follows Phase 2 src/components/charts/lazy.tsx."
  - id: "url-path-correction"
    summary: "Experiments at /experiments (not /dashboard/experiments)"
    rationale: "Route group (dashboard) adds no URL segment. Nav link corrected to /experiments."
  - id: "prompt-version-id-uuid"
    summary: "experiment_variants.prompt_version_id is UUID (not TEXT)"
    rationale: "prompt_versions.id is UUID type. FK constraint would fail with TEXT column. Fixed during migration application."
  - id: "ab-integration-reads-cost-from-db"
    summary: "A/B runner reads costUsd from request_log after logRequest() completes"
    rationale: "The after() callback computes costUsd during logRequest(). Reading from DB after ensures we get the accurate persisted value."

metrics:
  commits: 3
  tasks: 3
  deviations: 3
---

# Phase 4 Plan 03: A/B Testing — Traffic Split, Accumulator Metrics, SPRT Auto-Stop, Management UI Summary

**One-liner:** Complete A/B testing framework with FNV-1a traffic splitting, SELECT FOR UPDATE accumulator metrics, SPRT Wald boundary auto-stop (upper≈2.773, lower≈-1.558), and Recharts SPRT trajectory UI.

## What Was Built

### Task 1 — Schema and Migration

Four new tables in `prisma/migrations/20260301000005_phase4_ab_testing/migration.sql`:

- **experiments** — experiment definition (status, primaryMetric, mde, alpha, beta, minSamples, maxSamples, winner_variant_id)
- **experiment_variants** — variants with traffic weights and optional prompt_version_id FK
- **variant_metrics** — one row per variant with accumulator columns (latency_sum/sum_sq/n, cost_sum/n, error_count) and SPRT state (sprt_llr, sprt_decision)
- **sprt_history** — LLR snapshots every 10 observations for SPRT trajectory chart

FK constraints:
- `fk_experiment_variant_prompt_version` → `prompt_versions(id) ON DELETE SET NULL`
- `fk_experiment_created_by` → `profiles(id) ON DELETE CASCADE`
- `fk_experiment_winner_variant` → `experiment_variants(id) ON DELETE SET NULL`

RLS: select_all policies on all 4 tables (service role for writes). Seed demo experiment from first ADMIN profile.

Bug fix (Rule 1): `prompt_version_id` column uses UUID type (not TEXT) to match `prompt_versions.id` — discovered when FK constraint failed during migration.

### Task 2 — Service Layer

**src/lib/ab-testing/hash.ts:**
- `fnv1a32(str)` — FNV-1a 32-bit hash using Math.imul() for C-like 32-bit multiplication
- `assignVariant(requestId, experimentId, splits)` — deterministic bucket assignment via cumulative distribution walk
- `verifyDistribution(splits, n)` — distribution test utility

**src/lib/ab-testing/sprt.ts:**
- `initSPRT(alpha, beta)` — Wald boundaries: upper = ln((1-β)/α) ≈ 2.773, lower = ln(β/(1-α)) ≈ -1.558
- `updateSPRTProportions(state, obs, p0, delta)` — incremental LLR for error rate proportion test
- `computeSequentialZTest(...)` — Statsig-style sequential z-test for continuous metrics (latency, cost)
- `checkSPRT(state, minSamples)` — decision with 200-sample minimum guard
- `computeEffectSize()`, `proportionCI()` — supporting utilities

**src/lib/ab-testing/metrics.ts:**
- `computeVariantStats(metrics)` — compute mean/errorRate from accumulators at read time
- `recordVariantObservation(variantId, ...)` — prisma.$transaction with SELECT FOR UPDATE + UPDATE accumulator + SPRT check

**src/lib/ab-testing/experiment-runner.ts:**
- 30-second module-level experiment cache (avoids DB query per request in critical path)
- `getActiveExperiment(promptVersionId)` — find running experiment for a prompt version
- `runExperiment(experimentId, requestId, latencyMs, costUsd, isError)` — assign variant, record observation, run cross-variant SPRT for continuous metrics, trigger auto-stop, snapshot sprt_history every 10 observations

### Task 3 — API Routes, Chat Integration, and UI

**API Routes:**
- `GET /api/v1/experiments` — list all with variant counts
- `POST /api/v1/experiments` — create with variant validation (weight sum ≈ 1.0)
- `GET /api/v1/experiments/[id]` — full detail with variants + metrics
- `PATCH /api/v1/experiments/[id]` — actions: start (draft→running), stop (→stopped), promote_winner (calls rollbackToVersion() + status→completed)
- `GET /api/v1/experiments/[id]/metrics` — variant stats + SPRT history for charts

**Chat Integration:**
Added to `/api/v1/chat` after() callback:
```typescript
const experiment = await getActiveExperiment(resolvedPromptVersionId);
if (experiment) {
  await runExperiment(experiment.id, requestId, durationMs, costUsd, false);
}
```
Wrapped in try/catch — A/B recording failure never propagates to response.

**Management UI:**
- `/experiments` — list page with status badges, variant count, metric type
- `/experiments/[id]` — detail page with:
  - Status badge + experiment metadata (α, β, MDE, minSamples)
  - ExperimentControls — Start/Stop/Promote Winner buttons
  - SPRTChart — Recharts LineChart with LLR trajectory, upper/lower boundary reference lines, minSamples vertical line
  - VariantMetricsTable — per-variant error rate, avg latency, avg cost, eval score (—), SPRT status badge

**lazy.tsx pattern:** `src/components/experiments/lazy.tsx` — "use client" wrapper with dynamic imports for SPRTChartLazy, VariantMetricsTableLazy, ExperimentControlsLazy. Server Component page imports these to avoid Next.js 16 pitfall P18.

**Nav:** Added "Experiments" link at `/experiments` to `src/components/layout/nav.tsx`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] prompt_version_id column type UUID (not TEXT)**
- **Found during:** Task 1 migration application
- **Issue:** Original migration used TEXT for experiment_variants.prompt_version_id but prompt_versions.id is UUID. FK constraint failed: "cannot be implemented".
- **Fix:** Changed column type to UUID in both migration.sql and prisma/schema.prisma.
- **Files modified:** `prisma/migrations/20260301000005_phase4_ab_testing/migration.sql`, `prisma/schema.prisma`

**2. [Rule 1 - Bug] DegradationTimeline.tsx Recharts Tooltip type error**
- **Found during:** Task 1 type-check
- **Issue:** Pre-existing error from Phase 04-02. Recharts Tooltip `formatter` expected `name: string | undefined` but TypeScript Recharts types require `unknown`.
- **Fix:** Changed formatter parameter types to `(value: unknown, name: unknown)`.
- **Files modified:** `src/app/(dashboard)/degradation/components/DegradationTimeline.tsx`

**3. [Rule 3 - Deviation] URL path: /experiments not /dashboard/experiments**
- **Found during:** Task 3 build output verification
- **Issue:** Plan specified nav link to `/dashboard/experiments` but route group `(dashboard)` adds no URL segment — pages render at `/experiments`.
- **Fix:** Changed nav href to `/experiments`, list page link to `/experiments/[id]`.
- **Files modified:** `src/components/layout/nav.tsx`, `src/app/(dashboard)/experiments/page.tsx`

## Cross-Phase Concerns

### Phase 5 Integration Points

**variant_metrics eval columns (nullable):**
- `eval_n INTEGER` — Phase 5 increments after LLM judge scores request
- `eval_score_sum DOUBLE PRECISION` — Phase 5 adds `overall_score` from eval_scores table
- Pattern: `prisma.variantMetric.update({ where: { variantId }, data: { evalN: { increment: 1 }, evalScoreSum: { increment: overallScore } } })`

**VariantMetricsTable:** Shows `—` for eval scores until Phase 5 populates them (no UI change needed).

## Interface Provided to Phase 5

```typescript
// A/B experiment recording in after() callbacks
import { getActiveExperiment, runExperiment } from '@/lib/ab-testing/experiment-runner';

// Variant stats computation
import { computeVariantStats } from '@/lib/ab-testing/metrics';

// SPRT boundaries (locked)
// upper = ln((1-0.20)/0.05) ≈ 2.773
// lower = ln(0.20/(1-0.05)) ≈ -1.558

// Tables for Phase 5 eval score updates:
// variant_metrics.eval_n (increment)
// variant_metrics.eval_score_sum (increment overall_score)
```

## Next Phase Readiness

Phase 5 can safely:
- Read variant_metrics for eval score columns (nullable, default null)
- Update eval_n/eval_score_sum after judge evaluation
- Use computeVariantStats() to display avg_eval_score in the table
- Create new experiments via POST /api/v1/experiments and start them
