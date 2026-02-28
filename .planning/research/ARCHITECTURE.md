# Architecture Patterns

**Domain:** AI Operations Dashboard / Production LLM Monitoring Platform
**Researched:** 2026-03-01
**Overall Confidence:** HIGH (verified via official docs, multiple cross-referenced sources)

---

## Recommended Architecture

The platform follows a **server-first, client-islands** architecture on Next.js App Router with Supabase as the unified backend (auth, database, real-time). The system is organized into five logical layers:

```
+------------------------------------------------------------------+
|                        VERCEL EDGE LAYER                          |
|  middleware.ts: auth guard, rate-limit pre-check, request routing |
+------------------------------------------------------------------+
         |                    |                     |
+--------v-------+  +--------v--------+  +--------v--------+
| NEXT.JS APP    |  | NEXT.JS API     |  | SUPABASE EDGE   |
| (Server Comps) |  | ROUTES          |  | FUNCTIONS        |
| Dashboard UI   |  | /api/v1/*       |  | (Webhooks only) |
| Prompt Mgmt    |  | LLM proxy       |  |                  |
| Config pages   |  | Eval pipeline   |  |                  |
+--------+-------+  +--------+--------+  +--------+--------+
         |                    |                     |
+--------v--------------------v---------------------v--------+
|                    SERVICE LAYER (src/lib/)                 |
|  model-router/  rate-limiter/  evaluator/  pii-redactor/   |
|  prompt-mgr/    cost-tracker/  alert-engine/               |
+----------------------------+-------------------------------+
                             |
+----------------------------v-------------------------------+
|                  DATA LAYER (Prisma + Supabase)            |
|  PostgreSQL: partitioned request_logs, prompt_versions,    |
|  ab_tests, evaluations, api_keys, alert_rules             |
|  Real-time: Supabase subscriptions on dashboard_events     |
|  Caching: ISR + stale-while-revalidate on Vercel CDN      |
+------------------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Edge Middleware | Auth verification, rate-limit pre-check, CORS, request routing | Supabase Auth, API Routes |
| Dashboard UI (Server Components) | Render charts, tables, metrics; fetch data server-side | Prisma/Supabase DB, Zustand (client state) |
| Dashboard UI (Client Islands) | Interactive charts (Recharts), filters, real-time subscriptions, forms | Supabase Realtime, Zustand, API Routes |
| API Routes (`/api/v1/`) | External-facing LLM proxy, internal mutation endpoints | Service Layer, Prisma |
| Model Router Service | Multi-provider LLM orchestration, fallback chains, retry logic | OpenAI, Anthropic, Google APIs |
| Rate Limiter Service | Token-bucket enforcement, degradation chain | PostgreSQL (counters), Model Router |
| PII Redactor Service | Regex + pattern-based PII scrubbing before storage | Request Logger |
| Request Logger | Structured logging of all LLM requests with cost/latency | Prisma, PII Redactor |
| Prompt Manager Service | Version control, A/B traffic splitting, snapshot management | Prisma |
| Evaluation Service | Judge-LLM scoring, human review queue management | Model Router, Prisma |
| Alert Engine | Threshold checks on sliding windows, webhook dispatch | Prisma, external webhooks |
| Supabase Edge Functions | Receive external webhooks (Stripe, GitHub, etc.) only | Supabase DB |

### Data Flow

**LLM Request Flow (the critical path):**

```
Client Request
  -> Edge Middleware (auth check, ~5ms)
  -> API Route /api/v1/completions
  -> Rate Limiter: check token bucket in PostgreSQL (~10ms)
     |-- PASS -> Model Router
     |-- FAIL -> Degradation Chain:
     |           1. Queue (if short burst)
     |           2. Fallback model (cheaper/faster)
     |           3. Cached response (if available)
     |           4. 429 + Retry-After header
  -> Model Router: select provider from config
     |-- Primary provider call (~200-2000ms)
     |-- On 429/5xx: exponential backoff + retry (up to 2 retries)
     |-- On exhaustion: next provider in fallback chain
  -> PII Redactor: scrub request/response bodies (~2ms)
  -> Request Logger: async write to request_logs partition (~5ms)
  -> Cost Tracker: calculate tokens * rate card, write to log
  -> Response returned to client
  -> (Async) Alert Engine: check if metrics breach thresholds
```

**Dashboard Render Flow:**

```
User visits /dashboard
  -> Server Component: fetch aggregated metrics via Prisma
     (hits materialized views or pre-aggregated tables)
  -> Render static chart shells server-side (0 JS)
  -> Client Islands hydrate:
     - Recharts components receive data as props
     - Supabase Realtime subscription opens on dashboard_events
     - Zustand store initializes with filter state
  -> Every 30s: Supabase broadcasts new events
     -> Client updates Zustand -> Recharts re-renders
```

---

## 1. Next.js App Router Patterns

**Confidence: HIGH** (verified via official Next.js docs, updated February 2026)

### Server-First, Client-Islands Model

The foundational principle: **the `app/` directory is server-first by default.** Every component is a React Server Component unless explicitly marked with `"use client"`. This is not a preference -- it is how the App Router works.

**Rule:** Think of `app/` as composition, not implementation. Server Components handle data fetching and layout composition. Client Components ("islands") handle only what requires browser APIs or interactivity.

**For this dashboard:**

| Layer | Render Mode | Why |
|-------|------------|-----|
| Dashboard layout, navigation, breadcrumbs | Server Component | No interactivity, reduces JS bundle |
| Metrics cards (cost, latency, error rate) | Server Component with Suspense | Data fetched server-side, streamed to client |
| Recharts charts (area, line, pie, bar) | Client Component island | Recharts requires DOM, user interaction (tooltips, zoom) |
| Date range filter, model filter dropdowns | Client Component island | User input, controls Zustand state |
| Real-time event feed | Client Component island | WebSocket subscription to Supabase Realtime |
| Prompt diff viewer | Server Component (read) + Client (edit) | Diffs rendered server-side; editing needs client |
| Settings/config forms | Client Component island | Form state, validation |

### Parallel Routes for Dashboard Slots

Use Next.js parallel routes (`@slot` convention) for the dashboard layout. Each dashboard panel can load independently with its own `loading.tsx` and `error.tsx`.

```
app/
  dashboard/
    layout.tsx              -- Dashboard shell, renders slots
    @metrics/
      page.tsx              -- Cost/latency summary cards
      loading.tsx           -- Skeleton for metrics
    @charts/
      page.tsx              -- Recharts visualizations
      loading.tsx           -- Skeleton for charts
    @activity/
      page.tsx              -- Recent requests feed
      loading.tsx           -- Skeleton for feed
    default.tsx             -- Fallback for unmatched slots
```

**Why parallel routes matter here:** Dashboard panels fetch different data at different speeds. Metrics might resolve in 100ms from a materialized view, while the activity feed queries recent rows. Parallel routes let each panel stream independently rather than waterfall.

### API Route Organization

Use route groups to separate external-facing API (for SDK consumers) from internal API (for the dashboard frontend).

```
app/
  api/
    v1/
      completions/
        route.ts            -- LLM proxy endpoint (external)
      models/
        route.ts            -- List available models (external)
      keys/
        route.ts            -- API key CRUD (external)
    internal/
      metrics/
        route.ts            -- Aggregated metrics for dashboard
      prompts/
        route.ts            -- Prompt CRUD
      evaluations/
        route.ts            -- Evaluation pipeline
      alerts/
        route.ts            -- Alert rule management
      exports/
        route.ts            -- CSV/JSON export generation
```

**Convention:** External API routes (`/api/v1/*`) authenticate via API key header. Internal routes (`/api/internal/*`) authenticate via Supabase session cookie. This separation is enforced in middleware.

### Middleware Architecture

A single `middleware.ts` at the project root handles cross-cutting concerns. Keep it thin -- the Edge Runtime does not support Node.js built-in modules.

```typescript
// middleware.ts (Edge Runtime)
// 1. Parse request path
// 2. /api/v1/* -> validate API key (fast SHA-256 lookup)
// 3. /api/internal/*, /dashboard/* -> validate Supabase session
// 4. Rate-limit pre-check (optional: fast counter in Supabase)
// 5. Set x-request-id header for tracing
// 6. Pass through
```

**Constraint:** Edge Middleware cannot do heavy database queries. The rate-limit pre-check should be a lightweight counter check, not the full token-bucket algorithm. The full algorithm runs in the API route handler (Node.js runtime).

### Sources
- [Next.js Project Structure (official, updated 2026-02-27)](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js Server and Client Components (official)](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js Parallel Routes (official)](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes)
- [Next.js Architecture in 2026: Server-First, Client-Islands](https://www.yogijs.tech/blog/nextjs-project-architecture-app-router)

---

## 2. Database Schema Design for High-Write Logging

**Confidence: HIGH** (PostgreSQL partitioning is well-documented; Supabase partition support verified)

### The Core Challenge

Target: 1M+ rows in `request_logs` with aggregation queries under 500ms. Standard PostgreSQL table scan on 1M rows is slow. Solution: **range-partition by time + pre-aggregated materialized views**.

### Partitioning Strategy

Use PostgreSQL native range partitioning on `request_logs`, partitioned by `created_at` (monthly). Supabase supports this natively.

```sql
-- Parent table (no data stored here directly)
CREATE TABLE request_logs (
  id UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id),
  model_provider TEXT NOT NULL,       -- 'openai' | 'anthropic' | 'google'
  model_name TEXT NOT NULL,           -- 'gpt-4o' | 'claude-sonnet-4-20250514'
  prompt_version_id UUID REFERENCES prompt_versions(id),
  ab_test_id UUID REFERENCES ab_tests(id),
  ab_variant TEXT,                    -- 'control' | 'treatment'
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  total_cost_usd DECIMAL(10,6) NOT NULL,
  latency_ms INT NOT NULL,
  status_code INT NOT NULL,
  error_type TEXT,                    -- null | 'rate_limit' | 'timeout' | 'server_error'
  degradation_stage TEXT,             -- null | 'fallback_model' | 'cached' | 'rejected'
  -- PII-redacted bodies stored as JSONB
  request_body JSONB,
  response_body JSONB,
  metadata JSONB,                     -- extensible fields
  PRIMARY KEY (created_at, id)        -- partition key MUST be in PK
) PARTITION BY RANGE (created_at);

-- Monthly partitions (create via pg_partman or manually)
CREATE TABLE request_logs_2026_01
  PARTITION OF request_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE request_logs_2026_02
  PARTITION OF request_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE request_logs_2026_03
  PARTITION OF request_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
-- ... automated via pg_partman
```

**Critical constraint:** The partitioning column (`created_at`) must be part of all unique indexes and the primary key. This is a PostgreSQL requirement, not a design choice.

### Indexes for Query Patterns

```sql
-- Dashboard queries: filter by time range + model
CREATE INDEX idx_logs_model_created
  ON request_logs (model_provider, model_name, created_at DESC);

-- Cost analysis: filter by API key + time
CREATE INDEX idx_logs_apikey_created
  ON request_logs (api_key_id, created_at DESC);

-- A/B test queries: filter by test + variant
CREATE INDEX idx_logs_abtest
  ON request_logs (ab_test_id, ab_variant, created_at DESC)
  WHERE ab_test_id IS NOT NULL;

-- Error monitoring
CREATE INDEX idx_logs_errors
  ON request_logs (created_at DESC)
  WHERE status_code >= 400;
```

### Pre-Aggregated Materialized Views

For dashboard queries that scan millions of rows, pre-compute aggregations into materialized views refreshed on a schedule.

```sql
-- Hourly cost and latency aggregation per model
CREATE MATERIALIZED VIEW mv_hourly_metrics AS
SELECT
  date_trunc('hour', created_at) AS hour,
  model_provider,
  model_name,
  COUNT(*) AS request_count,
  SUM(total_cost_usd) AS total_cost,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_latency,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  COUNT(*) FILTER (WHERE status_code >= 400) AS error_count
FROM request_logs
GROUP BY 1, 2, 3
WITH NO DATA;

-- Index the materialized view for fast dashboard queries
CREATE UNIQUE INDEX idx_mv_hourly ON mv_hourly_metrics (hour, model_provider, model_name);

-- Refresh concurrently (does not block reads)
-- Schedule via pg_cron or application-level cron
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hourly_metrics;
```

**Refresh strategy:** Use `pg_cron` (available in Supabase) to refresh materialized views every 5 minutes. The `CONCURRENTLY` option requires a unique index but allows reads during refresh.

### Prisma Integration with Partitioned Tables

Prisma does not natively understand partitioned tables. The schema definition treats the parent table as a regular table. Partitions are managed via raw SQL migrations.

```prisma
// schema.prisma -- Prisma sees the parent table
model RequestLog {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  apiKeyId        String   @map("api_key_id") @db.Uuid
  modelProvider   String   @map("model_provider")
  modelName       String   @map("model_name")
  // ... other fields

  @@map("request_logs")
  @@index([modelProvider, modelName, createdAt(sort: Desc)])
  @@index([apiKeyId, createdAt(sort: Desc)])
}
```

**Caveat:** Partition creation and `pg_partman` setup must be done via raw SQL migrations (`prisma migrate` with custom SQL), not via Prisma schema declarations. This is a known limitation.

### Sources
- [Supabase Table Partitioning (official)](https://supabase.com/docs/guides/database/partitions)
- [Supabase pg_partman Extension (official)](https://supabase.com/docs/guides/database/extensions/pg_partman)
- [PostgreSQL Table Partitioning (official PostgreSQL 18 docs)](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [PostgreSQL Materialized Views (official)](https://www.postgresql.org/docs/current/rules-materializedviews.html)

---

## 3. Supabase-Specific Patterns

**Confidence: HIGH** (verified via official Supabase docs)

### RLS Policies for RBAC

Three roles: Admin, Developer, Viewer. Enforced at the database level via RLS, not application code.

```sql
-- Custom claim stored in auth.users.raw_app_meta_data.role
-- Set on signup or by admin via Supabase Admin API

-- Example: request_logs access
ALTER TABLE request_logs ENABLE ROW LEVEL SECURITY;

-- Viewers: read-only, all logs
CREATE POLICY "viewers_read_logs"
  ON request_logs FOR SELECT
  USING (
    auth.jwt() ->> 'role' IN ('admin', 'developer', 'viewer')
  );

-- Developers: can insert logs (via API key usage)
CREATE POLICY "developers_insert_logs"
  ON request_logs FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' IN ('admin', 'developer')
  );

-- Admins: full CRUD including DELETE (retention policies)
CREATE POLICY "admins_manage_logs"
  ON request_logs FOR ALL
  USING (
    auth.jwt() ->> 'role' = 'admin'
  );

-- Prompt versions: only admins/developers can create
CREATE POLICY "manage_prompts"
  ON prompt_versions FOR ALL
  USING (
    auth.jwt() ->> 'role' IN ('admin', 'developer')
  );

-- API keys: only admins can create/revoke
CREATE POLICY "manage_api_keys"
  ON api_keys FOR ALL
  USING (
    auth.jwt() ->> 'role' = 'admin'
  );
```

**Performance warning:** Complex RLS policies with JOINs degrade query performance. Keep policies simple -- role checks against JWT claims are fast because they do not require additional table lookups.

### Real-Time Subscription Architecture

Supabase Realtime uses PostgreSQL logical replication to stream changes over WebSocket. For dashboards, subscribe to a lightweight `dashboard_events` table rather than the massive `request_logs` table.

**Pattern: Event Summary Table**

```sql
-- Lightweight table for real-time dashboard updates
CREATE TABLE dashboard_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  event_type TEXT NOT NULL,  -- 'new_request' | 'cost_spike' | 'error_burst' | 'ab_test_update'
  summary JSONB NOT NULL     -- { model: "gpt-4o", cost: 0.003, latency_ms: 450 }
);

-- After inserting a request_log, also insert a summary event
-- This keeps the real-time channel lightweight
```

**Why not subscribe to `request_logs` directly?** At high write volumes (thousands of requests/minute), broadcasting every row change would overwhelm WebSocket connections. The `dashboard_events` table acts as a debounced event bus -- batch or sample events before inserting.

**Client subscription:**

```typescript
// Client component
const supabase = createClientComponentClient();

useEffect(() => {
  const channel = supabase
    .channel('dashboard-updates')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'dashboard_events',
    }, (payload) => {
      // Update Zustand store -> re-render charts
      useDashboardStore.getState().addEvent(payload.new);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, []);
```

**Authorization:** Supabase Realtime checks RLS policies before broadcasting. Enable `private: true` on channels and ensure RLS policies on `dashboard_events` match the user's role. Policy checks are cached per connection lifetime -- keep JWT expiration short (e.g., 1 hour) for timely permission updates.

### Edge Functions: Use Sparingly

**Recommendation:** Use Next.js API routes for all application logic. Reserve Supabase Edge Functions only for receiving external webhooks that need to bypass Vercel's cold start (e.g., Stripe webhooks, GitHub webhooks).

**Rationale:**
- Next.js API routes run in Node.js serverless -- full NPM package support
- Supabase Edge Functions run Deno -- limited package ecosystem
- Keeping logic in one runtime (Node.js) reduces cognitive overhead
- Edge Functions cannot use Prisma (Prisma requires Node.js)
- If your database is in one region (e.g., US-East), Edge Functions in Tokyo still need to round-trip to US-East for data -- negating the edge latency benefit

### Sources
- [Supabase RLS (official)](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Realtime Authorization (official)](https://supabase.com/docs/guides/realtime/authorization)
- [Supabase Realtime Getting Started (official)](https://supabase.com/docs/guides/realtime/getting_started)
- [Supabase Edge Functions Architecture (official)](https://supabase.com/docs/guides/functions/architecture)

---

## 4. Multi-Model Routing Architecture

**Confidence: HIGH** (LangChain.js docs verified; pattern confirmed by multiple production guides)

### Unified Provider Interface

Implement a provider-agnostic interface that normalizes request/response formats across OpenAI, Anthropic, and Google.

```typescript
// src/lib/model-router/types.ts
interface LLMRequest {
  model: string;              // e.g., "gpt-4o", "claude-sonnet-4-20250514", "gemini-1.5-pro"
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  stream?: boolean;
}

interface LLMResponse {
  content: string;
  model: string;
  provider: 'openai' | 'anthropic' | 'google';
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;       // USD, calculated from rate card
  };
  latencyMs: number;
  requestId: string;
}

interface ModelConfig {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  priority: number;          // 1 = primary, 2 = first fallback, etc.
  maxRetries: number;
  timeoutMs: number;
  rateLimitRpm?: number;     // provider-specific rate limit
}
```

### Fallback Chain Pattern

```typescript
// src/lib/model-router/router.ts
class ModelRouter {
  private configs: ModelConfig[];  // sorted by priority

  async route(request: LLMRequest): Promise<LLMResponse> {
    const chain = this.configs.sort((a, b) => a.priority - b.priority);

    for (const config of chain) {
      try {
        const response = await this.callWithRetry(config, request);
        return response;
      } catch (error) {
        if (this.isRetryable(error)) {
          // Log fallback event for dashboard visibility
          await this.logDegradation(config, error, 'fallback_model');
          continue; // try next provider
        }
        throw error; // non-retryable error, bubble up
      }
    }

    // All providers exhausted
    throw new AllProvidersExhaustedError(chain);
  }

  private async callWithRetry(
    config: ModelConfig,
    request: LLMRequest
  ): Promise<LLMResponse> {
    let lastError: Error;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await this.callProvider(config, request);
      } catch (error) {
        lastError = error;
        if (!this.isRetryable(error) || attempt === config.maxRetries) {
          throw error;
        }
        // Exponential backoff: 1s, 2s, 4s (with 25% jitter)
        const delay = Math.min(
          1000 * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5),
          10000
        );
        await sleep(delay);
      }
    }
    throw lastError!;
  }

  private isRetryable(error: any): boolean {
    // 429 (rate limit), 500, 502, 503, 529 are retryable
    const retryableCodes = [429, 500, 502, 503, 529];
    return retryableCodes.includes(error.status);
  }
}
```

### LangChain.js Integration

LangChain provides `withFallbacks` on Runnables and `modelRetryMiddleware` for retry logic. However, there is a known limitation: `with_retry` returns `RunnableRetry` which can lose type information for `bind_tools`. For this project, where the primary need is simple chat completions (not tool calling), LangChain's built-in patterns work well.

**Recommendation:** Use LangChain for the provider abstraction layer (`ChatOpenAI`, `ChatAnthropic`, `ChatGoogleGenerativeAI`) and wrap them in a custom `ModelRouter` that handles the fallback chain, cost tracking, and logging. Do not use LangChain's higher-level chain/agent abstractions for the routing layer -- they add unnecessary complexity for what is essentially provider fan-out with retries.

```typescript
// src/lib/model-router/providers.ts
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

function createProvider(config: ModelConfig) {
  switch (config.provider) {
    case 'openai':
      return new ChatOpenAI({
        model: config.model,
        maxRetries: 0, // we handle retries ourselves
        timeout: config.timeoutMs,
      });
    case 'anthropic':
      return new ChatAnthropic({
        model: config.model,
        maxRetries: 0,
      });
    case 'google':
      return new ChatGoogleGenerativeAI({
        model: config.model,
      });
  }
}
```

### Sources
- [LangChain.js Model Rate Limit Handling](https://js.langchain.com/docs/troubleshooting/errors/MODEL_RATE_LIMIT/)
- [LangChain.js modelRetryMiddleware](https://reference.langchain.com/javascript/functions/langchain.index.modelRetryMiddleware.html)
- [Multi-provider LLM orchestration in production: A 2026 Guide](https://dev.to/ash_dubai/multi-provider-llm-orchestration-in-production-a-2026-guide-1g10)
- [Enterprise LLM Reference Architecture for Multi-Model Routing](https://www.gurustartups.com/reports/enterprise-llm-reference-architecture-for-multi-model-routing)

---

## 5. Rate Limiting in Serverless (PostgreSQL-Backed Token Bucket)

**Confidence: HIGH** (PostgreSQL token bucket algorithm well-documented; Supabase integration verified)

### The Serverless Constraint

Vercel serverless functions have no persistent state between invocations -- no in-memory counters, no Redis. The rate limiter state must live in PostgreSQL.

### PostgreSQL Token Bucket Implementation

```sql
-- Rate limit state table
CREATE TABLE rate_limit_buckets (
  api_key_id UUID PRIMARY KEY REFERENCES api_keys(id),
  tokens BIGINT NOT NULL,
  last_refill TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  max_tokens BIGINT NOT NULL DEFAULT 60,      -- bucket capacity
  refill_rate DECIMAL NOT NULL DEFAULT 1.0     -- tokens per second
);

-- Atomic token bucket check-and-consume function
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_api_key_id UUID,
  p_tokens_to_consume BIGINT DEFAULT 1
)
RETURNS TABLE(allowed BOOLEAN, remaining_tokens BIGINT, retry_after_seconds DECIMAL)
LANGUAGE plpgsql
AS $$
DECLARE
  v_bucket rate_limit_buckets%ROWTYPE;
  v_elapsed DECIMAL;
  v_new_tokens BIGINT;
BEGIN
  -- Lock the row for atomic update
  SELECT * INTO v_bucket
  FROM rate_limit_buckets
  WHERE api_key_id = p_api_key_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- First request: create bucket with max tokens minus consumed
    INSERT INTO rate_limit_buckets (api_key_id, tokens, last_refill)
    VALUES (p_api_key_id, 60 - p_tokens_to_consume, NOW());
    RETURN QUERY SELECT TRUE, (60 - p_tokens_to_consume)::BIGINT, 0.0::DECIMAL;
    RETURN;
  END IF;

  -- Calculate refilled tokens since last check
  v_elapsed := EXTRACT(EPOCH FROM (NOW() - v_bucket.last_refill));
  v_new_tokens := LEAST(
    v_bucket.max_tokens,
    v_bucket.tokens + FLOOR(v_elapsed * v_bucket.refill_rate)::BIGINT
  );

  IF v_new_tokens >= p_tokens_to_consume THEN
    -- Allow: consume tokens
    UPDATE rate_limit_buckets
    SET tokens = v_new_tokens - p_tokens_to_consume,
        last_refill = NOW()
    WHERE api_key_id = p_api_key_id;

    RETURN QUERY SELECT TRUE, (v_new_tokens - p_tokens_to_consume)::BIGINT, 0.0::DECIMAL;
  ELSE
    -- Deny: calculate retry-after
    UPDATE rate_limit_buckets
    SET tokens = v_new_tokens,
        last_refill = NOW()
    WHERE api_key_id = p_api_key_id;

    RETURN QUERY SELECT FALSE, v_new_tokens,
      ((p_tokens_to_consume - v_new_tokens)::DECIMAL / v_bucket.refill_rate);
  END IF;
END;
$$;
```

### Four-Stage Degradation Chain

```typescript
// src/lib/rate-limiter/degradation.ts
enum DegradationStage {
  NORMAL = 'normal',
  FALLBACK_MODEL = 'fallback_model',
  CACHED_RESPONSE = 'cached',
  REJECTED = 'rejected',
}

async function handleRequest(request: LLMRequest, apiKeyId: string) {
  const { allowed, remaining, retryAfter } = await checkRateLimit(apiKeyId);

  if (allowed) {
    return modelRouter.route(request); // normal path
  }

  // Stage 1: Try fallback to a cheaper/faster model
  const fallbackConfig = getFallbackModel(request.model);
  if (fallbackConfig) {
    logDegradation(apiKeyId, DegradationStage.FALLBACK_MODEL);
    return modelRouter.routeToSpecific(fallbackConfig, request);
  }

  // Stage 2: Return cached response if available
  const cached = await getCachedResponse(request);
  if (cached) {
    logDegradation(apiKeyId, DegradationStage.CACHED_RESPONSE);
    return { ...cached, fromCache: true };
  }

  // Stage 3: Reject with Retry-After
  logDegradation(apiKeyId, DegradationStage.REJECTED);
  throw new RateLimitError(retryAfter);
}
```

### Performance Consideration

The PostgreSQL-backed rate limiter adds ~10-15ms per request (one round-trip query with row lock). This is well within the <50ms logging overhead target. For comparison, Upstash Redis would add ~5-10ms from Vercel serverless. The PostgreSQL approach avoids adding another service dependency.

**If performance becomes an issue at scale:** Consider Upstash Redis with `@upstash/ratelimit` as a drop-in replacement. The interface stays the same; only the storage backend changes.

### Sources
- [Rate limiting with PostgreSQL token buckets function](https://dev.to/yugabyte/rate-limiting-with-postgresql-yugabytedb-token-buckets-function-5dh8)
- [Distributed Rate Limiting with Bucket4j + PostgreSQL](https://dzone.com/articles/distributed-rate-limiting-java-bucket4j-postgresql)
- [Upstash Rate Limiting for Serverless](https://upstash.com/blog/upstash-ratelimit)

---

## 6. Caching Strategies on Vercel

**Confidence: HIGH** (Vercel ISR docs verified, Next.js caching docs verified)

### Layered Caching Architecture

```
Layer 1: Vercel CDN (edge cache)
  - Static assets, ISR pages
  - Cache-Control + stale-while-revalidate headers

Layer 2: Next.js Data Cache (server-side)
  - fetch() with revalidate option
  - Materialized view query results

Layer 3: Application Cache (in-memory per invocation)
  - Rate card lookups (model pricing)
  - Configuration objects
  - Short-lived (per-request)

Layer 4: Database Cache (materialized views)
  - Pre-computed aggregations
  - Refreshed every 5 minutes via pg_cron
```

### ISR for Dashboard Pages

Dashboard pages use ISR with short revalidation intervals. The page serves stale content instantly while regenerating in the background.

```typescript
// app/dashboard/page.tsx (Server Component)
export const revalidate = 30; // revalidate every 30 seconds

export default async function DashboardPage() {
  const metrics = await getHourlyMetrics(); // hits materialized view
  return <DashboardShell metrics={metrics} />;
}
```

**Why 30 seconds?** The dashboard requires "near real-time" updates. The 30s ISR provides a baseline, and Supabase Realtime subscriptions handle the real-time updates client-side. The ISR page is the fallback if WebSocket disconnects.

### API Response Caching

For read-heavy internal API routes (metrics, prompt versions), use Cache-Control headers.

```typescript
// app/api/internal/metrics/route.ts
export async function GET() {
  const metrics = await prisma.$queryRaw`
    SELECT * FROM mv_hourly_metrics
    WHERE hour >= NOW() - INTERVAL '24 hours'
    ORDER BY hour DESC
  `;

  return NextResponse.json(metrics, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    },
  });
}
```

**Convention:**
- Dashboard metrics: `s-maxage=30, stale-while-revalidate=60`
- Prompt versions (rarely change): `s-maxage=300, stale-while-revalidate=600`
- LLM completions endpoint: **never cache** (each request is unique)
- Export endpoints: **no cache** (generated on demand)

### Sources
- [Vercel ISR Quickstart (official)](https://vercel.com/docs/incremental-static-regeneration/quickstart)
- [Next.js ISR Guide (official)](https://nextjs.org/docs/app/guides/incremental-static-regeneration)
- [Vercel ISR Blog: Flexible Dynamic Content Caching](https://vercel.com/blog/isr-a-flexible-way-to-cache-dynamic-content)

---

## 7. Recommended Folder Structure

**Confidence: HIGH** (synthesized from official Next.js conventions and battle-tested community patterns)

```
src/
  app/                              # App Router (server-first, composition only)
    (auth)/                         # Route group: auth pages (no dashboard layout)
      login/
        page.tsx
      signup/
        page.tsx
      layout.tsx                    # Auth layout (centered card)
    (dashboard)/                    # Route group: all dashboard pages share layout
      dashboard/
        layout.tsx                  # Dashboard layout: sidebar + header + slots
        page.tsx                    # Dashboard overview (redirects to /dashboard)
        @metrics/
          page.tsx                  # Parallel slot: KPI cards
          loading.tsx
        @charts/
          page.tsx                  # Parallel slot: Recharts panels
          loading.tsx
        @activity/
          page.tsx                  # Parallel slot: recent activity feed
          loading.tsx
        default.tsx                 # Fallback for unmatched slots
      prompts/
        page.tsx                    # Prompt list
        [slug]/
          page.tsx                  # Prompt detail + version history
          versions/
            [version]/
              page.tsx              # Specific version view
        new/
          page.tsx                  # Create prompt
      ab-tests/
        page.tsx                    # A/B test list
        [id]/
          page.tsx                  # A/B test detail + results
        new/
          page.tsx
      evaluations/
        page.tsx                    # Evaluation queue
        [id]/
          page.tsx                  # Single evaluation detail
      models/
        page.tsx                    # Model config list
        [id]/
          page.tsx                  # Model config detail
      playground/
        page.tsx                    # Request playground (heavy client component)
      settings/
        page.tsx                    # Team settings
        api-keys/
          page.tsx                  # API key management
        alerts/
          page.tsx                  # Alert rule configuration
    api/
      v1/                          # External API (API key auth)
        completions/
          route.ts
        models/
          route.ts
        keys/
          route.ts
      internal/                    # Internal API (session auth)
        metrics/
          route.ts
        prompts/
          route.ts
        evaluations/
          route.ts
        alerts/
          route.ts
        exports/
          route.ts
    layout.tsx                      # Root layout
    page.tsx                        # Landing / redirect to dashboard
    loading.tsx                     # Global loading
    error.tsx                       # Global error boundary
    not-found.tsx

  components/                       # Shared UI components
    ui/                             # Primitives (Button, Card, Input, Badge, etc.)
    charts/                         # Recharts wrappers (client components)
      CostTrendChart.tsx
      LatencyPercentileChart.tsx
      ModelDistributionChart.tsx
      RequestVolumeChart.tsx
    forms/                          # Form components (client components)
      PromptEditor.tsx
      ModelConfigForm.tsx
      AlertRuleForm.tsx
    layouts/                        # Layout components
      Sidebar.tsx
      Header.tsx
      DashboardShell.tsx
    tables/                         # Data tables
      RequestLogTable.tsx
      EvaluationTable.tsx

  lib/                              # Business logic and services
    model-router/                   # Multi-model routing engine
      router.ts                     # Main router with fallback chain
      providers.ts                  # LangChain provider factory
      types.ts                      # LLMRequest, LLMResponse, ModelConfig
      cost-calculator.ts            # Token * rate card computation
      rate-cards.ts                 # Pricing data per model
    rate-limiter/                   # Token bucket rate limiting
      limiter.ts                    # Check-and-consume logic
      degradation.ts                # Four-stage degradation chain
    pii-redactor/                   # PII scrubbing
      redactor.ts                   # Regex-based PII detection and masking
      patterns.ts                   # Email, phone, SSN, custom patterns
    prompt-manager/                 # Prompt versioning
      versions.ts                   # Create, snapshot, diff, rollback
      ab-splitter.ts                # Traffic splitting logic
      significance.ts               # Statistical significance calculator
    evaluator/                      # Evaluation pipeline
      judge.ts                      # Judge-LLM scoring
      rubrics.ts                    # Rubric definitions
      queue.ts                      # Human review queue management
    alert-engine/                   # Anomaly detection
      detector.ts                   # Threshold checks on sliding windows
      webhook.ts                    # Webhook dispatch
    db/                             # Database utilities
      client.ts                     # Prisma client singleton
      supabase-server.ts            # Supabase server client
      supabase-client.ts            # Supabase browser client
      queries/                      # Complex raw SQL queries
        metrics.ts
        aggregations.ts
    auth/                           # Auth utilities
      session.ts                    # Get session, validate role
      api-key.ts                    # API key validation, hashing
    utils/                          # General utilities
      errors.ts                     # Error classes
      logger.ts                     # Structured logging
      validation.ts                 # Zod schemas

  hooks/                            # Custom React hooks (client-side)
    useRealtimeEvents.ts            # Supabase Realtime subscription
    useDashboardFilters.ts          # Filter state management
    useStreamingResponse.ts         # SSE/streaming token display

  stores/                           # Zustand stores
    dashboard.ts                    # Dashboard filter state, real-time events
    playground.ts                   # Playground form state

  types/                            # Shared TypeScript types
    api.ts                          # API request/response types
    database.ts                     # Database entity types (augment Prisma)
    providers.ts                    # LLM provider types

prisma/
  schema.prisma                     # Prisma schema
  migrations/                       # Migration files
    0001_initial/
      migration.sql                 # Includes partition setup, RLS, pg_cron
  seed.ts                           # 10K request logs, 5 prompt versions, etc.

tests/
  unit/                             # Vitest unit tests
    lib/
      model-router/
        router.test.ts
        cost-calculator.test.ts
      rate-limiter/
        limiter.test.ts
        degradation.test.ts
      pii-redactor/
        redactor.test.ts
      prompt-manager/
        significance.test.ts
  integration/                      # Integration tests
    api/
      completions.test.ts
      rate-limiting.test.ts
  e2e/                              # Playwright E2E tests
    dashboard.spec.ts
    prompt-management.spec.ts
    playground.spec.ts
```

### Key Conventions

1. **`app/` is composition, not implementation.** Route files import from `lib/` and `components/`. No business logic in `app/`.
2. **Route groups** `(auth)` and `(dashboard)` provide different root layouts without affecting URLs.
3. **Private folders** (`_components/` if needed) co-locate route-specific UI that should not be routable.
4. **`lib/` is the service layer.** Pure TypeScript, no React. Testable without rendering.
5. **`components/` is shared UI.** Client components are explicitly in `charts/`, `forms/` subdirectories. Everything else defaults server.
6. **`stores/` is client-only state.** Zustand stores for dashboard filters, playground state. Small and focused.

### Sources
- [Next.js Project Structure (official)](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js Folder Structure Best Practices 2026](https://www.codebydeep.com/blog/next-js-folder-structure-best-practices-for-scalable-applications-2026-guide)
- [Battle-Tested NextJS Project Structure 2025](https://medium.com/@burpdeepak96/the-battle-tested-nextjs-project-structure-i-use-in-2025-f84c4eb5f426)

---

## 8. Testing Architecture

**Confidence: HIGH** (Next.js official testing docs verified, Vitest + Playwright are officially recommended)

### Testing Pyramid

```
                 /  E2E (Playwright)  \          -- 5-10 tests
                /   Critical user flows  \        -- Dashboard load, prompt CRUD, playground
               /_________________________ \
              /  Integration Tests (Vitest) \     -- 15-25 tests
             /   API routes, DB queries,      \   -- Rate limiting, model routing
            /   service interactions             \
           /______________________________________ \
          /    Unit Tests (Vitest)                   \  -- 50+ tests
         /     Business logic: cost calc, PII regex,   \
        /      significance testing, token bucket        \
       /__________________________________________________ \
```

### Unit Tests (Vitest)

Target: 80% coverage on `src/lib/` (the service layer). No React rendering needed.

```typescript
// tests/unit/lib/rate-limiter/limiter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { checkRateLimit } from '@/lib/rate-limiter/limiter';

describe('Token Bucket Rate Limiter', () => {
  it('allows requests when tokens available', async () => {
    // Mock Prisma query to return bucket with 10 tokens
    const result = await checkRateLimit('key-123');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('denies requests when bucket empty', async () => {
    // Mock Prisma query to return bucket with 0 tokens
    const result = await checkRateLimit('key-123');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('refills tokens based on elapsed time', async () => {
    // Mock bucket with 0 tokens but last_refill 60s ago
    // Refill rate of 1/s should give 60 tokens
  });
});
```

**Key unit test targets:**
- Cost calculator (token count * rate card = expected USD)
- PII redactor (regex patterns catch emails, phones, SSNs)
- Statistical significance calculator (chi-squared test)
- Token bucket algorithm (refill, consume, deny)
- Prompt diff generation
- Degradation chain logic

### Integration Tests (Vitest)

Test service interactions and API routes with a test database.

```typescript
// tests/integration/api/rate-limiting.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Rate Limiting Integration', () => {
  it('applies four-stage degradation under load', async () => {
    // Send requests until rate limit triggers
    // Verify: normal -> fallback model -> cached -> 429
  });
});
```

### E2E Tests (Playwright)

Test critical user flows through the browser.

```typescript
// tests/e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test';

test('dashboard loads with metrics within 2 seconds', async ({ page }) => {
  await page.goto('/dashboard');

  // Verify cold start performance
  const loadTime = await page.evaluate(() => performance.now());
  expect(loadTime).toBeLessThan(2000);

  // Verify metrics cards render
  await expect(page.getByTestId('total-cost-card')).toBeVisible();
  await expect(page.getByTestId('p95-latency-card')).toBeVisible();
  await expect(page.getByTestId('error-rate-card')).toBeVisible();
});

test('prompt versioning workflow', async ({ page }) => {
  // Create prompt -> edit -> save version -> view diff -> rollback
});

test('playground sends request and logs it', async ({ page }) => {
  // Select model -> enter prompt -> send -> verify streaming
  // -> verify request appears in logs
});
```

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',         // Service layer is pure Node, no DOM
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/db/**'],  // Exclude DB client setup
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Important caveat:** Vitest does not support async React Server Components for unit testing (as of early 2026). Test server components indirectly through E2E tests or by testing the data-fetching functions they call.

### Sources
- [Next.js Testing Guide (official)](https://nextjs.org/docs/app/guides/testing)
- [Next.js Vitest Setup (official)](https://nextjs.org/docs/app/guides/testing/vitest)
- [Next.js Playwright Setup (official)](https://nextjs.org/docs/app/guides/testing/playwright)
- [Vitest vs Jest 2026: Browser-Native Testing](https://dev.to/dataformathub/vitest-vs-jest-30-why-2026-is-the-year-of-browser-native-testing-2fgb)

---

## Patterns to Follow

### Pattern 1: Server Component Data Fetching with Suspense Boundaries

**What:** Fetch data in Server Components and wrap each independent section in `<Suspense>` with a skeleton fallback. This enables streaming: fast parts render first, slow parts stream in.

**When:** Any dashboard page that fetches multiple independent data sources.

**Example:**
```typescript
// app/(dashboard)/dashboard/page.tsx
import { Suspense } from 'react';
import { MetricsCards } from '@/components/layouts/MetricsCards';
import { CostChart } from '@/components/charts/CostTrendChart';
import { MetricsSkeleton, ChartSkeleton } from '@/components/ui/skeletons';

export default function DashboardPage() {
  return (
    <div className="grid grid-cols-12 gap-6">
      <Suspense fallback={<MetricsSkeleton />}>
        <MetricsCards />  {/* Server component, fetches from materialized view */}
      </Suspense>
      <Suspense fallback={<ChartSkeleton />}>
        <CostChart />     {/* Server component wrapping client Recharts island */}
      </Suspense>
    </div>
  );
}
```

### Pattern 2: Async Write with Fire-and-Forget Logging

**What:** Log requests asynchronously after sending the response. Use `waitUntil` (Vercel) or detached promises to avoid adding logging latency to the critical path.

**When:** Every LLM proxy request.

**Example:**
```typescript
// app/api/v1/completions/route.ts
import { after } from 'next/server';

export async function POST(request: Request) {
  const startTime = performance.now();

  // Critical path: rate limit check + model routing
  const response = await modelRouter.route(parsedRequest);

  // Fire-and-forget: log after response is sent
  after(async () => {
    const latencyMs = performance.now() - startTime;
    await requestLogger.log({
      ...response,
      latencyMs,
      requestBody: piiRedactor.redact(parsedRequest),
      responseBody: piiRedactor.redact(response.content),
    });
    await alertEngine.checkThresholds(response);
  });

  return NextResponse.json(response);
}
```

**Note:** `after()` is a Next.js function (stable in Next.js 15+) that runs code after the response has been sent. On Vercel, this uses the `waitUntil` primitive to keep the serverless function alive for background work. Verify availability in the exact Next.js 14 version being used -- if unavailable, use a detached promise with error handling.

### Pattern 3: Optimistic UI with Realtime Confirmation

**What:** For mutations (create prompt version, start A/B test), update the UI optimistically in Zustand, then confirm via Supabase Realtime subscription.

**When:** Any mutation that the dashboard needs to reflect immediately.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: `"use client"` at the Page Level

**What:** Marking entire pages as client components with `"use client"`.
**Why bad:** Defeats the purpose of Server Components. Ships unnecessary JavaScript. Prevents server-side data fetching. This is the most common mistake developers make with App Router.
**Instead:** Keep pages as Server Components. Create small client component islands only for interactive parts (charts, forms, real-time feeds).

### Anti-Pattern 2: Subscribing to High-Volume Tables via Realtime

**What:** Setting up Supabase Realtime subscriptions directly on `request_logs`.
**Why bad:** At 1000+ writes/minute, every insert fires a WebSocket message to every connected dashboard. This overwhelms clients and Supabase's replication slot.
**Instead:** Write to a lightweight `dashboard_events` summary table (sampled/batched) and subscribe to that. Or use ISR with 30s revalidation and skip Realtime entirely for non-critical dashboards.

### Anti-Pattern 3: Complex RLS Policies with JOINs

**What:** RLS policies that JOIN against other tables to determine access.
**Why bad:** RLS policies execute on every query. JOINs in policies multiply query time, especially on high-volume tables like `request_logs`. Connection latency increases.
**Instead:** Store role in JWT claims (`auth.jwt() ->> 'role'`). Check claims directly -- no JOINs needed for this use case.

### Anti-Pattern 4: Using Prisma for Raw Aggregation Queries

**What:** Using Prisma's query builder for complex aggregation queries (percentiles, window functions, GROUP BY with FILTER).
**Why bad:** Prisma's query builder does not support `PERCENTILE_CONT`, `FILTER`, or `WITHIN GROUP`. You will fight the ORM and produce suboptimal queries.
**Instead:** Use `prisma.$queryRaw` for aggregation queries against materialized views. Use Prisma's type-safe builder for CRUD operations only.

### Anti-Pattern 5: In-Memory Rate Limiting in Serverless

**What:** Using a JavaScript `Map` or module-level variable for rate limit counters.
**Why bad:** Vercel serverless functions do not share memory across invocations. Each cold start resets the counter. Under concurrent load, different function instances have different counters.
**Instead:** Use PostgreSQL-backed token bucket (as described in Section 5) or Upstash Redis.

---

## PII Redaction Architecture

**Confidence: MEDIUM** (regex patterns are well-established; hybrid NLP approach is emerging but not required for MVP)

### Pipeline Position

PII redaction runs **after** the LLM response is received and **before** the request/response bodies are written to `request_logs`. It operates on the logging path, not the critical request path.

```
LLM Response received
  -> Response sent to client (no redaction on live response)
  -> Background: redact request body
  -> Background: redact response body
  -> Write redacted bodies to request_logs
```

### Implementation

```typescript
// src/lib/pii-redactor/patterns.ts
const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone_us: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  credit_card: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  ip_address: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
};

// src/lib/pii-redactor/redactor.ts
function redact(text: string, customPatterns?: RegExp[]): string {
  let redacted = text;

  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    redacted = redacted.replace(pattern, `[REDACTED:${type.toUpperCase()}]`);
  }

  if (customPatterns) {
    for (const pattern of customPatterns) {
      redacted = redacted.replace(pattern, '[REDACTED:CUSTOM]');
    }
  }

  return redacted;
}
```

**Performance:** Regex-based redaction on typical LLM request/response bodies (1-10KB) takes <2ms. This is negligible compared to LLM latency.

**Future enhancement:** For higher accuracy, add an NLP-based PII detector (e.g., Microsoft Presidio or a lightweight local model) as a second pass. Not needed for MVP.

### Sources
- [PII Detection for AI: How to Safely Use User Data with LLMs](https://openredaction.com/blog/pii-detection-for-ai)
- [Langfuse: Masking of Sensitive LLM Data](https://langfuse.com/docs/observability/features/masking)
- [Elastic Observability: PII NER + Regex Redaction](https://www.elastic.co/observability-labs/blog/pii-ner-regex-assess-redact-part-2)

---

## Scalability Considerations

| Concern | At 10K requests | At 100K requests | At 1M requests |
|---------|-----------------|-------------------|-----------------|
| **Request log storage** | Single table, no partitioning needed | Monthly partitions, indexes critical | Monthly partitions + pg_partman auto-management |
| **Dashboard query speed** | Direct queries on request_logs (<100ms) | Materialized views required (<200ms) | Materialized views + ISR caching (<500ms target) |
| **Rate limiting** | PostgreSQL token bucket works fine | PostgreSQL still fine (~15ms/check) | Consider Upstash Redis for <5ms checks |
| **Real-time updates** | Direct Supabase Realtime on request_logs | Switch to dashboard_events summary table | Batched/sampled event writing, client-side aggregation |
| **Supabase connections** | Default connection pool sufficient | Enable Supabase connection pooler (PgBouncer) | Prisma Accelerate or dedicated pooler |
| **Vercel cold starts** | Occasional, <2s acceptable | More frequent under load, ISR mitigates | Pre-warm with scheduled pings, consider Vercel Pro |
| **Cost tracking** | Inline calculation, write with log | Same | Same (cost calc is O(1) per request) |

---

## Key Architectural Decisions Summary

| Decision | Chosen Approach | Rationale |
|----------|----------------|-----------|
| Server vs Client rendering | Server-first with client islands | Minimize JS bundle, server-side data fetching, streaming |
| Dashboard layout | Parallel routes with slots | Independent loading states, no waterfalls |
| API organization | Route groups: v1 (external) + internal | Different auth strategies, clear boundaries |
| High-write logging | Partitioned table + materialized views | Sub-500ms aggregation at 1M rows |
| Real-time updates | Supabase Realtime on summary table | Avoid overwhelming clients with raw log volume |
| Rate limiting | PostgreSQL token bucket function | No Redis dependency, <15ms latency, atomic |
| Model routing | Custom router wrapping LangChain providers | LangChain for provider abstraction, custom for business logic |
| PII redaction | Regex pipeline on logging path | <2ms, configurable, does not block response |
| Caching | ISR (30s) + s-maxage + materialized views | Layered: CDN -> Next.js -> Database |
| State management | Zustand for client, Server Components for server | Minimal client state, server handles data |
| Testing | Vitest (unit/integration) + Playwright (E2E) | Official Next.js recommendation, fast + reliable |
| RLS/RBAC | JWT claim-based RLS policies | No JOIN overhead, fast policy evaluation |
| Edge Functions | Next.js API routes preferred, Edge Functions for webhooks only | Prisma compatibility, full Node.js support |

---

*Research conducted 2026-03-01. Sources verified against official documentation where available. Confidence levels noted per section.*
