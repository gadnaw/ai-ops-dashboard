---
phase: "05"
plan: "01"
subsystem: "evaluation"
tags: ["llm-judge", "gpt-4o", "fnv1a", "job-queue", "msw", "vitest", "prisma", "for-update-skip-locked"]

dependency-graph:
  requires:
    - "04-03"   # variant_metrics eval columns (eval_n, eval_score_sum)
    - "04-01"   # FNV-1a hash pattern established
    - "03-01"   # prompt_versions.id UUID type for experiment linkage
    - "02-01"   # request_logs with prompt_text/response_text columns
    - "02-02"   # model router + registry for GPT-4o judge calls
  provides:
    - "evaluation-service"      # judgeRequest, safeJudgeRequest, maybeQueueEvaluation
    - "evaluation-schema"       # evaluation_rubrics, evaluation_jobs, evaluation_scores tables
    - "msw-fixtures"            # MSW node server + openAI Responses API handlers
  affects:
    - "05-02"   # Human review queue reads evaluation_scores.requires_human_review
    - "05-03"   # Alert engine reads evaluation_scores.overall_score for eval_score_avg metric

tech-stack:
  added: []
  patterns:
    - "FOR UPDATE SKIP LOCKED queue pattern for async job processing"
    - "FNV-1a deterministic sampling (no Math.random) for evaluation trigger"
    - "AI SDK 6 generateText + Output.object() for structured LLM output"
    - "MSW v2 node server intercepting OpenAI Responses API (/v1/responses)"
    - "Partitioned table FK workaround: store UUID without DB-level FK constraint"

key-files:
  created:
    - "prisma/migrations/20260302000000_phase5_evaluation_tables/migration.sql"
    - "prisma/migrations/20260302000000_phase5_evaluation_tables/pg_cron_eval.sql"
    - "src/lib/evaluator/judge.ts"
    - "src/lib/evaluator/trigger.ts"
    - "src/lib/evaluator/rubric.ts"
    - "src/lib/evaluator/index.ts"
    - "src/app/api/internal/process-evaluations/route.ts"
    - "src/mocks/node.ts"
    - "src/mocks/handlers/openai.ts"
    - "src/lib/evaluator/__tests__/judge.test.ts"
  modified:
    - "prisma/schema.prisma"              # EvaluationRubric, EvaluationJob, EvaluationScore models
    - "src/lib/env.ts"                    # INTERNAL_CRON_SECRET added
    - ".env.example"                      # Phase 5 env vars documented
    - "src/app/api/v1/chat/route.ts"      # maybeQueueEvaluation() in after() callback

decisions:
  - id: "D-05-01-01"
    title: "No FK constraint from evaluation tables to request_logs"
    rationale: "request_logs is a range-partitioned table with composite PK (id, created_at). PostgreSQL cannot create FK constraints that reference only the id column of a partitioned table. Same pattern used by rate_limit_events.request_log_id in Phase 4."
    impact: "Application-layer integrity only. evaluation_jobs.request_id and evaluation_scores.request_id store UUID values with no DB enforcement."

  - id: "D-05-01-02"
    title: "OpenAI Responses API endpoint for MSW mocks"
    rationale: "@ai-sdk/openai v3 uses /v1/responses (Responses API) instead of /v1/chat/completions for generateText + Output.object(). MSW handlers must intercept /v1/responses with the correct response format (output array with message items)."
    impact: "MSW fixtures use buildResponsesFixture() helper. Handlers/openai.ts documents the format for future tests."

  - id: "D-05-01-03"
    title: "Re-derive variant assignment in updateVariantMetricsIfExperiment"
    rationale: "Phase 4 does not store experimentVariantId on request_logs — variant assignment is deterministic (FNV-1a of requestId + experimentId). The evaluation processor re-derives the assigned variant using the same assignVariant() function."
    impact: "Correct eval metrics accumulation for A/B experiments. Function imported from src/lib/ab-testing/hash.ts."

  - id: "D-05-01-04"
    title: "INTERNAL_CRON_SECRET is optional in env.ts"
    rationale: "Making it required would break local dev where the env var is not set. The route handler returns 401 when secret is missing, which is safe. Production deployments must set this variable."
    impact: "POST /api/internal/process-evaluations returns 401 without the secret in production."

metrics:
  duration: "13 minutes"
  completed: "2026-03-02"
  tasks: "3/3"
  tests: "25 passed (3 new evaluator tests + 22 existing)"
  deviations: 2
---

# Phase 05 Plan 01: Evaluation Service Summary

**One-liner:** GPT-4o judge pipeline with FNV-1a 10% sampling, FOR UPDATE SKIP LOCKED job queue, evaluation_rubrics/jobs/scores schema, and MSW-mocked Responses API Vitest tests.

## What Was Built

### Task 1: Evaluation Schema
Three new database tables applied via direct pg client migration (same pattern as all prior phases):

- **evaluation_rubrics** — stores scoring rubrics with JSONB dimensions array (id, name, description, weight, behavioral anchors). Seeded with "General Quality Rubric v1" (accuracy 40%, coherence 30%, safety 30%).
- **evaluation_jobs** — async queue with `status IN ('pending', 'in_progress', 'completed', 'failed')` and `attempt_count < 3` retry guard. Partial index on `(status, created_at) WHERE status IN ('pending', 'failed')` for queue polling.
- **evaluation_scores** — judge output store with `dimension_scores JSONB`, `overall_score NUMERIC(3,2)`, `reasoning TEXT`, `flags TEXT[]`, `requires_human_review BOOLEAN`, human review columns, and `created_at TIMESTAMPTZ` (ANALYSIS-REPORT constraint C7).

Prisma models added. No FK constraints to `request_logs` (partitioned table — composite PK incompatibility).

### Task 2: Judge Service + Sampling Trigger

- **judge.ts** — `judgeRequest()` uses AI SDK 6 `generateText + Output.object({ schema: EvaluationScoreSchema })` with GPT-4o at temperature 0.1. `safeJudgeRequest()` catches `NoObjectGeneratedError` and returns null.
- **trigger.ts** — `maybeQueueEvaluation()` uses FNV-1a 32-bit hash for deterministic 10% sampling. Same request ID always evaluates or always skips (analysis constraint M11).
- **rubric.ts** — `buildRubricText()` converts JSONB dimensions to judge system prompt text.
- **chat route updated** — `maybeQueueEvaluation(requestId, 0.1)` called in `after()` callback after logRequest() completes.
- **env.ts** — `INTERNAL_CRON_SECRET` (optional, min 32 chars) added for internal route protection.

### Task 3: Job Processor + Tests

- **process-evaluations route** — `POST /api/internal/process-evaluations` with `x-internal-secret` header validation. FOR UPDATE SKIP LOCKED picks 10 pending jobs atomically. `safeJudgeRequest()` evaluates each; scores written in a transaction with job status update.
- **Variant metrics update** — When evaluated request has a `promptVersionId` linked to a running experiment, the processor re-derives the variant assignment using `assignVariant()` and increments `variant_metrics.eval_score_sum` and `eval_n`.
- **MSW mocks** — `src/mocks/node.ts` (setupServer) + `src/mocks/handlers/openai.ts` intercepting `POST https://api.openai.com/v1/responses` (Responses API format used by @ai-sdk/openai v3).
- **Vitest tests** — 3 tests in `judge.test.ts`: structured scores validation, low-score detection, null on malformed output.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] request_logs FK constraint fails on partitioned table**

- **Found during:** Task 1, migration execution
- **Issue:** `REFERENCES request_logs(id)` fails with "there is no unique constraint matching given keys" because request_logs has composite PK `(id, created_at)` for range partitioning.
- **Fix:** Removed FK constraints from evaluation_jobs and evaluation_scores (same pattern as rate_limit_events.request_log_id from Phase 4). Also removed Prisma @relation decorators. Comments added explaining the design.
- **Files modified:** `prisma/migrations/.../migration.sql`, `prisma/schema.prisma`
- **Commits:** 43283c2

**2. [Rule 3 - Blocking] MSW handler intercepted wrong endpoint (/v1/chat/completions vs /v1/responses)**

- **Found during:** Task 3, test execution
- **Issue:** `@ai-sdk/openai` v3 uses the Responses API (`/v1/responses`) instead of Chat Completions. MSW handlers targeting `/v1/chat/completions` caused unhandled request warnings and test failures.
- **Fix:** Updated MSW handlers to intercept `/v1/responses` with correct Responses API response format (output array with message/output_text items). Also added `process.env.OPENAI_API_KEY` mock in test to bypass API key validation before HTTP interception.
- **Files modified:** `src/mocks/handlers/openai.ts`, `src/lib/evaluator/__tests__/judge.test.ts`
- **Commits:** f99a990

**3. [Rule 2 - Missing Critical] updateVariantMetricsIfExperiment adapted for no experimentVariantId column**

- **Found during:** Task 3, implementation
- **Issue:** Plan's `updateVariantMetricsIfExperiment()` assumed `requestLog.experimentVariantId` column exists. Critical conventions explicitly states this column does NOT exist.
- **Fix:** Look up `promptVersionId` from request_logs, find running experiment variants using that version, re-derive variant assignment using `assignVariant()` (FNV-1a, same as Phase 4 runtime), then update variant_metrics.
- **Files modified:** `src/app/api/internal/process-evaluations/route.ts`
- **Commits:** f99a990

## Next Phase Readiness

Plans 05-02 (Human Review) and 05-03 (Alert Engine) can now proceed:

- **For 05-02:** `evaluation_scores.requires_human_review = true` + `human_reviewed = false` is the human review queue filter. Use `prisma.evaluationScore.findMany({ where: { requiresHumanReview: true, humanReviewed: false } })`.
- **For 05-03:** `evaluation_scores.overall_score` accumulates over time. Alert engine can query average eval score from evaluation_scores joined to request_logs by requestId (no FK — join on equality).

**Key exports for Phase 5 plans 02-03:**

```typescript
// Evaluator service
import { judgeRequest, safeJudgeRequest, maybeQueueEvaluation, buildRubricText } from '@/lib/evaluator';
import type { EvaluationScore } from '@/lib/evaluator';

// MSW fixtures for tests
import { server } from '@/mocks/node';
import { openAIHandlers } from '@/mocks/handlers/openai';

// Internal processor endpoint
// POST /api/internal/process-evaluations (x-internal-secret: INTERNAL_CRON_SECRET)

// Prisma models
prisma.evaluationRubric    // rubric CRUD
prisma.evaluationJob       // queue reads — use $queryRaw for FOR UPDATE SKIP LOCKED
prisma.evaluationScore     // score reads for human review and alert metrics
```

**pg_cron setup:** `prisma/migrations/20260302000000_phase5_evaluation_tables/pg_cron_eval.sql` contains setup instructions for Supabase SQL Editor.
