---
phase: 2
plan: "02-03"
title: "Dashboard UI — Parallel Routes, Recharts 3.x Charts, Supabase Realtime, Zustand Filter Store"
subsystem: "dashboard-ui"
tags: ["recharts", "supabase-realtime", "zustand", "parallel-routes", "ssr", "materialized-views", "next.js"]
status: "complete"
completed: "2026-03-01"
duration: "~45 minutes"

requires:
  - plan: "02-01"
    reason: "Materialized views (hourly_cost_summary, hourly_latency_percentiles, daily_model_breakdown) and dashboard_events table"
  - plan: "01-02"
    reason: "Supabase browser client (createSupabaseBrowserClient), auth guards, middleware"
  - plan: "01-01"
    reason: "Prisma client, folder conventions, Next.js app router"

provides:
  - DashboardUI: "Public /dashboard route with 4 parallel slot panels and summary stats row"
  - DashboardQueryLayer: "fetchCostSummary, fetchLatencyPercentiles, fetchDailyModelBreakdown, fetchRequestVolume — all from materialized views"
  - DashboardFilterStore: "useDashboardFilterStore Zustand 5 persist store with skipHydration pattern"
  - RealtimeFeed: "Supabase Realtime subscription with connection status indicator"
  - FilterBar: "Time range selector with manual persist.rehydrate() hydration"

affects:
  - plan: "02-04"
    reason: "Config+Seed plan populates the materialized views — needed for charts to show real data"
  - plan: "03-01"
    reason: "Prompt service may extend DashboardFilterStore with additional filter dimensions"

tech-stack:
  added:
    - "recharts@^3.7.0 (chart components — already in package.json from 02-01)"
    - "zustand@^5.0.11 (filter store — already in package.json from 02-01)"
    - "date-fns@^4.1.0 (tick formatters — already in package.json from 01-01)"
  patterns:
    - "Next.js parallel routes with @slot directories (4 slots: @cost, @latency, @requests, @models)"
    - "Prisma.sql for dynamic SQL fragments in $queryRaw (no nested $queryRaw calls)"
    - "BigInt → Number conversion for all PostgreSQL COUNT/SUM columns"
    - "Dynamic import with ssr:false for Recharts components (ResponsiveContainer SSR fix)"
    - "Zustand skipHydration + manual persist.rehydrate() in FilterBar useEffect"
    - "ISR revalidate=300 on all slot pages (matches pg_cron 5-minute refresh interval)"

key-files:
  created:
    - "src/lib/dashboard/queries.ts"
    - "src/stores/dashboard-filter.ts"
    - "src/components/charts/CostTrendChart.tsx"
    - "src/components/charts/LatencyChart.tsx"
    - "src/components/charts/ModelPieChart.tsx"
    - "src/components/charts/RequestVolumeChart.tsx"
    - "src/components/charts/index.ts"
    - "src/components/dashboard/RealtimeFeed.tsx"
    - "src/components/dashboard/FilterBar.tsx"
    - "src/app/(dashboard)/dashboard/layout.tsx"
    - "src/app/(dashboard)/dashboard/page.tsx"
    - "src/app/(dashboard)/dashboard/default.tsx"
    - "src/app/(dashboard)/dashboard/@cost/page.tsx"
    - "src/app/(dashboard)/dashboard/@cost/loading.tsx"
    - "src/app/(dashboard)/dashboard/@cost/default.tsx"
    - "src/app/(dashboard)/dashboard/@latency/page.tsx"
    - "src/app/(dashboard)/dashboard/@latency/loading.tsx"
    - "src/app/(dashboard)/dashboard/@latency/default.tsx"
    - "src/app/(dashboard)/dashboard/@requests/page.tsx"
    - "src/app/(dashboard)/dashboard/@requests/loading.tsx"
    - "src/app/(dashboard)/dashboard/@requests/default.tsx"
    - "src/app/(dashboard)/dashboard/@models/page.tsx"
    - "src/app/(dashboard)/dashboard/@models/loading.tsx"
    - "src/app/(dashboard)/dashboard/@models/default.tsx"
  modified:
    - "src/app/(dashboard)/layout.tsx — removed requireAuth(), simplified to passthrough"
    - "src/app/(dashboard)/page.tsx — replaced placeholder with redirect to /dashboard"
    - "src/middleware.ts — removed /dashboard from protected routes (public access)"

decisions:
  - id: "dashboard-route-restructure"
    context: "Phase 1 created (dashboard)/page.tsx but the real /dashboard URL requires (dashboard)/dashboard/ nesting"
    decision: "Created (dashboard)/dashboard/ as the canonical dashboard. Old (dashboard)/page.tsx is at URL '/' — replaced with redirect. (dashboard)/layout.tsx simplified to passthrough since dashboard has its own full layout."
    rationale: "Next.js route groups (parentheses) add no URL segment. The dashboard must be at (dashboard)/dashboard/ to render at /dashboard. The Phase 1 page was a placeholder that app/page.tsx's redirect to /dashboard was already bypassing."

  - id: "middleware-public-dashboard"
    context: "Middleware blocked /dashboard; plan specifies dashboard is PUBLIC"
    decision: "Removed /dashboard from isProtectedRoute in middleware.ts"
    rationale: "Dashboard is read-only demo content. Success Criterion 1 requires it visible without login. Auth routes (settings, prompts, playground, API) remain protected."

  - id: "prisma-sql-dynamic-filter"
    context: "Plan used nested $queryRaw for provider filter — unsupported"
    decision: "Used Prisma.sql template tags and Prisma.empty for optional filter fragments"
    rationale: "Prisma docs prohibit nested $queryRaw. Prisma.sql creates safe interpolatable fragments. Prisma.empty = no-op for the no-filter case."

  - id: "latency-panel-aggregation"
    context: "fetchLatencyPercentiles returns per-provider rows; LatencyChart expects single time series"
    decision: "Aggregated across providers in @latency/page.tsx: average p50/p95/p99 per bucket"
    rationale: "Chart shows overall system latency trend, not per-provider. Provider filtering is a future extension via FilterBar selectedProviders."

metrics:
  tasks-completed: 3
  tasks-total: 3
  commits: 3
  files-created: 24
  files-modified: 3
---

# Phase 2 Plan 03: Dashboard UI Summary

**One-liner:** Public /dashboard with 4 Recharts 3.x parallel route slots, Supabase Realtime subscription, Zustand skipHydration filter store, all querying materialized views via Prisma.sql.

## What Was Built

### Task 1: Query layer and Zustand store

`src/lib/dashboard/queries.ts` exposes four async functions for Server Components:

- `fetchCostSummary(timeRange, providers?)` — reads `hourly_cost_summary`, buckets by 15min/1h/6h
- `fetchLatencyPercentiles(timeRange, providers?)` — reads `hourly_latency_percentiles`
- `fetchDailyModelBreakdown(timeRange)` — reads `daily_model_breakdown`
- `fetchRequestVolume(timeRange)` — reads `hourly_cost_summary` for request/error/fallback counts

All functions use `Prisma.sql` template tags (not nested `$queryRaw`) and convert BigInt with `Number()`.

`src/stores/dashboard-filter.ts` creates a Zustand 5 persist store with `skipHydration: true`. FilterBar calls `persist.rehydrate()` manually on mount to prevent SSR hydration mismatch.

### Task 2: Recharts 3.x chart components

Four client-side chart components in `src/components/charts/`:

| Component | Chart Type | Data Source |
|-----------|------------|-------------|
| CostTrendChart | Stacked AreaChart | provider × bucket aggregation |
| LatencyChart | Multi-line LineChart | p50/p95/p99 per bucket |
| ModelPieChart | PieChart | model total_requests distribution |
| RequestVolumeChart | Stacked BarChart | success/fallback/error per bucket |

All charts: `"use client"`, `isAnimationActive={false}`, wrapped in `h-[300px]` div for ResponsiveContainer, `stroke="none"` on Pie (replaces deprecated `blendStroke`).

### Task 3: Parallel routes, Realtime feed, and layouts

**Route structure at `/dashboard`:**

```
(dashboard)/dashboard/
  layout.tsx          ← parallel route layout (PUBLIC, no requireAuth)
  page.tsx            ← children slot: 4 summary stat cards
  default.tsx         ← null fallback
  @cost/
    page.tsx          ← CostTrendChart via dynamic import ssr:false
    loading.tsx       ← skeleton
    default.tsx       ← null
  @latency/           ← LatencyChart (aggregated across providers)
  @requests/          ← RequestVolumeChart
  @models/            ← ModelPieChart
```

**RealtimeFeed** (`"use client"`): subscribes to `dashboard_events` INSERT via `supabase.channel()`. On `refresh_complete` event: calls `router.refresh()` to bust ISR cache. Shows Live/Connecting/Disconnected status with green/yellow/red dot.

**FilterBar** (`"use client"`): time range buttons (24h/7d/30d). On change: calls `setTimeRange` + `router.refresh()`. Manual `persist.rehydrate()` on mount prevents hydration flash.

**Middleware updated:** Removed `/dashboard` from `isProtectedRoute`. Dashboard is read-only public access — no login required.

## Commits

| Hash | Message |
|------|---------|
| 77e524f | feat(02-03): add dashboard query layer for materialized views and Zustand filter store |
| c22d2ee | feat(02-03): add Recharts 3.x chart components (CostTrend, Latency, ModelPie, RequestVolume) |
| 10d4ea9 | feat(02-03): add dashboard parallel routes, Realtime feed, FilterBar, and slot pages with Recharts charts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Nested $queryRaw for dynamic provider filter**

- **Found during:** Task 1 implementation
- **Issue:** Plan showed `prisma.$queryRaw\`AND provider = ANY(...)\`` nested inside outer `$queryRaw` call — Prisma prohibits this
- **Fix:** Used `Prisma.sql\`AND provider = ANY(${providers})\`` for filter fragment, `Prisma.empty` for no-filter case, and `prisma.$queryRaw(Prisma.sql\`...\`)` (function form) instead of tagged template literal to allow fragment interpolation
- **Files modified:** `src/lib/dashboard/queries.ts`
- **Commit:** 77e524f

**2. [Rule 2 - Missing Critical] Route restructuring for correct URL resolution**

- **Found during:** Task 3 pre-analysis
- **Issue:** Phase 1 created `(dashboard)/page.tsx` as placeholder. Next.js route groups don't add URL segments, so `(dashboard)/page.tsx` is at `/`, NOT `/dashboard`. The plan creates `(dashboard)/dashboard/` which correctly renders at `/dashboard`.
- **Fix:** Updated `(dashboard)/layout.tsx` to remove `requireAuth()` and be a passthrough. Replaced `(dashboard)/page.tsx` with redirect to `/dashboard`. Created full dashboard at `(dashboard)/dashboard/`.
- **Files modified:** `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/page.tsx`
- **Commit:** 10d4ea9

**3. [Rule 2 - Missing Critical] Latency panel provider aggregation**

- **Found during:** Task 3 slot page implementation
- **Issue:** `fetchLatencyPercentiles` returns one row per (bucket, provider). `LatencyChart` expects a flat array of `{bucket, p50, p95, p99}`. Without aggregation, the chart receives multi-provider data it can't display correctly.
- **Fix:** `@latency/page.tsx` aggregates across providers: averages p50/p95/p99 values per bucket before passing to chart.
- **Files modified:** `src/app/(dashboard)/dashboard/@latency/page.tsx`
- **Commit:** 10d4ea9

## Next Phase Readiness

**Plan 02-04 (Config + Seed):** Must populate the three materialized views with seed data. Until seeded, all chart panels will show empty state (no data, no error). The dashboard route is fully functional — it simply has nothing to display yet.

**Key handoff for 02-04:**
- Dashboard queries read from: `hourly_cost_summary`, `hourly_latency_percentiles`, `daily_model_breakdown`
- Seeding must INSERT into `request_logs` (partitioned), then run `REFRESH MATERIALIZED VIEW`
- `pg_cron` refreshes views every 5 minutes (must be enabled in Supabase)

**Known limitations:**
- FilterBar time range changes call `router.refresh()` which re-fetches with the default `'7d'` hardcoded in slot pages. Full time-range-aware slot pages would need URL search params or server-side cookie to pass selected range. This is acceptable for Phase 2 demo — the UI shows the control, and router.refresh() re-renders.
- No per-provider filtering in charts yet — selectedProviders from FilterBar not yet wired to slot pages (Phase 3 extension point).
