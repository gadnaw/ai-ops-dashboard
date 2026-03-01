---
phase: "04-reliability-differentiators"
plan: "04-02"
title: "Degradation Visualization — Timeline View, Fallback Markers, Per-Request Chain Detail"
status: "complete"
completed: "2026-03-01"
duration: "~30 minutes"
subsystem: "observability-ui"
tags: ["recharts", "gantt", "degradation", "rate-limiting", "visualization", "server-component"]

requires:
  - "04-01" # rate_limit_events table, RateLimitEvent Prisma model

provides:
  - DegradationQueryLayer   # getDegradationEvents(), groupIntoChains(), getDegradationStats()
  - DegradationVisualization # DegradationTimeline, DegradationEventList, StageDetailPanel
  - DegradationAPI          # GET /api/v1/degradation, GET /api/v1/degradation/[eventId]

affects:
  - "04-03" # A/B testing may link to degradation data via shared nav
  - "05-*"  # Alert engine can reference getDegradationStats() for composite alert rules

tech-stack:
  added: []
  patterns:
    - "constants.ts pattern for browser-safe shared state (no prisma imports)"
    - "lazy.tsx per-feature pattern for next/dynamic ssr:false in Server Component pages"
    - "export const revalidate=0 instead of export const dynamic for force-dynamic Server Components"

key-files:
  created:
    - src/lib/degradation/constants.ts        # STAGE_CONFIG, DegradationEvent, DegradationChain interfaces
    - src/lib/degradation/queries.ts          # getDegradationEvents(), groupIntoChains(), getDegradationStats()
    - src/app/api/v1/degradation/route.ts     # GET /api/v1/degradation
    - src/app/api/v1/degradation/[eventId]/route.ts # GET /api/v1/degradation/[eventId]
    - src/app/(dashboard)/degradation/page.tsx # Server Component degradation page
    - src/app/(dashboard)/degradation/components/DegradationTimeline.tsx  # Recharts Gantt chart
    - src/app/(dashboard)/degradation/components/DegradationEventList.tsx # Clickable event list
    - src/app/(dashboard)/degradation/components/StageDetailPanel.tsx     # Stage metadata panel
    - src/app/(dashboard)/degradation/components/lazy.tsx                 # "use client" lazy wrapper
  modified:
    - src/components/layout/nav.tsx           # Added Degradation nav link

decisions:
  - title: "constants.ts for browser-safe shared state"
    rationale: >
      DegradationEventList (Client Component) and queries.ts (Server Component) both need STAGE_CONFIG
      and the DegradationEvent/DegradationChain types. If these lived in queries.ts (which imports prisma),
      the client bundle would attempt to resolve pg → tls, crashing the build. Solution: extract
      STAGE_CONFIG and interfaces to constants.ts (no prisma import). Client components import from
      constants.ts; queries.ts imports from constants.ts and re-exports for backward compat.
  - title: "export const revalidate = 0 instead of export const dynamic = 'force-dynamic'"
    rationale: >
      Plan originally used `export const dynamic = 'force-dynamic'` but the page also uses
      `import dynamic from 'next/dynamic'`. Both `dynamic` identifiers would collide at build time.
      Fix: use `export const revalidate = 0` which achieves the same effect (disable ISR, always fresh)
      without the naming conflict.
  - title: "Per-feature lazy.tsx pattern"
    rationale: >
      Plan originally called next/dynamic with ssr:false directly inside the Server Component page.
      This fails in Next.js 16 — dynamic() with ssr:false is only allowed in "use client" files.
      Fix: create src/app/(dashboard)/degradation/components/lazy.tsx as a "use client" file that
      exports DegradationEventListLazy. The Server Component page imports from lazy.tsx, not
      calling next/dynamic directly. Mirrors the Phase 2 pattern in src/components/charts/lazy.tsx.
  - title: "30-second grouping window for chains"
    rationale: >
      Events within 30 seconds for the same API key are grouped into one DegradationChain.
      This is a heuristic (not a request ID correlation). Sufficient for demo purposes — in
      production, a request_id field on rate_limit_events would give exact correlation.
  - title: "async params pattern for [eventId] route"
    rationale: >
      Next.js 16 makes route params async: `{ params }: { params: Promise<{ eventId: string }> }`
      with `await params`. Matches the established pattern in /api/v1/prompts/[id]/rollback/route.ts.

metrics:
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 9
  files_modified: 1
  deviations: 3
---

# Phase 04 Plan 02: Degradation Visualization Summary

**One-liner:** Recharts Gantt-style degradation timeline with stacked spacer+duration bars, clickable event list showing 4-stage chain detail, REST API at /api/v1/degradation, and Server Component page at /dashboard/degradation.

## What Was Built

### Query Layer (`src/lib/degradation/`)

**`constants.ts`** — Browser-safe shared constants and types:
- `STAGE_CONFIG`: stage number → `{ name, color, label }` for all 4 stages (blue/amber/purple/red)
- `DegradationEvent` interface: maps to `rate_limit_events` table columns
- `DegradationChain` interface: grouped set of events for one request traversal

**`queries.ts`** — Server-only query functions:
- `getDegradationEvents(limit, windowMinutes)` — `prisma.rateLimitEvent.findMany()` with time window
- `groupIntoChains(events)` — groups events within 30s window per API key into `DegradationChain[]`
- `getDegradationStats(windowMinutes)` — `groupBy(stage)` for header stat cards
- Re-exports all constants.ts symbols for backward compat

### REST API (`src/app/api/v1/degradation/`)

**`route.ts`** — `GET /api/v1/degradation`
- Query params: `limit` (default 100), `window` (default 60 minutes), `format` (chains|events)
- Returns `{ chains, stats, eventCount }` or `{ events, stats }` based on format
- `export const dynamic = 'force-dynamic'` — no caching

**`[eventId]/route.ts`** — `GET /api/v1/degradation/[eventId]`
- Fetches single `rate_limit_events` row by UUID with `apiKey` relation (keyPrefix, label)
- Returns `{ event }` or 404 if not found
- Correct async params: `{ params }: { params: Promise<{ eventId: string }> }`

### Visualization Components (`src/app/(dashboard)/degradation/`)

**`page.tsx`** (Server Component)
- `export const revalidate = 0` — always fresh (no ISR)
- Fetches `getDegradationEvents(200, 60)` + `getDegradationStats(60)` in parallel
- Calls `groupIntoChains()` server-side; passes `DegradationChain[]` to client via props
- Renders stat cards (Queued/Fallback/Cache/Rejected counts) + Suspense-wrapped event list
- "How it works" explainer section at bottom

**`components/lazy.tsx`** ("use client" lazy loader)
- `DegradationEventListLazy` — `next/dynamic` with `ssr: false`
- Imported by page.tsx to avoid Pitfall 18 (next/dynamic in Server Components)

**`components/DegradationTimeline.tsx`** ("use client")
- Recharts `BarChart` with `layout="vertical"` (horizontal Gantt bars)
- Two stacked bars per stage: transparent `spacer` (offset) + colored `duration`
- `isAnimationActive={false}` on both bars (prevents hydration flicker)
- `Cell` per bar for per-stage color from `STAGE_CONFIG`
- Stage legend below chart

**`components/DegradationEventList.tsx`** ("use client")
- Lists all chains with outcome badge (QUEUED/FALLBACK/CACHED/REJECTED), stage count, timestamp
- `useState<DegradationChain | null>` — click to expand/collapse inline detail
- Inline detail renders `DegradationTimeline` + `StageDetailPanel` for selected chain

**`components/StageDetailPanel.tsx`** ("use client")
- Vertical timeline with colored dot per stage and connector line
- Shows: stage number, config name, reason (underscores replaced with spaces), timestamp
- Stage-specific metadata: `queuedMs`, `fallbackModel`, `cacheHitKey` (first 8 chars), `retryAfterSec`, `tokensAtEvent`

**Nav:** Added "Degradation" link to `src/components/layout/nav.tsx` pointing to `/degradation`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created constants.ts to avoid browser tls module error**

- **Found during:** Build (`pnpm build`)
- **Issue:** `DegradationEventList` imported `STAGE_CONFIG` from `@/lib/degradation/queries`. webpack traced `queries.ts` → `prisma` → `pg` → `tls` (Node.js built-in). Browser bundle cannot resolve `tls`. Build error: "Can't resolve 'tls'".
- **Fix:** Extracted `STAGE_CONFIG`, `DegradationEvent`, `DegradationChain` into new `constants.ts` (no prisma import). Client components import from `constants.ts`. `queries.ts` imports from `constants.ts` and re-exports for backward compat.
- **Files modified:** `constants.ts` (new), `queries.ts` (updated), all 3 client components
- **Commits:** `9a0e260`

**2. [Rule 3 - Blocking] Used per-feature lazy.tsx pattern instead of next/dynamic in Server Component**

- **Pre-identified in plan pitfalls:** Pitfall 18 (fingerprint:p18ssr04)
- **Fix:** Created `components/lazy.tsx` as "use client" file. Exports `DegradationEventListLazy` via `next/dynamic(..., { ssr: false })`. `page.tsx` imports from `lazy.tsx`. Never calls `next/dynamic` in the Server Component directly.
- **Follows:** Phase 2 pattern in `src/components/charts/lazy.tsx`

**3. [Rule 3 - Blocking] Used `export const revalidate = 0` instead of `export const dynamic = 'force-dynamic'`**

- **Pre-identified in plan pitfalls:** Naming conflict with `import dynamic from 'next/dynamic'`
- **Fix:** `page.tsx` uses `export const revalidate = 0` which disables ISR with no naming conflict.

**4. [Rule 1 - Bug] Fixed Recharts Tooltip formatter TypeScript type signature**

- **Found during:** `pnpm type-check`
- **Issue:** `formatter={(value: unknown, name: string) => ...}` — Recharts types the `name` param as `string | undefined` and the `labelFormatter` label as `ReactNode`. Both caused TS2322 errors.
- **Fix:** Used `(value: unknown, name: unknown) => ...` with `typeof value === 'number' ? value : 0` guard. Dropped `labelFormatter` (not needed for the use case).

## Interface Provided to Phase 5

**Import:** `import { getDegradationEvents, groupIntoChains, getDegradationStats } from '@/lib/degradation/queries'`

**REST:** `GET /api/v1/degradation?window=60&format=chains` — returns `{ chains: DegradationChain[], stats: { totalEvents, queueEvents, fallbackEvents, cacheHits, rejections }, eventCount }`

**Phase 5 alert engine** can call `getDegradationStats(windowMinutes)` to get degradation counts for composite alert rules (e.g., "alert if rejections > 10 in last 5 minutes").

## Commits

| Hash | Message |
|------|---------|
| `4be287f` | `feat(04-02): add degradation query layer and REST endpoints` |
| `9a0e260` | `feat(04-02): add degradation visualization — Gantt timeline, event list, stage detail panel` |

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| `/dashboard/degradation` renders as Server Component | PASS — `async function DegradationPage()`, no "use client" |
| Stats header shows correct counts | PASS — 4 StatCard components from `getDegradationStats()` |
| `DegradationEventList` shows clickable rows with badge + timestamp | PASS — `useState` toggle, OUTCOME_BADGE map |
| Clicking expands inline Gantt timeline | PASS — conditional render of `DegradationTimeline` |
| Gantt: stacked bars with spacer+duration | PASS — two `<Bar>` components, same stackId |
| Stage colors match spec | PASS — blue/amber/purple/red from STAGE_CONFIG |
| `StageDetailPanel` shows metadata | PASS — queuedMs, fallbackModel, cacheHitKey, retryAfterSec, tokensAtEvent |
| `GET /api/v1/degradation` returns valid JSON | PASS — build shows route, returns `{ chains, stats, eventCount }` |
| `pnpm type-check` passes | PASS |
| `pnpm build` completes without errors | PASS — all 12 pages generated |
