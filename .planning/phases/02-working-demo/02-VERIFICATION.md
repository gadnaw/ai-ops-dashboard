---
phase: 02-working-demo
verified: 2026-03-01T12:00:00Z
status: gaps_found
score: 3/5 must-haves verified
gaps:
  - truth: "Cost, latency, and volume trend charts render with 30 days of seed data"
    status: failed
    reason: "All four chart slot pages (@cost, @latency, @requests, @models) hardcode their fetch calls with 7d. Seed data covers 30 days but charts only display the last 7 days. The day-15 cost spike (dayOffset=14, ~Feb 13 2026) falls outside the 7-day window (Feb 22 to Mar 1). FilterBar 30d button updates Zustand state but server components hardcode 7d and never read from the store."
    artifacts:
      - path: "src/app/(dashboard)/dashboard/@cost/page.tsx"
        issue: "fetchCostSummary(7d) hardcoded. Does not read timeRange from Zustand store or searchParams."
      - path: "src/app/(dashboard)/dashboard/@latency/page.tsx"
        issue: "fetchLatencyPercentiles(7d) hardcoded."
      - path: "src/app/(dashboard)/dashboard/@requests/page.tsx"
        issue: "fetchRequestVolume(7d) hardcoded."
      - path: "src/app/(dashboard)/dashboard/@models/page.tsx"
        issue: "fetchDailyModelBreakdown(7d) hardcoded."
      - path: "src/components/dashboard/FilterBar.tsx"
        issue: "setTimeRange writes to Zustand store and calls router.refresh(), but server components never read from the store."
    missing:
      - "Chart pages must read timeRange from cookies or searchParams instead of hardcoding 7d"
      - "Default time range should be 30d to show the full seed data window including the day-15 spike"
      - "FilterBar must write timeRange to a cookie or URL param so server-side chart pages can read it on router.refresh()"
  - truth: "Supabase Realtime updates dashboard within 30 seconds of a new request"
    status: failed
    reason: "RealtimeFeed.tsx subscribes to dashboard_events but only calls router.refresh() on refresh_complete events (line 31). The fallback_occurred events inserted by logRequest() are received but silently ignored. pg_cron refreshes mat views every 5 minutes (300 seconds). The 30-second criterion in ROADMAP SC-2 is not achievable with the current implementation."
    artifacts:
      - path: "src/components/dashboard/RealtimeFeed.tsx"
        issue: "Line 31: only handles refresh_complete. fallback_occurred events are received and discarded. No router.refresh() on fallback."
      - path: "src/lib/logging/request-logger.ts"
        issue: "Lines 59-70: dashboardEvent(fallback_occurred) inserted correctly, but RealtimeFeed ignores this event type."
    missing:
      - "RealtimeFeed must handle fallback_occurred events and call router.refresh() when received"
      - "Alternative: logRequest inserts refresh_complete for all requests, not just fallbacks"
  - truth: "pnpm db:seed completes without timeout and the day-15 spike is visible in the cost chart"
    status: partial
    reason: "Seed script correctly exports seedBaseData(), uses 500-row batches (BATCH_SIZE=500, 20 batches), includes day-15 spike (dayOffset===14, 3x cost multiplier at line 189). Seed will not timeout. But spike is NOT visible in cost chart: @cost/page.tsx hardcodes 7d, and the spike date (~Feb 13 2026) is 16 days before seed date (Mar 1 2026), outside the 7-day window."
    artifacts:
      - path: "src/app/(dashboard)/dashboard/@cost/page.tsx"
        issue: "Hardcoded 7d means spike at day 15 (~Feb 13) is not rendered in the chart."
    missing:
      - "Set default time range to 30d in @cost/page.tsx so the spike is visible on first visit"
      - "This gap resolves when the time range wiring gap (truth 2) is fixed with a 30d default"
human_verification:
  - test: "Visit /dashboard without cookies or session in incognito browser mode"
    expected: "Four chart panels with data, no login prompt, no redirect to /login"
    why_human: "Cannot verify public access and actual chart rendering programmatically"
  - test: "POST to /api/v1/chat, observe Supabase Realtime behavior on dashboard"
    expected: "After a fallback event, dashboard refreshes within 30 seconds"
    why_human: "Requires live Supabase Realtime connection and API keys to trigger fallback"
  - test: "On /config as DEVELOPER, change temperature for summarization, then POST to /api/v1/chat with that endpoint"
    expected: "New temperature used in request; config takes effect on next request"
    why_human: "Requires live API keys and database to verify end-to-end config propagation"
---

# Phase 2: Working Demo Verification Report

**Phase Goal:** Deployed URL shows populated dashboard without login or API key. Core features work end-to-end. Demo-ready.
**Verified:** 2026-03-01T12:00:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Deployed URL shows populated dashboard without login or API key | VERIFIED | middleware.ts lines 38-43 exclude /dashboard from isProtectedRoute. Dashboard layout has no requireAuth(). page.tsx fetches real data via fetchCostSummary for summary stats. |
| 2 | Cost, latency, and volume trend charts render with 30 days of seed data | FAILED | All four @cost, @latency, @requests, @models pages hardcode 7d. Seed data spans 30 days. Day-15 spike at ~Feb 13 is 16 days ago, outside the 7-day chart window. FilterBar 30d button has no effect on chart queries. |
| 3 | Supabase Realtime updates dashboard within 30 seconds of a new request | FAILED | RealtimeFeed.tsx line 31 only handles refresh_complete events. fallback_occurred events are received but discarded. pg_cron cycle is 5 minutes, not 30 seconds. |
| 4 | Config changes (temperature, model) take effect on next request through that endpoint | VERIFIED | loadEndpointConfig() performs a fresh DB query per request (no cache in Phase 2). updateEndpointConfig server action uses requireRole DEVELOPER, writes to DB, revalidates /config. Full wiring confirmed. |
| 5 | pnpm db:seed completes without timeout and the day-15 spike is visible in the cost chart | PARTIAL | Seed script will complete without timeout (500-row batches, 20 total). Spike exists at dayOffset=14 with 3x multiplier (seed.ts line 189). But spike is NOT visible in cost chart (7d window excludes Feb 13). |

**Score: 3/5 truths verified**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| prisma/schema.prisma | RequestLog, CostRateCard, DashboardEvent, EndpointConfig models | VERIFIED | All 4 models at lines 65, 96, 116, 128. Correct field types, indexes, table mappings. |
| prisma/seed.ts | seedBaseData() export, day-15 spike (dayOffset===14), 500-row batches | VERIFIED | export async function seedBaseData() at line 111. BATCH_SIZE=500 at line 114. costMultiplier = dayOffset===14 ? 3.0 : 1.0 at line 189. 288 lines, substantive. |
| src/lib/cost/calculator.ts | calculateCost() reading from cost_rate_cards | VERIFIED | export async function calculateCost() at line 61. Reads from prisma.costRateCard.findMany() at line 33. 1-minute TTL cache. Handles cached tokens. |
| src/lib/model-router/registry.ts | registry export with openai, anthropic, google | VERIFIED | export const registry = createProviderRegistry at line 18. |
| src/lib/model-router/router.ts | streamWithFallback() with exponential backoff | VERIFIED | export async function streamWithFallback() at line 52. Exponential backoff (backoffMs x2, cap 8s, jitter 0-30%). isRetryableError check. loadEndpointConfig reads from DB. |
| src/lib/logging/request-logger.ts | logRequest() calling calculateCost and writing to request_logs and dashboard_events | VERIFIED | export async function logRequest() at line 24. Calls calculateCost() at line 26. Writes requestLog.create at line 35. Inserts dashboardEvent(fallback_occurred) at lines 59-70 for fallback events. |
| src/app/api/v1/chat/route.ts | after() fire-and-forget logging, stream response | VERIFIED | import after from next/server at line 1. after() at lines 67 and 95. streamResult.toUIMessageStreamResponse() at line 126. runtime = nodejs at line 8. |
| src/app/api/v1/models/route.ts | Returns models and endpoint configs | VERIFIED | export async function GET() at line 6. Parallel queries for endpointConfig and costRateCard. Returns models and endpoints JSON. |
| src/lib/dashboard/queries.ts | prisma.$queryRaw on materialized views ONLY (never request_logs) | VERIFIED | All 4 query functions use prisma.$queryRaw(Prisma.sql). Queries reference hourly_cost_summary, hourly_latency_percentiles, daily_model_breakdown. Zero references to request_logs or requestLog.findMany. |
| src/components/charts/CostTrendChart.tsx | isAnimationActive={false} on all series | VERIFIED | Three Area components all have isAnimationActive={false} at lines 86, 95, 104. Dynamic import with ssr:false in @cost/page.tsx. |
| src/components/charts/LatencyChart.tsx | isAnimationActive={false} on all series | VERIFIED | Three Line components all have isAnimationActive={false} at lines 43, 50, 57. |
| src/components/charts/ModelPieChart.tsx | isAnimationActive={false} on Pie | VERIFIED | Pie isAnimationActive={false} at line 29. stroke=none for Recharts 3.x. |
| src/components/charts/RequestVolumeChart.tsx | isAnimationActive={false} on all bars | VERIFIED | Three Bar components all have isAnimationActive={false} at lines 49, 55, 61. |
| src/components/dashboard/RealtimeFeed.tsx | Subscribes to dashboard_events, calls router.refresh() | PARTIAL | Subscribes to dashboard_events INSERT events correctly. Calls router.refresh() on refresh_complete. DOES NOT handle fallback_occurred events -- those are silently dropped. |
| src/components/dashboard/FilterBar.tsx | Zustand with skipHydration, manual rehydrate | VERIFIED (wiring gap) | useDashboardFilterStore.persist.rehydrate() in useEffect at line 20. skipHydration:true in store. Skeleton during hydration. WIRING GAP: FilterBar state has no path to server-side chart queries. |
| src/app/(dashboard)/dashboard/layout.tsx | Accepts parallel route slots (cost, latency, requests, models) | VERIFIED | Function signature receives children, cost, latency, requests, models at lines 8-18. All four slots rendered at lines 49, 55, 61, 65. |
| src/app/(dashboard)/dashboard/@cost/ | page.tsx, loading.tsx, default.tsx | VERIFIED | All three files exist and substantive. |
| src/app/(dashboard)/dashboard/@latency/ | page.tsx, loading.tsx, default.tsx | VERIFIED | All three files exist. Same pattern as @cost. |
| src/app/(dashboard)/dashboard/@requests/ | page.tsx, loading.tsx, default.tsx | VERIFIED | All three files exist. Same pattern as @cost. |
| src/app/(dashboard)/dashboard/@models/ | page.tsx, loading.tsx, default.tsx | VERIFIED | All three files exist. Same pattern as @cost. |
| src/app/(dashboard)/config/page.tsx | Config management page | VERIFIED | export const dynamic = force-dynamic. Renders EndpointConfigList in Suspense. |
| src/app/(dashboard)/config/actions.ts | updateEndpointConfig with requireRole | VERIFIED | use server directive. requireRole(DEVELOPER) at line 21. Validates temperature and maxTokens. prisma.endpointConfig.update() at line 36. revalidatePath(/config) at line 48. |
| Migration SQL files | Partitioned table, materialized views | VERIFIED | 20260301000002: CREATE TABLE request_logs PARTITION BY RANGE. Monthly partitions Jan-Apr 2026. Three materialized views with UNIQUE indexes. Rate card inserts for all 6 models. Endpoint config inserts. |
---

## Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| @cost/page.tsx | queries.ts fetchCostSummary | import + call | WIRED (gap) | fetchCostSummary called with hardcoded 7d instead of dynamic timeRange. |
| queries.ts | hourly_cost_summary mat view | prisma.$queryRaw | WIRED | FROM hourly_cost_summary. Never touches request_logs. |
| queries.ts | hourly_latency_percentiles | prisma.$queryRaw | WIRED | FROM hourly_latency_percentiles. |
| queries.ts | daily_model_breakdown | prisma.$queryRaw | WIRED | FROM daily_model_breakdown. |
| chat/route.ts | streamWithFallback() | import + call | WIRED | await streamWithFallback at line 48. |
| chat/route.ts | logRequest() | after() | WIRED | Two after() blocks: error path line 67, success path line 95. |
| logRequest() | calculateCost() | import + call | WIRED | const { costUsd } = await calculateCost({...}) at line 26. |
| calculateCost() | cost_rate_cards | prisma.costRateCard.findMany() | WIRED | Fetches active rate cards. 1-minute TTL cache. |
| logRequest() | request_logs | prisma.requestLog.create() | WIRED | Full record at lines 35-54. |
| logRequest() | dashboard_events | prisma.dashboardEvent.create() | PARTIAL | Only on isFallback=true. General requests do not emit events. |
| RealtimeFeed.tsx | dashboard_events (Supabase Realtime) | supabase.channel().on() | WIRED | Subscribes to dashboard_events INSERT events. |
| RealtimeFeed.tsx | router.refresh() | on refresh_complete event | PARTIAL | Only triggers on refresh_complete. fallback_occurred events dropped. |
| FilterBar.tsx | dashboard-filter Zustand store | useDashboardFilterStore() | WIRED (orphaned) | FilterBar writes store. Chart server components do not read store. |
| router.ts | loadEndpointConfig() | DB query per request | WIRED | Fresh prisma.endpointConfig.findUnique() per request. No cache in Phase 2. |
| EndpointConfigForm | updateEndpointConfig action | startTransition + await | WIRED | Full wiring: form to server action to DB update to revalidatePath. |
| middleware.ts | /dashboard (public) | exclusion from isProtectedRoute | WIRED | /dashboard not in protected list. |
| setup.sql | pg_cron jobs | cron.schedule() | WIRED (manual) | 4 cron jobs every 5 minutes. Must be run manually in Supabase SQL Editor. |
| setup.sql | Supabase Realtime | ALTER PUBLICATION supabase_realtime ADD TABLE | WIRED (manual) | Correct publication enrollment. Must be run manually. |

---

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| SC-1: Public /dashboard with seed data, no login | SATISFIED | None. Middleware, layout, and page correctly bypass auth for /dashboard. |
| SC-2: Fallback appears in dashboard timeline within 30 seconds | BLOCKED | RealtimeFeed ignores fallback_occurred events. pg_cron is 5-minute cycle. |
| SC-3: Per-request cost and latency logged with full token breakdown | SATISFIED | logRequest() captures inputTokens, outputTokens, cachedTokens, durationMs, costUsd. calculateCost() reads rate cards from DB. |
| SC-4: Config UI lets user change settings; takes effect on next request | SATISFIED | Full wiring verified. loadEndpointConfig() performs fresh DB query per request. |
| SC-5: pnpm db:seed populates with 10K requests and day-15 spike without timeout | BLOCKED | Seed will succeed without timeout. But spike is not visible in cost chart (7d window). |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/app/(dashboard)/dashboard/@cost/page.tsx | 16 | Hardcoded time range 7d | BLOCKER | FilterBar 30d selection has no effect; day-15 spike not visible |
| src/app/(dashboard)/dashboard/@latency/page.tsx | 16 | Hardcoded time range 7d | BLOCKER | Same as above for latency chart |
| src/app/(dashboard)/dashboard/@requests/page.tsx | 16 | Hardcoded time range 7d | BLOCKER | Same as above for requests chart |
| src/app/(dashboard)/dashboard/@models/page.tsx | 16 | Hardcoded time range 7d | BLOCKER | Same as above for model distribution |
| src/components/dashboard/RealtimeFeed.tsx | 31 | Only handles refresh_complete events | BLOCKER | fallback_occurred events silently dropped; 30-second criterion fails |
| prisma/seed.ts | 247-252 | seedEvaluationAndAlerts() is a stub | INFO | Expected Phase 5 stub. Not a blocker for Phase 2. |


---



## Gaps Summary



Three gaps block full goal achievement. Gaps 1 and 3 share a root cause (hardcoded 7d in chart panels). Gap 2 is independent.



### Gap 1 (Blocker): Chart time range is hardcoded -- FilterBar is non-functional for charts



All four parallel route chart pages call their query functions with a hardcoded string literal 7d. The FilterBar component correctly stores the user-selected time range in Zustand and calls router.refresh(), but the chart server components re-execute with the hardcoded 7d argument. Zustand is a client-only store; its state is not accessible during server-side rendering.



The plan key_link specified fetchCostSummary(timeRange) with a dynamic argument, but the implementation passed the literal string 7d.



Fix path: Persist timeRange in a cookie and read it from cookies() in each chart page. Alternatively, encode timeRange in URL search params which are SSR-compatible (e.g., /dashboard?range=30d).



Effect: The seed data is 30 days long. The day-15 cost spike (dayOffset=14, approximately February 13 2026) is 16 days before the seed date (March 1 2026). The default 7-day chart window shows February 22 to March 1. The spike is invisible in the chart. The 30-days-in-charts criterion fails.



### Gap 2 (Blocker): RealtimeFeed does not handle fallback_occurred events



RealtimeFeed.tsx subscribes to all dashboard_events INSERT events via Supabase Realtime, but the handler at line 31 only calls router.refresh() for events where event_type equals refresh_complete. Events with event_type equal to fallback_occurred are received and silently discarded.



Fix path: Add an else-if branch in RealtimeFeed.tsx: if (eventType === "fallback_occurred") { router.refresh(); setLastRefresh(new Date()); }. This completes the 30-second loop for fallback events.



Note: Even after this fix, the chart materialized view data will be up to 5 minutes stale because the fallback log does not appear in charts until the next pg_cron refresh cycle. But the Realtime signal fires within 30 seconds, which is what ROADMAP SC-2 measures.



### Gap 3 (Partial, dependent on Gap 1): Day-15 spike not visible in cost chart



The seed script is correct. The spike at dayOffset=14 (February 13 2026) exists in the database with a 3x cost multiplier and appears in the materialized views after seed and refresh. But @cost/page.tsx shows only the last 7 days, which excludes February 13. This gap resolves automatically once Gap 1 is fixed and the default time range is set to 30d.



---



## Human Verification Required



### 1. Public Dashboard Accessibility



**Test:** Visit the deployed Vercel URL at /dashboard in an incognito browser window (no cookies, no session).

**Expected:** Dashboard loads without login prompt. Four chart panels visible with data or loading skeletons. No redirect to /login.

**Why human:** Cannot verify HTTP redirect behavior and actual browser rendering programmatically.



### 2. Config Change End-to-End



**Test:** Navigate to /config as an authenticated DEVELOPER user. Change temperature for the summarization endpoint from 0.3 to 0.9. Save. Then POST to /api/v1/chat with endpoint summarization and a prompt using a valid API key.

**Expected:** Response generated with temperature 0.9. No caching delay.

**Why human:** Requires live Supabase DB and actual OpenAI API key.



### 3. Supabase Realtime Connection Status



**Test:** Open /dashboard in a browser with DevTools Network tab. Verify a WebSocket connection is established to Supabase Realtime. Observe the status indicator shows Live (green dot).

**Expected:** RealtimeFeed shows Live status within 5 seconds of page load.

**Why human:** WebSocket connection state cannot be verified by static code analysis.



### 4. Fallback Realtime Trigger (After Gap 2 Fix)



**Test:** After fixing RealtimeFeed.tsx to handle fallback_occurred events: simulate a primary model failure, send a POST to /api/v1/chat, and watch the dashboard.

**Expected:** Dashboard refreshes within 30 seconds of the fallback completing.

**Why human:** Requires controlled API key failure environment and timing observation.



---



_Verified: 2026-03-01T12:00:00Z_

_Verifier: Claude (gsd-verifier)_

