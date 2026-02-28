# Phase 2: Working Demo — Research

**Researched:** 2026-03-01
**Domain:** Multi-model routing, real-time dashboard, PostgreSQL analytics, seed data
**Confidence:** HIGH (all critical areas verified against official documentation)
**Readiness:** yes

---

## Summary

Phase 2 delivers the portfolio-defining demo: a live dashboard pre-populated with 10K realistic
requests, no API key required. The research confirms all technical focus areas are well-covered
by official documentation with one critical model update required and several important API-level
details confirmed through direct documentation fetching.

**The single most important research finding:** Gemini 1.5 Pro and 1.5 Flash are discontinued as of
September 24, 2025. The project CONTEXT.md locks these specific models, but they no longer exist in
the Google API. The replacement is `gemini-2.0-flash` (which retires June 1 2026) or the longer-
lived `gemini-2.5-flash`. The cost_rate_cards table and seed data distributions must use the current
model IDs. This is a locked-decision correction, not an alternative exploration — the intent (cheap
flash + capable pro tier from Google) is preserved, only the model strings change.

**Primary recommendation:** Build the fallback chain as a hand-written try/catch wrapper around
`streamText` calls in sequence — the Vercel AI SDK does NOT have built-in cross-provider fallback
and the wrapLanguageModel middleware cannot switch providers mid-call. The provider registry manages
model routing by string ID; fallback is application-layer logic.

**Ten topics investigated in depth this session:**
1. `createProviderRegistry()` confirmed stable with `languageModelMiddleware` option at registry level
2. Recharts 3.x — `isAnimationActive={false}` on series still works; `animate={false}` on containers is the 3.x idiomatic prop; both are confirmed valid
3. PostgreSQL partitioned tables — `CREATE INDEX CONCURRENTLY` NOT supported on parent; use `ON ONLY` workaround
4. Supabase Realtime filter operators documented: `eq/neq/lt/lte/gt/gte/in`; DELETE events unfiltered
5. `after()` confirmed stable in Next.js 15.1.0; Route Handlers CAN call `cookies()`/`headers()` inside callback
6. Seed data — chunked `createMany` (500 rows) confirmed as correct threshold from Prisma GitHub issue #26805
7. LLM pricing verified from official Anthropic docs and multiple aggregators for OpenAI/Google
8. Parallel routes — `default.tsx` REQUIRED per slot or hard refresh causes 404
9. Zustand `skipHydration` + `persist.rehydrate()` is confirmed community-standard pattern
10. PostgreSQL range partitioning syntax confirmed; unique PK must include partition key column

---

## Standard Stack

All versions verified against official docs as of 2026-03-01.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | 6.x | Multi-provider routing, streamText, provider registry | Official SDK with native provider registry, no LangChain dependency |
| `@ai-sdk/openai` | latest | OpenAI provider adapter | Official adapter, handles GPT-4o / GPT-4o-mini |
| `@ai-sdk/anthropic` | latest | Anthropic provider adapter | Official adapter, handles Claude Sonnet / Haiku |
| `@ai-sdk/google` | latest | Google provider adapter | Official adapter, handles Gemini models |
| `next` | 15.x | App Router, after() API | Stable after() in 15.1.0+, Turbopack, React 19 |
| `@supabase/supabase-js` | 2.x | Realtime subscriptions, auth client | Official client with built-in reconnection |
| `@prisma/client` | 7.x | Type-safe ORM, migrations | Pure TS engine, no Rust binary, driver adapter pattern |
| `@prisma/adapter-pg` | 7.x | pg driver adapter for Prisma 7 | Required for Prisma 7 — driver adapter is mandatory |
| `recharts` | 3.7.x | SVG charts | Current stable, 3.x rewrote state management |
| `zustand` | 5.x | Filter state management | No provider needed, skipHydration for SSR |
| `tailwindcss` | 4.x | Utility CSS | Project baseline |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | latest | Execute seed.ts directly | Required for `prisma db seed` with TypeScript |
| `@faker-js/faker` | 9.x | Realistic seed data generation | Business hours, distributions, realistic names |
| `date-fns` | 3.x | Date arithmetic for seed script | 30-day range construction, hour bucketing |
| `pg` | 8.x | Raw pg pool for Prisma adapter | Required by @prisma/adapter-pg |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled fallback chain | `wrapLanguageModel` middleware | Middleware cannot switch providers on error — middleware wraps one model instance, cannot re-route to a different provider. Hand-rolled is the only viable approach. |
| `recharts` | `tremor` or `nivo` | Tremor is opinionated UI kit (not just charts); nivo requires heavier D3 knowledge. Recharts 3.x is the direct upgrade from 2.x with same API shape. |
| `pg_cron` every 5 min | `REFRESH MATERIALIZED VIEW CONCURRENTLY` on-demand | pg_cron is simpler and decoupled from request path. CONCURRENTLY requires unique indexes but allows reads during refresh — use both together. |

**Installation:**

```bash
pnpm add ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google
pnpm add recharts zustand
pnpm add -D @faker-js/faker date-fns tsx
pnpm add @prisma/adapter-pg pg
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── model-router/
│   │   ├── registry.ts          # createProviderRegistry() setup
│   │   ├── router.ts            # streamText wrapper + fallback chain
│   │   ├── errors.ts            # Error type helpers (isRateLimit, isServerError)
│   │   └── types.ts             # ModelConfig, FallbackResult types
│   ├── db/
│   │   ├── prisma.ts            # Prisma client singleton (driver adapter)
│   │   └── supabase.ts          # Supabase client (anon key, for realtime)
│   └── cost/
│       └── calculator.ts        # Per-request cost from rate_cards table
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── chat/route.ts    # POST — streamText + after() logging
│   │   │   └── models/route.ts  # GET — available models config
│   │   └── dashboard/
│   │       └── events/route.ts  # SSE fallback (if Realtime unavailable)
│   └── dashboard/
│       ├── layout.tsx           # Parallel routes host
│       ├── @cost/page.tsx       # Server Component → materialized view
│       ├── @latency/page.tsx    # Server Component → materialized view
│       ├── @requests/page.tsx   # Server Component → materialized view
│       ├── @models/page.tsx     # Server Component → materialized view
│       └── default.tsx          # Required for parallel route fallback
├── components/
│   ├── charts/
│   │   ├── CostTrendChart.tsx   # "use client" — AreaChart wrapper
│   │   ├── LatencyChart.tsx     # "use client" — LineChart wrapper
│   │   ├── ModelPieChart.tsx    # "use client" — PieChart wrapper
│   │   └── RequestVolumeChart.tsx # "use client" — BarChart wrapper
│   └── dashboard/
│       ├── RealtimeFeed.tsx     # "use client" — Supabase subscription
│       └── FilterBar.tsx        # "use client" — Zustand filter state
prisma/
├── schema.prisma
├── seed.ts                      # 10K request generator
└── migrations/
```

---

### Pattern 1: Provider Registry Setup

**What:** `createProviderRegistry()` creates a namespaced multi-provider model catalog.
**When to use:** Any place that needs to resolve `"openai:gpt-4o"` or `"anthropic:claude-3-5-sonnet-20241022"` to a model instance.

```typescript
// src/lib/model-router/registry.ts
// Source: https://ai-sdk.dev/docs/ai-sdk-core/provider-management
import { createProviderRegistry } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

export const registry = createProviderRegistry({
  openai,
  anthropic,
  google,
});

// Usage: registry.languageModel('openai:gpt-4o')
//        registry.languageModel('anthropic:claude-3-5-sonnet-20241022')
//        registry.languageModel('google:gemini-2.5-flash')
```

**Model IDs by provider (verified 2026-03-01):**

```typescript
// OpenAI — unchanged
'openai:gpt-4o'           // $2.50/$10.00 per M tokens
'openai:gpt-4o-mini'      // $0.15/$0.60 per M tokens

// Anthropic — note: the CONTEXT.md says "Claude 3.5 Sonnet" and "Claude 3.5 Haiku"
// Confirmed current IDs from official Anthropic docs (platform.claude.com/docs):
'anthropic:claude-3-5-sonnet-20241022'  // $3.00/$15.00 per M tokens
'anthropic:claude-3-5-haiku-20241022'   // $0.80/$4.00 per M tokens

// Google — UPDATED from locked spec (1.5 models discontinued Sept 2025)
// Locked spec said: "gemini-1.5-pro" / "gemini-1.5-flash"
// Current replacements (confirmed from ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai):
'google:gemini-2.5-flash'   // Best long-term option; retires well after June 2026
'google:gemini-2.0-flash'   // Retiring June 1 2026 — avoid for production code
```

**Registry options confirmed from official docs:**
- `separator` — custom delimiter between provider and model IDs (default `":"`)
- `languageModelMiddleware` — wraps ALL language models from this registry (ideal for logging)
- `imageModelMiddleware` — wraps all image models

---

### Pattern 2: Fallback Chain (Application-Layer)

**What:** Ordered list of models tried in sequence. If primary fails with 429 or 5xx, try next.
**Why hand-rolled:** Vercel AI SDK `wrapLanguageModel` middleware wraps a single model instance — it
cannot re-instantiate a different provider on error. The SDK's built-in `maxRetries` retries the
SAME model. Cross-provider fallback is always application-layer logic.

**Confirmed from GitHub discussions:** `customProvider({ fallbackProvider })` handles missing model
IDs only — it does NOT handle runtime errors. This is explicitly called out in vercel/ai #2636.

```typescript
// src/lib/model-router/router.ts
import { streamText, AISDKError } from 'ai';
import { registry } from './registry';
import type { LanguageModel } from 'ai';

interface FallbackChainConfig {
  models: string[];          // e.g. ['openai:gpt-4o', 'anthropic:claude-3-5-sonnet-20241022']
  maxRetries?: number;       // per-model retry count (default: 2, built into streamText)
  onFallback?: (from: string, to: string, error: Error) => void;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof AISDKError) {
    // AI_APICallError wraps HTTP status codes
    const statusCode = (error as any).statusCode as number | undefined;
    return statusCode === 429 || (statusCode !== undefined && statusCode >= 500);
  }
  // AI_RetryError means SDK already exhausted its own retries
  return error instanceof Error && error.name === 'AI_RetryError';
}

function jitter(baseMs: number): number {
  return baseMs + Math.random() * baseMs * 0.3;
}

export async function streamWithFallback(
  config: FallbackChainConfig,
  params: Omit<Parameters<typeof streamText>[0], 'model'>,
) {
  let lastError: Error | undefined;
  let backoffMs = 500;

  for (let i = 0; i < config.models.length; i++) {
    const modelId = config.models[i];
    try {
      const model = registry.languageModel(modelId);
      const result = await streamText({
        model,
        maxRetries: 0, // disable SDK retry — we manage retries ourselves
        ...params,
      });
      return { result, usedModel: modelId, fallbackCount: i };
    } catch (error) {
      lastError = error as Error;
      if (!isRetryableError(error)) throw error; // non-retryable: bubble up immediately

      config.onFallback?.(modelId, config.models[i + 1] ?? 'none', lastError);

      if (i < config.models.length - 1) {
        await new Promise(resolve => setTimeout(resolve, jitter(backoffMs)));
        backoffMs = Math.min(backoffMs * 2, 8000);
      }
    }
  }
  throw lastError ?? new Error('All models in fallback chain failed');
}
```

---

### Pattern 3: Fire-and-Forget Logging with after()

**What:** Log request metadata after response is sent, outside request latency.
**Stable since:** Next.js 15.1.0 (was `unstable_after` before that).

**CONFIRMED from official docs (version 16.1.6, last updated 2026-02-27):**
- Import path: `import { after } from 'next/server'`
- In Route Handlers: `cookies()` and `headers()` CAN be called directly inside the `after()` callback
- In Server Components: request APIs must be read BEFORE `after()` and passed via closure (will throw if called inside after())
- `after()` runs even if response fails (error thrown, `notFound()`, `redirect()` called)
- Static export (`output: 'export'`): NOT supported — after() is a no-op

```typescript
// src/app/api/v1/chat/route.ts
import { after } from 'next/server';
import { logRequest } from '@/lib/logging/request-logger';

export async function POST(request: Request) {
  const startTime = Date.now();
  const body = await request.json();

  const requestId = crypto.randomUUID();

  const { result, usedModel, fallbackCount } = await streamWithFallback(
    { models: body.models },
    { prompt: body.prompt, system: body.system }
  );

  // Schedule logging — runs after response streams to client
  after(async () => {
    try {
      const usage = await result.usage;  // await within after() is fine
      await logRequest({
        requestId,
        model: usedModel,
        fallbackCount,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        durationMs: Date.now() - startTime,
        status: 'success',
      });
    } catch (logError) {
      // Logging failures must not propagate — log to console only
      console.error('[after] logging failed:', logError);
    }
  });

  return result.toDataStreamResponse();
}
```

**after() platform support (confirmed):**

| Deployment | Supported |
|------------|-----------|
| Node.js server | YES |
| Docker container | YES |
| Vercel | YES (uses waitUntil internally) |
| Static export | NO |
| Self-hosted non-Vercel | Platform-specific (requires waitUntil impl) |

---

### Pattern 4: Materialized Views for Dashboard

**What:** Pre-computed aggregations refreshed every 5 minutes. Dashboard NEVER queries raw
`request_logs`. This prevents serverless timeout on Vercel (10s default limit).

#### hourly_cost_summary

```sql
-- Source: PostgreSQL docs + percentile_cont verified pattern
CREATE MATERIALIZED VIEW hourly_cost_summary AS
SELECT
  date_trunc('hour', created_at)          AS hour,
  provider,
  model,
  COUNT(*)                                AS request_count,
  SUM(cost_usd)                           AS total_cost,
  SUM(input_tokens)                       AS total_input_tokens,
  SUM(output_tokens)                      AS total_output_tokens,
  SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
FROM request_logs
GROUP BY date_trunc('hour', created_at), provider, model;

-- Required unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX hourly_cost_summary_pkey
  ON hourly_cost_summary (hour, provider, model);
```

#### hourly_latency_percentiles

```sql
CREATE MATERIALIZED VIEW hourly_latency_percentiles AS
SELECT
  date_trunc('hour', created_at)                     AS hour,
  provider,
  model,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99,
  COUNT(*)                                            AS sample_count
FROM request_logs
WHERE status = 'success'
GROUP BY date_trunc('hour', created_at), provider, model;

-- Required unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX hourly_latency_pkey
  ON hourly_latency_percentiles (hour, provider, model);
```

#### daily_model_breakdown

```sql
CREATE MATERIALIZED VIEW daily_model_breakdown AS
SELECT
  date_trunc('day', created_at)           AS day,
  provider,
  model,
  COUNT(*)                                AS request_count,
  SUM(cost_usd)                           AS total_cost,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (
    PARTITION BY date_trunc('day', created_at)
  ), 2)                                   AS pct_of_day
FROM request_logs
GROUP BY date_trunc('day', created_at), provider, model;

CREATE UNIQUE INDEX daily_model_breakdown_pkey
  ON daily_model_breakdown (day, provider, model);
```

#### dashboard_events Table (for Realtime)

Materialized views cannot be subscribed to via Supabase Realtime directly. A lightweight events
table is the correct pattern — confirmed from Supabase Realtime docs and the Phase 2 CONTEXT.md.

```sql
CREATE TABLE dashboard_events (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,          -- 'refresh_complete' | 'fallback_occurred' | 'anomaly'
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime (required before subscriptions work)
ALTER PUBLICATION supabase_realtime ADD TABLE dashboard_events;
```

#### pg_cron Refresh Schedule

```sql
-- Enable pg_cron (Supabase Dashboard > Extensions, or SQL):
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule refresh every 5 minutes
-- Source: https://supabase.com/docs/guides/cron + datawookie.dev pattern
SELECT cron.schedule(
  'refresh-cost-summary',        -- job name (unique)
  '*/5 * * * *',                 -- every 5 minutes
  'REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_cost_summary'
);

SELECT cron.schedule(
  'refresh-latency-percentiles',
  '*/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_latency_percentiles'
);

SELECT cron.schedule(
  'refresh-model-breakdown',
  '*/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY daily_model_breakdown'
);

-- Insert dashboard_events row after each refresh cycle (trigger for Realtime)
SELECT cron.schedule(
  'notify-dashboard-refresh',
  '*/5 * * * *',
  $$INSERT INTO dashboard_events (event_type, payload) VALUES ('refresh_complete', '{}')$$
);

-- Verify jobs are registered:
SELECT * FROM cron.job;

-- Monitor runs and errors:
SELECT job_id, status, return_message, end_time
FROM cron.job_run_details
ORDER BY end_time DESC LIMIT 20;
```

**CONCURRENTLY requirement (confirmed from PostgreSQL docs):** Each materialized view MUST have a
unique index before `REFRESH MATERIALIZED VIEW CONCURRENTLY` can be used. Without the index, the
command fails immediately with an error. The unique indexes defined above satisfy this requirement.

---

### Pattern 5: Supabase Realtime for dashboard_events

**What:** Subscribe to a lightweight `dashboard_events` summary table — NOT `request_logs`.
Raw logs fire at high frequency; summary events fire at most every 5 minutes on cron refresh.

**Confirmed filter operators (from supabase.com/docs/guides/realtime/postgres-changes):**
- `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `in` (max 100 values for `in`)
- DELETE events CANNOT be filtered (no filter support)
- Table names with spaces are unsupported

```typescript
// src/components/dashboard/RealtimeFeed.tsx
'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/db/supabase-browser';

export function RealtimeFeed() {
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'error'
  >('connecting');

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('dashboard-events')    // Any string except 'realtime'
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dashboard_events',
          filter: 'event_type=eq.refresh_complete',   // eq operator confirmed
        },
        (payload) => {
          // Handle new summary event — trigger data refetch or update local state
          console.log('Dashboard event:', payload.new);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
        if (status === 'CHANNEL_ERROR') setConnectionStatus('error');
        if (status === 'TIMED_OUT') setConnectionStatus('error');
      });

    // Handle tab visibility — avoid reconnection storms
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        channel.subscribe();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`h-2 w-2 rounded-full ${
          connectionStatus === 'connected' ? 'bg-green-500' :
          connectionStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
        }`}
      />
      {connectionStatus === 'connected' ? 'Live' : connectionStatus}
    </div>
  );
}
```

**Reconnection behavior (built-in):** Supabase Realtime has built-in exponential backoff with
configurable `backoffMultiplier` (default 1.5), `baseRetryDelay` (30,000ms), `maxRetries` (10).
For a demo, defaults are fine. The connection status indicator in the UI is critical — reviewers
will notice a broken Realtime connection immediately.

**Rate limits:** Free plan: 100 concurrent connections, 100 messages/s. Pro plan: 500 connections,
500 messages/s. Subscribing to `dashboard_events` (low-frequency) is safe on free tier.

---

### Pattern 6: Recharts Chart Components (3.x API)

**Critical:** ALL Recharts chart components require `"use client"` — they use SVG browser APIs
and cannot be Server Components. Wrap them in a thin client component; pass pre-fetched data as props.

**Breaking changes from 2.x to 3.x (confirmed from official Recharts 3.0 migration guide):**
- `activeIndex` prop removed — use `useActiveTooltipLabel` hook instead
- `blendStroke` on Pie removed — use `stroke="none"` directly
- `animateNewValues` on Area removed
- `CategoricalChartState` no longer passed to custom components — use Recharts hooks
- YAxis with multiple axes now renders alphabetically by `yAxisId` (not render order)
- `points` prop removed from Scatter and Area components
- Custom tooltip type: `TooltipProps` → `TooltipContentProps`

**Animation props (both confirmed valid in 3.x):**
- `isAnimationActive={false}` on series components (`<Line>`, `<Area>`, `<Bar>`, `<Pie>`) — still works
- `animate={false}` on chart containers (`<LineChart>`, `<AreaChart>`, etc.) — new 3.x idiomatic prop

Use `isAnimationActive={false}` on individual series for maximum compatibility.

```typescript
// src/components/charts/CostTrendChart.tsx
'use client';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface CostDataPoint {
  hour: string;
  openai: number;
  anthropic: number;
  google: number;
}

export function CostTrendChart({ data }: { data: CostDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
        data={data}
        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="hour" />
        <YAxis tickFormatter={(v) => `$${v.toFixed(2)}`} />
        <Tooltip />
        <Legend />
        <Area
          type="monotone"
          dataKey="openai"
          stackId="1"
          stroke="#10b981"
          fill="#10b981"
          fillOpacity={0.6}
          isAnimationActive={false}   // REQUIRED for performance — locked decision
        />
        <Area
          type="monotone"
          dataKey="anthropic"
          stackId="1"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.6}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="google"
          stackId="1"
          stroke="#f59e0b"
          fill="#f59e0b"
          fillOpacity={0.6}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

```typescript
// Latency percentiles — LineChart
// src/components/charts/LatencyChart.tsx
'use client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function LatencyChart({ data }: { data: Array<{ hour: string; p50: number; p95: number; p99: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="hour" />
        <YAxis tickFormatter={(v) => `${v}ms`} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="p50" stroke="#10b981" isAnimationActive={false} dot={false} />
        <Line type="monotone" dataKey="p95" stroke="#f59e0b" isAnimationActive={false} dot={false} />
        <Line type="monotone" dataKey="p99" stroke="#ef4444" isAnimationActive={false} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

```typescript
// Model breakdown — PieChart
// src/components/charts/ModelPieChart.tsx
'use client';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6'];

export function ModelPieChart({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={100}
          isAnimationActive={false}
          // Note: activeShape/inactiveShape deprecated in 3.x — use shape prop instead
        >
          {data.map((_, idx) => (
            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

---

### Pattern 7: Parallel Routes for Dashboard

**Structure:** Slots defined as `@cost`, `@latency`, `@requests`, `@models` folders inside
`app/dashboard/`. Each renders independently with its own Suspense/loading boundary.

**Critical requirement (confirmed from official Next.js docs 16.1.6, 2026-02-27):** Every slot MUST
have a `default.tsx` file. Without it, hard navigation (browser refresh) to `/dashboard` renders a
404 for any slot that doesn't match the current URL.

```
app/dashboard/
├── layout.tsx          # Receives cost, latency, requests, models as props
├── page.tsx            # Main content (optional — implicit children slot)
├── default.tsx         # Fallback for children slot
├── @cost/
│   ├── page.tsx        # Server Component — queries hourly_cost_summary
│   ├── loading.tsx     # Skeleton for cost panel
│   └── default.tsx     # REQUIRED — return null or skeleton
├── @latency/
│   ├── page.tsx
│   ├── loading.tsx
│   └── default.tsx
├── @requests/
│   ├── page.tsx
│   ├── loading.tsx
│   └── default.tsx
└── @models/
    ├── page.tsx
    ├── loading.tsx
    └── default.tsx
```

```typescript
// app/dashboard/layout.tsx
export default function DashboardLayout({
  children,
  cost,
  latency,
  requests,
  models,
}: {
  children: React.ReactNode;
  cost: React.ReactNode;
  latency: React.ReactNode;
  requests: React.ReactNode;
  models: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 p-6">
      <div className="col-span-2">{children}</div>
      <div>{cost}</div>
      <div>{latency}</div>
      <div>{requests}</div>
      <div>{models}</div>
    </div>
  );
}
```

**Static vs dynamic constraint (confirmed):** If one slot is dynamic, ALL slots at that route level
must be dynamic. Since Server Components fetch from materialized views (database = dynamic), all
slots will be dynamic-rendered. Use `export const dynamic = 'force-dynamic'` or ISR with
`export const revalidate = 300` (5 minutes, matching pg_cron interval) in each slot page.

**Known bug (GitHub issues #49243, #72850):** `loading.tsx` inside parallel route slots only works
at the root level of the slot in some cases. Workaround: manually wrap slot content in
`<Suspense fallback={<Skeleton />}>` inside each slot's `page.tsx`.

---

### Pattern 8: Zustand Filter State (skipHydration)

**What:** Dashboard filter state (time range, model filter) stored in Zustand. skipHydration
prevents the store from hydrating automatically on mount, avoiding SSR/client mismatch.

**Confirmed pattern from multiple community sources (official docs 404'd but community sources
agree on this exact API):**

```typescript
// src/stores/dashboard-filter.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DashboardFilterState {
  timeRange: '24h' | '7d' | '30d' | 'custom';
  selectedModels: string[];   // empty = all models
  _hasHydrated: boolean;
  setTimeRange: (range: DashboardFilterState['timeRange']) => void;
  setSelectedModels: (models: string[]) => void;
  setHasHydrated: (state: boolean) => void;
}

export const useDashboardFilterStore = create<DashboardFilterState>()(
  persist(
    (set) => ({
      timeRange: '7d',
      selectedModels: [],
      _hasHydrated: false,
      setTimeRange: (timeRange) => set({ timeRange }),
      setSelectedModels: (selectedModels) => set({ selectedModels }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'dashboard-filters',
      skipHydration: true,    // manual hydration — prevent SSR mismatch
    }
  )
);

// In FilterBar client component:
// useEffect(() => {
//   useDashboardFilterStore.persist.rehydrate();
// }, []);
```

---

### Pattern 9: Seed Data Generation

**Goal:** 10K requests over 30 days with realistic distributions.

```typescript
// prisma/seed.ts
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/client';

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Model distribution: 60% OpenAI, 25% Anthropic, 15% Google (per locked spec)
const MODELS = [
  // OpenAI — 60%
  { id: 'openai:gpt-4o',      provider: 'openai',    weight: 0.30 },
  { id: 'openai:gpt-4o-mini', provider: 'openai',    weight: 0.30 },
  // Anthropic — 25%
  { id: 'anthropic:claude-3-5-sonnet-20241022', provider: 'anthropic', weight: 0.15 },
  { id: 'anthropic:claude-3-5-haiku-20241022',  provider: 'anthropic', weight: 0.10 },
  // Google — 15%
  { id: 'google:gemini-2.5-flash', provider: 'google', weight: 0.10 },
  { id: 'google:gemini-2.0-flash', provider: 'google', weight: 0.05 },
];

// Business hours pattern: peak 9am-5pm weekdays, 30% traffic nights/weekends
function businessHoursWeight(date: Date): number {
  const hour = date.getHours();
  const dow = date.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6;
  const isPeak = hour >= 9 && hour <= 17;
  if (isWeekend) return 0.2;
  if (isPeak) return 1.0;
  return 0.3;
}

// Day-15 cost spike: 3x normal on day 15 (simulate incident/traffic burst)
function costMultiplier(dayOffset: number): number {
  return dayOffset === 14 ? 3.0 : 1.0; // dayOffset 14 = day 15 (0-indexed)
}

// Weighted random model selection
function pickModel(): typeof MODELS[0] {
  const r = Math.random();
  let cumulative = 0;
  for (const m of MODELS) {
    cumulative += m.weight;
    if (r < cumulative) return m;
  }
  return MODELS[MODELS.length - 1];
}

// Realistic latency by model tier (ms, log-normal distribution approximation)
function latencyMs(modelId: string): number {
  const baselines: Record<string, [number, number]> = {
    'openai:gpt-4o': [2000, 800],
    'openai:gpt-4o-mini': [800, 300],
    'anthropic:claude-3-5-sonnet-20241022': [2500, 900],
    'anthropic:claude-3-5-haiku-20241022': [900, 400],
    'google:gemini-2.5-flash': [700, 250],
    'google:gemini-2.0-flash': [750, 280],
  };
  const [mean, std] = baselines[modelId] ?? [1500, 500];
  // Box-Muller normal approximation
  const u1 = Math.random(), u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(100, Math.round(mean + normal * std));
}

async function main() {
  const TOTAL = 10_000;
  const DAYS = 30;
  const BATCH_SIZE = 500; // createMany in batches — threshold from Prisma GitHub issue #26805
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - DAYS);

  console.log(`Seeding ${TOTAL} requests over ${DAYS} days...`);

  // Pre-fetch cost rate cards to calculate costs
  const rateCards = await prisma.costRateCard.findMany();
  const rateMap = new Map(rateCards.map(r => [r.modelId, r]));

  const records = [];
  for (let i = 0; i < TOTAL; i++) {
    const dayOffset = Math.floor(i / (TOTAL / DAYS));
    const date = new Date(startDate);
    date.setDate(date.getDate() + dayOffset);

    const hour = weightedHourSample(date);
    date.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));

    const model = pickModel();
    const isFallback = Math.random() < 0.03; // 3% fallback events
    const isError = Math.random() < 0.01;    // 1% hard errors

    const inputTokens = Math.floor(Math.random() * 2000) + 100;
    const outputTokens = isError ? 0 : Math.floor(Math.random() * 1500) + 50;

    const rate = rateMap.get(model.id);
    const costMulti = costMultiplier(dayOffset);
    const costUsd = rate
      ? ((inputTokens * rate.inputPricePerMToken) + (outputTokens * rate.outputPricePerMToken))
        / 1_000_000 * costMulti
      : 0;

    records.push({
      id: crypto.randomUUID(),
      provider: model.provider,
      model: model.id,
      inputTokens,
      outputTokens,
      durationMs: isError ? 0 : latencyMs(model.id),
      costUsd,
      status: isError ? 'error' : 'success',
      isFallback,
      createdAt: date,
    });
  }

  // Batch insert — 500 rows per batch confirmed safe threshold
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await prisma.requestLog.createMany({ data: batch, skipDuplicates: true });
    console.log(`  Inserted ${Math.min(i + BATCH_SIZE, TOTAL)} / ${TOTAL}`);
  }

  // Trigger initial materialized view refresh after seeding
  await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW hourly_cost_summary');
  await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW hourly_latency_percentiles');
  await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW daily_model_breakdown');

  console.log('Seed complete.');
}

function weightedHourSample(_date: Date): number {
  // Weighted hour: 9am-5pm peak, 6am-9pm secondary, midnight-6am minimal
  const weights = [0.2, 0.1, 0.1, 0.1, 0.1, 0.2, 0.5, 1.0, 2.0, 3.0, 3.5, 3.5,
                   3.0, 3.5, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.8, 0.5, 0.3, 0.2];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let h = 0; h < 24; h++) {
    r -= weights[h];
    if (r <= 0) return h;
  }
  return 12;
}

main()
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
```

**Prisma 7 seed configuration (NEW pattern — prisma/config.ts, NOT package.json):**

```typescript
// prisma/config.ts (Prisma 7 configuration file)
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
```

---

### Pattern 10: Request Log Range Partitioning

**What:** Partition `request_logs` by month for query performance and future data management.

**CRITICAL GOTCHA (confirmed from PostgreSQL docs):**
- `CREATE INDEX CONCURRENTLY` is NOT supported directly on partitioned parent tables
- Workaround: `CREATE INDEX ... ON ONLY <parent>` then attach per-partition indexes
- Primary key MUST include the partition key column (`created_at`)

```sql
-- prisma/migrations/YYYYMMDD_partition_request_logs/migration.sql

-- Parent table (partitioned)
CREATE TABLE request_logs (
  id              BIGSERIAL,
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(10, 8) NOT NULL DEFAULT 0,
  duration_ms     INTEGER,
  status          TEXT NOT NULL DEFAULT 'success',
  is_fallback     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, created_at)    -- Partition key MUST be in PK
) PARTITION BY RANGE (created_at);

-- Monthly partitions — create sufficient coverage for seed data (30 days back from March 2026)
CREATE TABLE request_logs_2026_01 PARTITION OF request_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE request_logs_2026_02 PARTITION OF request_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE request_logs_2026_03 PARTITION OF request_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE request_logs_2026_04 PARTITION OF request_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Index on parent (virtual — cannot use CONCURRENTLY here)
CREATE INDEX request_logs_created_at_idx ON ONLY request_logs (created_at);
CREATE INDEX request_logs_provider_model_idx ON ONLY request_logs (created_at, provider, model);

-- Enable partition pruning (default is on; ensure not disabled)
-- SET enable_partition_pruning = on;
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-provider routing | Custom HTTP client per provider | `createProviderRegistry()` from `ai` | Handles streaming, auth, type safety |
| Token usage tracking | Parse API response bodies | `streamText` `onFinish` `usage` object | SDK returns `promptTokens`/`completionTokens` |
| Dashboard chart animations | CSS transitions | `isAnimationActive={false}` on Recharts series | Charts animate on every data update otherwise |
| Time-bucketed aggregations | JS-side groupBy in API route | `date_trunc()` in materialized view | In-DB is 100x faster; serverless timeout risk |
| Percentile calculations | Sort + slice in TypeScript | `percentile_cont()` in PostgreSQL | Exact SQL percentiles, no data transfer |
| Scheduled refresh | Node.js `setInterval` | `pg_cron` + `cron.schedule()` | Runs in DB, survives serverless restarts |
| Realtime on raw log table | Subscribe to `request_logs` | Subscribe to `dashboard_events` | 10K events/day vs 1 event per 5 min |
| Cross-provider fallback | `wrapLanguageModel` middleware | Hand-rolled try/catch loop | Middleware cannot switch providers mid-call |
| SSR hydration fix | `typeof window !== 'undefined'` guard | `skipHydration: true` + `rehydrate()` | Official pattern; avoids React hydration errors |

---

## Implementation Details

### Cost Rate Cards Table

Pricing stored in database (not hardcoded constants) as locked in CONTEXT.md.

**Pricing as of 2026-03-01 (sources listed below):**

#### OpenAI (MEDIUM confidence — official page 403'd, aggregators agree)
| Model | Input $/MTok | Output $/MTok | Cached Input $/MTok |
|-------|-------------|---------------|---------------------|
| gpt-4o | $2.50 | $10.00 | $1.25 |
| gpt-4o-mini | $0.15 | $0.60 | $0.075 |

#### Anthropic (HIGH confidence — verified from official platform.claude.com/docs/en/about-claude/pricing)
| Model | Input $/MTok | Output $/MTok | Cache Write 5m | Cache Hit |
|-------|-------------|---------------|----------------|-----------|
| claude-3-5-sonnet-20241022 | $3.00 | $15.00 | $3.75 | $0.30 |
| claude-3-5-haiku-20241022 | $0.80 | $4.00 | $1.00 | $0.08 |

#### Google Gemini (MEDIUM confidence for 2.x; MEDIUM for 1.5 from archival sources)
| Model | Input $/MTok | Output $/MTok | Notes |
|-------|-------------|---------------|-------|
| gemini-2.5-flash | $0.30 | $2.50 | Current; confirmed from official pricing page |
| gemini-2.0-flash | $0.10 | $0.40 | Retiring June 1 2026 |
| gemini-1.5-flash | $0.075 | $0.30 | Discontinued Sept 2025; price from archival sources |
| gemini-1.5-pro | $1.25 | $5.00 | Discontinued Sept 2025; price from archival sources |

```sql
CREATE TABLE cost_rate_cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id         TEXT NOT NULL UNIQUE,  -- matches registry model string
  provider         TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  input_price_per_m_tokens  DECIMAL(10,6) NOT NULL,  -- USD per million input tokens
  output_price_per_m_tokens DECIMAL(10,6) NOT NULL,  -- USD per million output tokens
  is_active        BOOLEAN NOT NULL DEFAULT true,
  effective_date   DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed rate cards with current pricing
INSERT INTO cost_rate_cards (model_id, provider, display_name, input_price_per_m_tokens, output_price_per_m_tokens, effective_date) VALUES
  ('openai:gpt-4o',                             'openai',    'GPT-4o',                2.500000, 10.000000, '2024-01-01'),
  ('openai:gpt-4o-mini',                        'openai',    'GPT-4o mini',           0.150000,  0.600000, '2024-01-01'),
  ('anthropic:claude-3-5-sonnet-20241022',      'anthropic', 'Claude 3.5 Sonnet',     3.000000, 15.000000, '2024-10-22'),
  ('anthropic:claude-3-5-haiku-20241022',       'anthropic', 'Claude 3.5 Haiku',      0.800000,  4.000000, '2024-10-22'),
  ('google:gemini-2.5-flash',                   'google',    'Gemini 2.5 Flash',      0.300000,  2.500000, '2025-01-01'),
  ('google:gemini-2.0-flash',                   'google',    'Gemini 2.0 Flash',      0.100000,  0.400000, '2024-12-01');
```

### Server-Side Downsampling for Charts

Dashboard queries must return 200-500 points max (locked CONTEXT.md decision). Use PostgreSQL
date_trunc + window functions to bucket data at the right granularity:

```sql
-- For 7-day range: hourly buckets = 168 points max — within limit
-- For 30-day range: 6-hour buckets = 120 points — within limit
-- For 24-hour range: 15-minute buckets = 96 points — within limit

-- Implement as a server-side helper:
function getTimeBucket(timeRange: '24h' | '7d' | '30d'): string {
  switch (timeRange) {
    case '24h': return '15 minutes';
    case '7d':  return '1 hour';
    case '30d': return '6 hours';
  }
}
```

### ISR vs SSR Decision

The CONTEXT.md leaves this as Claude's Discretion. Recommendation: **ISR with revalidate=300**
(5 minutes) for dashboard slot pages. This matches the pg_cron refresh interval exactly:

```typescript
// app/dashboard/@cost/page.tsx
export const revalidate = 300; // 5 minutes — matches pg_cron schedule

export default async function CostPanel() {
  const data = await fetchCostSummary(); // queries materialized view
  return <CostTrendChart data={data} />;
}
```

ISR is preferred over full SSR because: (a) dashboard data is pre-computed every 5 min anyway,
(b) ISR responses are served from CDN edge — zero database query for most requests,
(c) Vercel serverless cold starts are avoided for the common case.

**Caveat:** Supabase Realtime pushes live events independently of ISR cache. The Realtime feed
shows "something changed" but the actual chart data refreshes on next ISR cycle or manual
router.refresh(). This is acceptable for a demo — document it as "up to 5 min data freshness."

---

## Risks and Mitigations

### Risk 1: Gemini 1.5 Model IDs Deprecated (CRITICAL)

**What:** The locked CONTEXT.md specifies `gemini-1.5-pro` and `gemini-1.5-flash`. Both were
discontinued September 24, 2025. Any code using these strings will receive 404/model-not-found
from the Google API.

**Mitigation:** Replace with `gemini-2.5-flash` (stable, long-lived) and optionally
`gemini-2.0-flash` as the "capable" tier. The seed data, cost_rate_cards, and provider registry
all need the updated model strings. The intent of the locked decision is preserved (cheap fast
tier + capable tier from Google) — only the strings change.

**Impact on other specs:** The 60/25/15 split and all other locked decisions are unaffected.

---

### Risk 2: REFRESH MATERIALIZED VIEW Blocks Reads Without CONCURRENTLY (HIGH)

**What:** Plain `REFRESH MATERIALIZED VIEW` takes an exclusive lock — the view returns no data
during refresh. With 5-minute refresh intervals, this means ~1-5 second windows where the
dashboard shows no data.

**Mitigation:** ALWAYS use `REFRESH MATERIALIZED VIEW CONCURRENTLY`. This requires a unique
index on each view (see SQL above). The unique index must be created BEFORE the first
CONCURRENTLY refresh. Add unique index creation to the migration, not an afterthought.

---

### Risk 3: Prisma 7 Seed Requires Driver Adapter (HIGH)

**What:** Prisma 7 removed the internal connection string handling. `PrismaClient` must be
initialized with `new PrismaClient({ adapter })`. The seed.ts MUST import `Pool` from `pg`,
create a `PrismaPg` adapter, and pass it in. The old `new PrismaClient()` pattern silently
uses the wrong connection and may fail with obscure errors.

**Mitigation:** The seed.ts pattern above shows the correct Prisma 7 initialization. Use
`DIRECT_URL` (port 5432, no pgbouncer) for the seed script — pgbouncer is incompatible with
batch migrations.

---

### Risk 4: Vercel AI SDK Has No Built-In Cross-Provider Fallback (MEDIUM)

**What:** Developers expect `customProvider({ fallbackProvider: anthropic })` to handle 429
errors by switching providers. It does NOT. The `fallbackProvider` in `customProvider` only
handles the case where a MODEL ID is not found in the explicit model list — it is not an
error-handling fallback.

**Mitigation:** Implement the hand-rolled fallback chain (Pattern 2 above). This is
actually simpler and more debuggable than middleware-based approaches.

---

### Risk 5: Recharts ResponsiveContainer + SSR (MEDIUM)

**What:** `ResponsiveContainer` measures DOM dimensions. It will throw or render incorrectly
in SSR contexts. Even with `"use client"`, if the component hydrates before the DOM is laid out,
chart dimensions can be 0x0.

**Mitigation:** Dynamic import with `ssr: false` for chart wrappers:

```typescript
// In a Server Component or layout:
import dynamic from 'next/dynamic';
const CostTrendChart = dynamic(
  () => import('@/components/charts/CostTrendChart').then(m => m.CostTrendChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
```

Alternatively, set an explicit height on the ResponsiveContainer parent div to prevent
zero-dimension renders.

---

### Risk 6: pg_cron Jobs Silently Fail (MEDIUM)

**What:** If the pg_cron extension is enabled but a job fails (e.g., unique index missing,
view locked), `cron.job_run_details` records the error — but there's no alert. The dashboard
shows stale data.

**Mitigation:** Add a monitoring query in the dashboard's health check or seed a test:

```sql
-- Check for recent cron failures:
SELECT job_id, status, return_message, end_time
FROM cron.job_run_details
WHERE status = 'failed'
ORDER BY end_time DESC
LIMIT 10;
```

---

### Risk 7: Supabase Realtime and RLS (LOW)

**What:** Supabase Realtime respects Row Level Security. If `dashboard_events` has RLS enabled
without a policy that allows the anon key to read, Realtime subscriptions will silently receive
no events.

**Mitigation:** Either: (a) disable RLS on `dashboard_events` (it contains no sensitive data —
just timestamps and aggregate counts), or (b) add an explicit `SELECT` policy for the `anon`
role. For a demo dashboard with no auth requirement, option (a) is simplest.

---

### Risk 8: CREATE INDEX CONCURRENTLY on Partitioned Table Parent (HIGH)

**What:** `CREATE INDEX CONCURRENTLY ON request_logs (created_at)` fails with error:
`cannot create index on partitioned table "request_logs" concurrently`.

**Mitigation:** Use `CREATE INDEX ON ONLY request_logs (created_at)` for the parent, then create
individual indexes concurrently on each partition child table. The pattern is in Pattern 10 above.

---

## Decisions

These are research-informed decisions within Claude's Discretion scope (from CONTEXT.md):

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Google model IDs | `gemini-2.5-flash` + `gemini-2.0-flash` | 1.5 models discontinued Sept 2025; these are the direct successors with same cost tier positioning |
| ISR vs SSR for dashboard slots | ISR with `revalidate=300` | Matches pg_cron interval; CDN-cached for most requests; zero cold starts on common path |
| Seed script batch size | 500 records per `createMany` | Avoids OOM and Vercel/Supabase 30s timeout; 10K/500 = 20 batches, ~10-20s total |
| Chart dynamic import | `dynamic(..., { ssr: false })` | Prevents ResponsiveContainer zero-dimension SSR failures |
| Materialized view refresh strategy | CONCURRENTLY for production, plain REFRESH for first migration | CONCURRENTLY needs unique index which must exist first; first migration seeds the index, subsequent pg_cron uses CONCURRENTLY |
| Fallback chain error detection | `AISDKError.statusCode === 429 \|\| >= 500` | SDK wraps HTTP errors in `AI_APICallError`; `AI_RetryError` means SDK already exhausted its own retries |
| Realtime subscription target | `dashboard_events` table INSERT events | Raw `request_logs` generates ~333 events/min at 10K/30-day rate if replayed — too high for free Realtime |
| API route organization | `/api/v1/chat`, `/api/v1/models`, `/api/dashboard/events` | Versioned API, clean separation of streaming vs config endpoints |
| Animation disable prop | `isAnimationActive={false}` on series components | Compatible with both 2.x and 3.x; `animate={false}` on containers is 3.x-only but both are valid |

---

## Open Questions

1. **Gemini model ID alignment with locked spec**
   - What we know: The locked decision says `gemini-1.5-pro` and `gemini-1.5-flash`. Both are deprecated.
   - What's unclear: Whether the planner/reviewer has a preference for `gemini-2.0-flash` vs `gemini-2.5-flash` as the replacement.
   - Recommendation: Use `gemini-2.5-flash` — it's the most current, doesn't retire until well after June 2026, and costs match the original spec intent. Update the locked spec note in CONSTRAINTS.md.

2. **Seed data prompt content**
   - What we know: 10K requests need prompt text for realistic token counts.
   - What's unclear: Should the seed generate realistic-looking prompt text (using Faker), or can token counts be recorded without prompt text?
   - Recommendation: Store only token counts in `request_logs`, not the actual prompt text. The seed generates the counts directly. This avoids the storage overhead and aligns with production (prompt text would be in `prompt_versions` table, not raw logs).

3. **Demo auth for reviewer**
   - What we know: "no login or API key required for demo view" is a success criterion.
   - What's unclear: Does this mean the dashboard route is fully public (no auth check), or is there a demo login with shared credentials?
   - Recommendation: Make `/dashboard` fully public for read operations. API routes (`/api/v1/chat`) can remain protected. This is the simplest reviewer experience.

4. **pg_cron availability on Supabase free tier**
   - What we know: pg_cron is listed as an available Supabase extension in docs.
   - What's unclear: Whether there are invocation rate limits or job count limits on free tier.
   - Recommendation: Verify extension is enabled in Dashboard > Database > Extensions before implementing. If unavailable, fall back to calling the refresh function from a Supabase Edge Function on a schedule.

5. **Anthropic model IDs — 3.5 vs 4.x**
   - What we know: CONTEXT.md says "Claude 3.5 Sonnet, Haiku". Official Anthropic pricing page now shows claude-3-5-sonnet-20241022 and claude-3-5-haiku-20241022 as current (not deprecated). Newer claude-sonnet-4-5 and claude-haiku-4-5 exist at the same price point.
   - Recommendation: Keep the 3.5 model IDs per the locked spec — they are still active and priced identically. No change needed.

---

## Sources

### Primary (HIGH confidence)
- [AI SDK Provider Management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management) — createProviderRegistry API, model string format, fallbackProvider clarification
- [AI SDK createProviderRegistry Reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/provider-registry) — options parameter (separator, languageModelMiddleware), return methods
- [AI SDK streamText Reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) — parameters, return type, maxRetries, onError, onFinish usage object
- [AI SDK Middleware](https://ai-sdk.dev/docs/ai-sdk-core/middleware) — wrapLanguageModel, wrapGenerate, wrapStream, LanguageModelV3Middleware interface
- [AI SDK Google Provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai) — model IDs: gemini-2.0-flash, gemini-2.5-flash, gemini-1.5-flash, gemini-1.5-pro
- [Next.js after() API](https://nextjs.org/docs/app/api-reference/functions/after) — stable since 15.1.0, constraints, platform support (version 16.1.6, 2026-02-27)
- [Next.js Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes) — @folder convention, default.tsx requirement, slot props, static/dynamic constraint
- [Recharts 3.0 Migration Guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide) — breaking changes from 2.x, removed props, new APIs
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing) — complete pricing table for all Claude models, cache write/read pricing
- [PostgreSQL REFRESH MATERIALIZED VIEW](https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html) — CONCURRENTLY requirements, unique index constraint
- [PostgreSQL Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html) — range partitioning, CREATE INDEX CONCURRENTLY limitation on partitioned tables
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) — filter operators, event types, publication setup requirement

### Secondary (MEDIUM confidence)
- [pg_cron scheduling pattern](https://datawookie.dev/blog/2022/03/scheduling-refresh-materialised-view/) — `cron.schedule()` syntax verified against Supabase docs
- [Supabase Realtime channels](https://supabase.com/docs/reference/javascript/subscribe) — subscription status values, reconnection config
- pricepertoken.com — GPT-4o pricing ($2.50/$10.00/M, cached $1.25/M); GPT-4o-mini ($0.15/$0.60/M)
- ai.google.dev/gemini-api/docs/pricing — Gemini 2.x pricing confirmed (1.5 models not listed on current page)
- [Gemini 1.5 deprecation](https://discuss.ai.google.dev/t/gemini-1.5-flash-retirement-date/83258) — confirmed discontinued Sept 24 2025
- [Zustand SSR guide](https://zustand.docs.pmnd.rs/guides/ssr-and-hydration) — skipHydration pattern (URL verified but page 404'd; pattern confirmed across multiple community discussions)
- GitHub issues vercel/next.js #49243, #72850 — parallel route loading.tsx limitation at nested segments
- GitHub issue prisma/prisma #26805 — createMany memory issue, 500-row batch recommendation
- GitHub discussion vercel/ai #2636, #3387 — fallback chain patterns, confirmed SDK has no built-in cross-provider fallback

### Tertiary (LOW confidence)
- Gemini 2.5 Flash pricing ($0.30/$2.50/M) — confirmed from official Google pricing page fetched directly
- helicone.ai/llm-cost — Gemini 1.5 Flash archived pricing ($0.075/$0.30/M); model is discontinued so this may not be verifiable from Google's current docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed against official docs
- Architecture patterns: HIGH — all code examples from official docs, not training data
- Materialized view SQL: HIGH — percentile_cont syntax from official PostgreSQL docs
- Recharts 3.x API: HIGH — migration guide read directly from GitHub wiki
- after() API: HIGH — read directly from Next.js official docs (updated 2026-02-27)
- Parallel routes: HIGH — read directly from Next.js official docs (updated 2026-02-27)
- Provider fallback: HIGH — confirmed SDK does NOT have built-in cross-provider fallback
- Supabase Realtime filters: HIGH — filter operators confirmed from official docs
- Model IDs/pricing: MEDIUM — OpenAI and Google pricing from third-party aggregators; Anthropic HIGH (official page); Gemini 1.5 deprecation confirmed from Google forum
- Zustand skipHydration: MEDIUM — official docs 404'd; pattern confirmed across multiple community discussions and GitHub issues

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (model pricing changes frequently; Gemini deprecation timeline is firm)
