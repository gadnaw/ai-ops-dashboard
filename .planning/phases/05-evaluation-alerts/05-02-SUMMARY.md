---
phase: "05"
plan: "02"
subsystem: "evaluation-ui"
tags: [evaluation, human-review, recharts, server-actions, server-components, client-islands]
dependency-graph:
  requires: ["05-01"]
  provides: ["ReviewQueueUI", "EvaluationDashboardUI", "EvaluationAPI"]
  affects: ["05-03"]
tech-stack:
  added: []
  patterns: ["Server Component + Client Island", "raw SQL join for partitioned tables", "lazy.tsx SSR wrapper"]
key-files:
  created:
    - src/app/actions/evaluation.ts
    - src/app/api/v1/evaluation/route.ts
    - src/components/evaluation/ScoreDisplay.tsx
    - src/components/evaluation/QueueStats.tsx
    - src/components/evaluation/ReviewInteractionPanel.tsx
    - src/components/evaluation/EvalTrend.tsx
    - src/components/evaluation/lazy.tsx
    - src/app/(dashboard)/evaluation/page.tsx
    - src/app/(dashboard)/evaluation/review/page.tsx
    - src/app/(dashboard)/evaluation/review/loading.tsx
  modified:
    - src/components/layout/nav.tsx
decisions:
  - id: "raw-sql-join-for-review-queue"
    decision: "Used raw SQL with LEFT JOIN for review queue and evaluation API because EvaluationScore has no Prisma relation to RequestLog (partitioned table, no FK constraints)"
    rationale: "Prisma include/select with relations requires FK constraints. request_logs is partitioned and cannot have FK constraints. Raw SQL provides the join capability."
  - id: "server-action-try-catch"
    decision: "approveScore/overrideScore return { success: true } | { error: string } instead of throwing"
    rationale: "Follows established pattern from 02-04 decisions. Client components use 'error' in result discriminated union."
  - id: "removed-judgeOverall-prop"
    decision: "Removed judgeOverall prop from ReviewInteractionPanel since it was unused in the component body"
    rationale: "ESLint no-unused-vars rule requires all destructured props to be used. The overall score is shown in the card header via ScoreDisplay, not inside the interaction panel."
metrics:
  duration: "12 minutes"
  completed: "2026-03-02"
  tasks: "3/3"
---

# Phase 05 Plan 02: Human Review Queue Summary

Built the human review queue UI and evaluation score trends dashboard, completing the "human in the loop" component for the evaluation pipeline. Reviewers can visit /evaluation/review to see low-scoring requests, approve judge scores or override them with per-dimension corrections, and annotate with notes. The /evaluation page shows quality trends over time alongside score breakdowns by model.

## What Was Built

### Server Actions (src/app/actions/evaluation.ts)
- `approveScore()`: Sets human_reviewed=true, copies overall_score as final_score, records reviewer identity
- `overrideScore()`: Recomputes weighted final_score (accuracy 40%, coherence 30%, safety 30%) from human overrides merged with judge dimension scores
- Both actions use getSession() for auth, try/catch with { error } return, and revalidatePath for /evaluation/review and /evaluation

### REST API (GET /api/v1/evaluation/scores)
- Paginated evaluation scores endpoint with LEFT JOIN to request_logs via raw SQL
- Query parameters: page, pageSize (max 100), days (max 90)
- Returns scores with request metadata (model, provider, promptVersionId, endpoint)

### Review Queue Page (/evaluation/review)
- Server Component page with raw SQL query joining evaluation_scores to request_logs
- Orders pending reviews by worst score first (overall_score ASC)
- QueueStats component: pending count, reviewed today, average pending score
- Per-item card: overall score badge, per-dimension score badges, original prompt, model response
- ReviewInteractionPanel Client Island per card: dimension override inputs (1-5), notes textarea, approve/override buttons
- ScoreDisplay component: color-coded badges (green 4+, yellow 3-4, red <3)
- Loading skeleton for Suspense boundary

### Evaluation Overview Page (/evaluation)
- Server Component with 30-day rolling aggregations
- Summary stats: avg overall score, total evaluated, pending review, below-threshold percentage
- EvalTrend Recharts line chart (via lazy.tsx SSR wrapper) with review threshold reference line
- Per-model score breakdown table via raw SQL join
- Review Queue link with pending count badge (conditionally shown)

### Navigation
- Added "Evaluation" link to nav.tsx between Experiments and Config

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] No Prisma relation for request_logs join**
- **Found during:** Task 1 (evaluation API), Task 2 (review queue page)
- **Issue:** Plan used `include: { request: { select: ... } }` but EvaluationScore has no Prisma relation to RequestLog because request_logs is partitioned (no FK constraints)
- **Fix:** Used raw SQL with LEFT JOIN for all queries that need request metadata
- **Files modified:** src/app/api/v1/evaluation/route.ts, src/app/(dashboard)/evaluation/review/page.tsx, src/app/(dashboard)/evaluation/page.tsx
- **Commits:** 0b22585, 5d7b716, febdab2

**2. [Rule 1 - Bug] Unused judgeOverall prop caused ESLint error**
- **Found during:** Task 2 (ReviewInteractionPanel)
- **Issue:** judgeOverall was passed as prop but never used in component body, causing no-unused-vars ESLint error
- **Fix:** Removed judgeOverall from interface and props entirely
- **Files modified:** src/components/evaluation/ReviewInteractionPanel.tsx, src/app/(dashboard)/evaluation/review/page.tsx
- **Commit:** 5d7b716

**3. [Rule 1 - Bug] Recharts Tooltip formatter type mismatch**
- **Found during:** Task 3 (EvalTrend)
- **Issue:** Tooltip formatter with `(value: unknown, name: unknown)` signature and labelFormatter with `(label: string)` did not match Recharts v3 strict types
- **Fix:** Used established pattern `(v: number | undefined) => [formatted, label]` and removed labelFormatter
- **Files modified:** src/components/evaluation/EvalTrend.tsx
- **Commit:** febdab2

**4. [Rule 3 - Blocking] Json type cast requires unknown intermediate**
- **Found during:** Task 2 (review queue page)
- **Issue:** Casting Prisma Json type directly to RubricDimension[] fails TypeScript strict check
- **Fix:** Used `as unknown as RubricDimension[]` double cast pattern
- **Files modified:** src/app/(dashboard)/evaluation/review/page.tsx
- **Commit:** 5d7b716

**5. [Rule 2 - Missing Critical] Added lazy.tsx SSR wrapper for EvalTrend**
- **Found during:** Task 3
- **Issue:** Plan specified EvalTrend as 'use client' component but did not include lazy.tsx wrapper needed for Server Component page import
- **Fix:** Created src/components/evaluation/lazy.tsx following established per-feature pattern (04-02 decision), used revalidate=0 instead of export const dynamic
- **Files modified:** src/components/evaluation/lazy.tsx, src/app/(dashboard)/evaluation/page.tsx
- **Commit:** febdab2

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 0b22585 | Server Actions (approveScore, overrideScore) and REST endpoint |
| 2 | 5d7b716 | ReviewInteractionPanel, QueueStats, ScoreDisplay, review queue page |
| 3 | febdab2 | EvalTrend chart, lazy wrapper, evaluation overview page, nav link |

## Verification

- `pnpm type-check` passes with zero errors
- `pnpm build` passes with zero errors
- Routes /evaluation and /evaluation/review generated as dynamic (f) routes
- No 'use client' in page.tsx files; only in ReviewInteractionPanel.tsx, EvalTrend.tsx, and lazy.tsx
- isAnimationActive={false} set on EvalTrend Line component

## Next Phase Readiness

Plan 05-03 (Alert Engine) can proceed. The evaluation UI is complete and functional. Key interfaces available:
- Server Actions: `import { approveScore, overrideScore } from '@/app/actions/evaluation'`
- REST: `GET /api/v1/evaluation/scores?page=1&pageSize=50&days=30`
- Components: ScoreDisplay, QueueStats, ReviewInteractionPanel, EvalTrend (via lazy.tsx)
- Routes: /evaluation (overview), /evaluation/review (queue)
- Nav: Evaluation link added to nav.tsx
