# Technology Stack

**Project:** AI Ops Dashboard -- Production-Grade LLM Monitoring Platform
**Researched:** 2026-03-01
**Overall confidence:** MEDIUM-HIGH

---

## Executive Summary

The user-specified stack is solid for a portfolio demo but has two significant concerns for a production LLM monitoring platform at scale: (1) Prisma adds measurable overhead for high-write logging workloads, and (2) LangChain.js is the wrong tool for this project's needs. This document validates each technology choice, flags risks, and provides actionable recommendations.

**Critical recommendation:** Replace LangChain with Vercel AI SDK for multi-model orchestration. LangChain is designed for complex agent/RAG workflows; this project needs multi-provider routing with fallback, which Vercel AI SDK handles natively with smaller bundle size and edge runtime compatibility.

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Recommendation |
|------------|---------|---------|----------------|
| Next.js | 15.x (stable) | Full-stack framework | **UPGRADE from 14 to 15.** Next.js 16 is available but 15 is more battle-tested for this stack. Next.js 14 is now two major versions behind; 15 brings Turbopack (2-3x faster builds, 5-10x faster HMR), React 19 support, and TypeScript config files. No reason to start a new project on 14. |
| TypeScript | 5.x | Type safety | Confirmed. Essential for this project. |
| React | 19.x | UI library | Required by Next.js 15. Brings Actions API, improved Suspense. |

**Confidence:** HIGH -- verified via official Next.js docs and release notes.

**Note on Next.js 16:** Version 16.1 shipped December 2025. It is stable but newer. For a portfolio demo, Next.js 15 provides the right balance of stability and modern features. If starting after March 2026, consider 16.

### Frontend UI & Styling

| Technology | Version | Purpose | Recommendation |
|------------|---------|---------|----------------|
| Tailwind CSS | 4.x | Utility-first styling | Confirmed. Standard choice. |
| Recharts | 3.7.0 | Chart library | Confirmed with caveats (see detailed analysis below). |
| Zustand | 5.0.11 | Client state management | Confirmed. Excellent choice for Next.js App Router. |

**Confidence:** HIGH -- versions verified via npm.

### Database & ORM

| Technology | Version | Purpose | Recommendation |
|------------|---------|---------|----------------|
| Supabase | Latest | PostgreSQL + Realtime + Auth | Confirmed. Strong choice for this project. |
| Prisma | 7.x | ORM | Confirmed with caveats. Prisma 7 eliminated the Rust engine, now pure TypeScript -- significantly better for serverless. See performance analysis below. |

**Confidence:** MEDIUM-HIGH -- Prisma 7 is a major architecture change; real-world performance data at scale is still emerging.

### AI Orchestration (CHANGED FROM USER SPEC)

| Technology | Version | Purpose | Recommendation |
|------------|---------|---------|----------------|
| Vercel AI SDK | 6.x (ai@6.0.x) | Multi-model routing, streaming, fallback | **REPLACE LangChain.** See detailed rationale below. |
| @ai-sdk/openai | Latest | OpenAI provider | Use with Vercel AI SDK provider registry. |
| @ai-sdk/anthropic | Latest | Anthropic provider | Use with Vercel AI SDK provider registry. |
| @ai-sdk/google | Latest | Google Gemini provider | Use with Vercel AI SDK provider registry. |

**Confidence:** HIGH -- verified via official AI SDK docs, provider registry API confirmed.

### LLM Provider SDKs (Direct Access)

| Technology | Version | Purpose | When to Use |
|------------|---------|---------|-------------|
| openai | 6.25.0 | OpenAI direct API | Token counting, cost calculation, direct API calls outside AI SDK |
| @anthropic-ai/sdk | 0.78.0 | Anthropic direct API | Direct API calls, model-specific features |
| @google/genai | 1.43.0 | Google Gemini direct API | Direct API calls, model-specific features |

**Confidence:** HIGH -- versions verified via npm within last 7 days.

### Rate Limiting

| Technology | Version | Purpose | Recommendation |
|------------|---------|---------|----------------|
| @upstash/ratelimit | 2.0.8 | Token-bucket rate limiting | Best-in-class for serverless. HTTP-based, no persistent connections needed. |
| @upstash/redis | Latest | Redis client for rate limiting | Required by @upstash/ratelimit. Upstash offers free tier. |

**Confidence:** HIGH -- officially recommended in Next.js docs, production-proven.

### Deployment

| Technology | Version | Purpose | Recommendation |
|------------|---------|---------|----------------|
| Vercel | N/A | Hosting & deployment | Confirmed. Native Next.js integration, AI SDK Gateway for fallback routing. |

**Confidence:** HIGH.

---

## Detailed Analysis: Critical Decisions

### 1. LangChain vs. Vercel AI SDK (STRONG RECOMMENDATION: Vercel AI SDK)

This is the most impactful stack decision for this project. The user specified LangChain, but it is the wrong tool for this use case.

**What this project needs:**
- Multi-provider model routing (OpenAI, Anthropic, Gemini)
- Fallback chains (if OpenAI fails, try Anthropic, then Gemini)
- Streaming responses to the UI
- Token usage tracking per request
- Cost calculation per request

**What this project does NOT need:**
- Complex agent workflows
- RAG pipelines
- Document loaders
- Vector store integrations
- Memory management chains

**Comparison:**

| Criterion | LangChain.js | Vercel AI SDK |
|-----------|-------------|---------------|
| Bundle size (gzipped) | 101.2 kB | 67.5 kB |
| Edge runtime support | NO (blocks edge) | YES (native) |
| Cold start | 800ms-2.5s | Single-digit ms on edge |
| Next.js integration | Adapter required | Native (same company) |
| Provider registry | Manual setup | `createProviderRegistry()` built-in |
| Streaming to React | Custom implementation | `useChat`, `useCompletion` hooks |
| Model fallback | Custom code | Vercel AI Gateway built-in |
| Provider count | 50+ | 25+ |
| Learning curve | High (many abstractions) | Low (functional API) |

**Provider Registry pattern (Vercel AI SDK):**

```typescript
import { createProviderRegistry } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const registry = createProviderRegistry({
  openai: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  anthropic: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  google: createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY }),
});

// Single-line model switching
const model = registry.languageModel('openai:gpt-4o');
// or: registry.languageModel('anthropic:claude-sonnet-4-20250514');
// or: registry.languageModel('google:gemini-2.0-flash');
```

**Fallback pattern:**
Vercel AI Gateway (available on Vercel deployment) provides automatic model fallback routing. For custom fallback logic in API routes:

```typescript
async function generateWithFallback(prompt: string) {
  const providers = [
    'openai:gpt-4o',
    'anthropic:claude-sonnet-4-20250514',
    'google:gemini-2.0-flash',
  ];

  for (const modelId of providers) {
    try {
      const result = await generateText({
        model: registry.languageModel(modelId),
        prompt,
      });
      return { result, provider: modelId };
    } catch (error) {
      console.warn(`Provider ${modelId} failed, trying next...`);
      continue;
    }
  }
  throw new Error('All providers failed');
}
```

**Verdict:** LangChain adds complexity and bundle size for features this project will never use. Vercel AI SDK provides exactly what is needed -- multi-model routing, streaming, and fallback -- with native Next.js integration and zero edge runtime issues.

**Confidence:** HIGH -- verified via official AI SDK documentation, provider registry API, and multiple 2025-2026 comparison articles.

### 2. Prisma Performance with Supabase for High-Write Logging

**The concern:** An LLM monitoring platform logs every request. At 1M+ logged requests, this is a high-write workload. Historical benchmarks showed Prisma 5-6 performing 7-8x slower than direct Supabase client queries.

**What changed with Prisma 7 (late 2025):**
- Eliminated the Rust query engine entirely
- Query compiler now runs as a WASM module on the JS main thread
- Pure TypeScript client -- no separate engine process
- Claims 3x faster queries vs. previous versions
- Dramatically better cold starts in serverless

**Remaining concerns:**
- Prisma still adds ORM overhead vs. raw SQL for bulk inserts
- Connection pooling is critical in serverless (Vercel)

**Mitigation strategy:**

```
For high-volume logging (hot path):
  Use Supabase client directly (supabase.from('logs').insert([...]))
  Batch inserts (collect 10-50 logs, insert in one call)

For everything else (CRUD, relations, queries):
  Use Prisma (type-safe, great DX, migration management)
```

**Connection pooling setup (required):**

```
# .env
# Direct connection for migrations
DATABASE_URL="postgresql://user:pass@db.xxx.supabase.co:5432/postgres"

# Pooled connection for application queries (through Supavisor)
DIRECT_URL="postgresql://user:pass@db.xxx.supabase.co:5432/postgres"
DATABASE_URL="postgresql://user:pass@pooler.xxx.supabase.co:6543/postgres?pgbouncer=true"
```

```prisma
// schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // pooled
  directUrl = env("DIRECT_URL")        // direct for migrations
}
```

**Vercel-specific:** Use Supavisor (Supabase's built-in pooler) on port 6543 with `pgbouncer=true`. Set `connection_limit=1` per serverless function and increase only if needed. With Vercel Fluid Compute, concurrent requests to the same instance can reuse the same connection pool.

**Alternative considered: Drizzle ORM**
Drizzle offers ~90% smaller bundle, sub-500ms cold starts (vs. 1-3s for Prisma 5-6), and SQL-like syntax. However, Prisma 7 narrowed this gap significantly. Prisma is recommended here because:
- Better migration tooling (critical for evolving schemas)
- Stronger type generation from schema
- Better documentation and ecosystem maturity
- Prisma 7 eliminates most of the historical performance gap

**Confidence:** MEDIUM -- Prisma 7 performance claims are from Prisma's own benchmarks. Real-world high-write serverless data is still scarce. The dual-client strategy (Supabase for hot path, Prisma for everything else) mitigates the risk.

### 3. Recharts for Real-Time Dashboard Charts

**Capabilities confirmed (Recharts 3.7.0):**
- Line, Area, Bar, Scatter, Pie, Radar, Treemap charts
- Composable, declarative API (React component-based)
- SVG rendering (crisp at all resolutions)
- Tooltips, legends, responsive containers
- Animation support

**Performance characteristics:**
- Handles 100K+ data points (outperforms Chart.js at scale per 2025 benchmarks)
- At 1M data points, requires server-side aggregation (do not send raw data to client)
- SVG-only rendering (no Canvas fallback for extremely large datasets)
- Re-renders can be expensive without memoization

**For p50/p95/p99 latency charts:**
Recharts supports this natively via `<AreaChart>` with multiple `<Area>` components:

```tsx
<AreaChart data={latencyData}>
  <Area dataKey="p99" stroke="#ef4444" fill="#fecaca" />
  <Area dataKey="p95" stroke="#f59e0b" fill="#fef3c7" />
  <Area dataKey="p50" stroke="#22c55e" fill="#dcfce7" />
  <XAxis dataKey="timestamp" />
  <YAxis />
  <Tooltip />
</AreaChart>
```

**Performance optimization requirements for real-time:**

| Strategy | Implementation | Priority |
|----------|---------------|----------|
| Server-side aggregation | Compute p50/p95/p99 in PostgreSQL, not in React | CRITICAL |
| Time windowing | Show last 1h/6h/24h, not all time | CRITICAL |
| Debounce updates | Throttle Supabase real-time updates to 1-2s intervals | HIGH |
| Memoize chart data | `useMemo` for data transformations | HIGH |
| Stable references | Use `useCallback` for custom tick formatters | MEDIUM |
| Component isolation | Wrap each chart in its own component to prevent cascade re-renders | MEDIUM |

**Alternatives considered:**

| Library | Strengths | Why Not |
|---------|-----------|---------|
| Tremor | Beautiful defaults, built on Recharts, Tailwind-native | Higher-level abstraction limits p50/p95/p99 customization |
| Nivo | Canvas + SVG rendering, stunning theming | Heavier bundle, more complex API |
| Chart.js (react-chartjs-2) | Canvas rendering, lighter for huge datasets | Less React-idiomatic, weaker composability |

**Verdict:** Recharts is the right choice for this project. It handles the required chart types well, has strong React integration, and performs adequately for dashboard-scale data (pre-aggregated on the server). The key constraint is: always aggregate data server-side before sending to charts.

**Confidence:** HIGH -- verified via official Recharts performance guide and 2025 benchmark data.

### 4. Supabase Real-Time for Dashboard Auto-Refresh

**How it works:**
Supabase Realtime uses PostgreSQL's Write-Ahead Log (WAL) to detect changes and push them to connected clients via WebSocket channels.

**Plan limits (verified from official docs):**

| Limit | Free | Pro | Pro (no cap) | Team |
|-------|------|-----|-------------|------|
| Concurrent connections | 200 | 500 | 10,000 | 10,000 |
| Messages/second | 100 | 500 | 2,500 | 2,500 |
| Channel joins/second | 100 | 500 | 2,500 | 2,500 |
| Channels per connection | 100 | 100 | 100 | 100 |
| Postgres changes payload | 1,024 KB | 1,024 KB | 1,024 KB | 1,024 KB |

**For a portfolio demo:** Free tier (200 connections, 100 msg/s) is more than sufficient. For production at scale, Pro with no spend cap gives 10K connections and 2,500 msg/s.

**Implementation pattern for Next.js App Router:**

```typescript
// hooks/useRealtimeLogs.ts
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export function useRealtimeLogs(projectId: string) {
  const [logs, setLogs] = useState<Log[]>([]);
  const supabase = createClient();

  useEffect(() => {
    // Initial fetch
    supabase
      .from('request_logs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setLogs(data ?? []));

    // Real-time subscription
    const channel = supabase
      .channel(`logs:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'request_logs',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          setLogs((prev) => [payload.new as Log, ...prev].slice(0, 100));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  return logs;
}
```

**Critical setup steps:**
1. Enable Realtime on the table: `ALTER PUBLICATION supabase_realtime ADD TABLE request_logs;`
2. Enable Row Level Security (RLS) on all tables
3. Create separate Supabase client files for client and server (`/utils/supabase/client.ts` and `/utils/supabase/server.ts`)

**Scaling consideration:** For dashboard charts that show aggregated metrics (not raw logs), do NOT subscribe to every INSERT. Instead, use a cron job or database function that computes aggregates every 5-30 seconds, and subscribe to the aggregate table changes. This reduces message volume by 100-1000x.

**Confidence:** HIGH -- verified via official Supabase Realtime docs and limits page.

### 5. Zustand with Next.js App Router

**Key constraint:** Zustand stores must NOT be used in React Server Components. RSCs cannot use hooks or context and are not meant to be stateful.

**Correct pattern:**

```typescript
// stores/dashboard-store.ts
import { create } from 'zustand';

interface DashboardState {
  timeRange: '1h' | '6h' | '24h' | '7d';
  selectedProject: string | null;
  setTimeRange: (range: DashboardState['timeRange']) => void;
  setSelectedProject: (id: string | null) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  timeRange: '1h',
  selectedProject: null,
  setTimeRange: (timeRange) => set({ timeRange }),
  setSelectedProject: (selectedProject) => set({ selectedProject }),
}));
```

**Zustand is ideal for this project because:**
- Dashboard filter state (time range, selected project, view mode)
- WebSocket connection state
- UI preferences (theme, chart type selections)
- Minimal boilerplate, no providers needed
- Tiny bundle (~1 kB)

**Do NOT use Zustand for:**
- Server-fetched data (use React Server Components or SWR/React Query)
- Real-time subscription data (use Supabase hooks directly)
- Auth state (use Supabase Auth)

**Confidence:** HIGH -- verified via official Zustand Next.js guide.

### 6. Token-Bucket Rate Limiting

**Recommended: @upstash/ratelimit with Upstash Redis**

This is the standard solution for Next.js on Vercel. It is HTTP-based (no persistent TCP connection to Redis), works on edge and serverless, and is officially recommended.

**Implementation pattern:**

```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Token bucket: 10 tokens max, refill 5 tokens per 10 seconds
export const rateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.tokenBucket(5, '10 s', 10),
  analytics: true,
  prefix: 'ai-ops',
});

// Usage in API route
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1';
  const { success, limit, remaining, reset } = await rateLimiter.limit(ip);

  if (!success) {
    return new Response('Rate limit exceeded', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
      },
    });
  }

  // Process request...
}
```

**Why not in-memory rate limiting?**
Vercel serverless functions are stateless. In-memory rate limiters (e.g., `express-rate-limit`) lose state between invocations. Upstash Redis provides shared state across all function instances.

**Cost:** Upstash free tier includes 10,000 commands/day -- more than enough for a portfolio demo. Pay-as-you-go beyond that.

**Confidence:** HIGH -- this is the documented, standard approach.

---

## Installation Commands

```bash
# Core framework (UPGRADE: Next.js 15, not 14)
npx create-next-app@latest ai-ops-dashboard --typescript --tailwind --eslint --app --src-dir

# Database & ORM
npm install @supabase/supabase-js @supabase/ssr prisma @prisma/client

# AI orchestration (Vercel AI SDK, NOT LangChain)
npm install ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google

# Direct provider SDKs (for token counting, cost calc)
npm install openai @anthropic-ai/sdk @google/genai

# Charts
npm install recharts

# State management
npm install zustand

# Rate limiting
npm install @upstash/ratelimit @upstash/redis

# Dev dependencies
npm install -D prisma @types/node @types/react
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| AI Orchestration | Vercel AI SDK | LangChain.js | 50% larger bundle, blocks edge runtime, adds complexity for features not needed |
| AI Orchestration | Vercel AI SDK | Direct SDKs only | No unified interface, no streaming hooks, more boilerplate |
| ORM | Prisma 7 | Drizzle ORM | Prisma 7 closes performance gap; better migrations, stronger ecosystem |
| ORM | Prisma 7 | Supabase client only | No type-safe schema, no migration management, no relation handling |
| Charts | Recharts | Tremor | Too high-level for custom p50/p95/p99 charts |
| Charts | Recharts | Nivo | Heavier, more complex API; Recharts sufficient for dashboard needs |
| Rate Limiting | @upstash/ratelimit | In-memory (express-rate-limit) | Stateless serverless breaks in-memory approach |
| State | Zustand | Redux Toolkit | Overkill for dashboard filter state; Zustand is simpler |
| State | Zustand | Jotai | Both excellent; Zustand better for dashboard-wide shared state |
| Framework | Next.js 15 | Next.js 14 | 14 is two major versions behind; no reason for new project |
| Framework | Next.js 15 | Next.js 16 | 16 is stable but newer; 15 has more community resources |

---

## Version Matrix (Verified 2026-03-01)

| Package | Version | Last Updated | Confidence |
|---------|---------|-------------|------------|
| next | 15.x (latest stable) | Active | HIGH |
| react | 19.x | Active | HIGH |
| typescript | 5.x | Active | HIGH |
| tailwindcss | 4.x | Active | HIGH |
| recharts | 3.7.0 | ~1 month ago | HIGH |
| zustand | 5.0.11 | ~1 month ago | HIGH |
| @supabase/supabase-js | Latest | Active | HIGH |
| prisma / @prisma/client | 7.x (7.2.0+) | Active | HIGH |
| ai (Vercel AI SDK) | 6.0.105 | Hours ago | HIGH |
| @ai-sdk/openai | Latest | Days ago | HIGH |
| @ai-sdk/anthropic | Latest | Days ago | HIGH |
| @ai-sdk/google | Latest | Days ago | HIGH |
| openai | 6.25.0 | Days ago | HIGH |
| @anthropic-ai/sdk | 0.78.0 | ~1 week ago | HIGH |
| @google/genai | 1.43.0 | Days ago | HIGH |
| @upstash/ratelimit | 2.0.8 | ~1 month ago | HIGH |
| langchain (NOT recommended) | 1.2.28 | Hours ago | HIGH (version), N/A (not using) |

---

## Architecture Implications

### Dual-Client Strategy for Database Access

```
                    +------------------+
                    |   Next.js App    |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
    +---------v----------+     +------------v-----------+
    |   Prisma Client    |     |   Supabase Client      |
    |   (Schema, CRUD,   |     |   (Real-time subs,     |
    |    Relations,       |     |    Hot-path logging,   |
    |    Migrations)      |     |    Auth, Storage)      |
    +---------+----------+     +------------+-----------+
              |                             |
              +----------+  +--------------+
                         |  |
                   +-----v--v------+
                   |   Supavisor   |
                   |  (Pooler)     |
                   +-------+------+
                           |
                   +-------v------+
                   |  PostgreSQL  |
                   |  (Supabase)  |
                   +--------------+
```

### AI Provider Routing

```
                    +------------------+
                    |   API Route      |
                    +--------+---------+
                             |
                    +--------v---------+
                    | Vercel AI SDK    |
                    | Provider Registry|
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
    +---------v--+  +--------v---+  +-------v----+
    |  OpenAI    |  |  Anthropic |  |   Google   |
    |  (primary) |  |  (fallback)|  |  (fallback)|
    +------------+  +------------+  +------------+
```

---

## Open Questions / Risks

1. **Prisma 7 at scale:** The Rust-to-TypeScript migration is recent. High-write performance at 1M+ rows under serverless conditions needs validation during development. Fallback plan: use Supabase client directly for all write operations.

2. **Supabase Realtime at scale:** Free tier limits (100 msg/s) are fine for demo but need monitoring. Aggregation strategy (compute server-side, subscribe to summaries) is essential for production.

3. **Vercel AI Gateway:** Model fallback routing is available but tied to Vercel's infrastructure. Custom fallback logic (shown above) provides platform independence.

4. **Recharts 3.x:** Major version with potential breaking changes from 2.x tutorials. Ensure all examples reference 3.x API.

5. **Cost tracking accuracy:** Token counting and cost calculation must use provider-specific pricing. The Vercel AI SDK returns token usage in responses, but cost calculation requires maintaining a pricing table that updates when providers change rates.

---

## Sources

### Official Documentation (HIGH confidence)
- [Supabase Realtime with Next.js](https://supabase.com/docs/guides/realtime/realtime-with-nextjs)
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits)
- [Prisma with Supabase](https://supabase.com/docs/guides/database/prisma)
- [Vercel AI SDK Provider Registry](https://ai-sdk.dev/docs/reference/ai-sdk-core/provider-registry)
- [Vercel AI SDK streamText](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
- [Recharts Performance Guide](https://recharts.github.io/en-US/guide/performance/)
- [Zustand Next.js Guide](https://zustand.docs.pmnd.rs/guides/nextjs)
- [Prisma 7 Announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- [Prisma Deploy to Vercel](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Upstash Ratelimit for Next.js](https://upstash.com/blog/nextjs-ratelimiting)

### Ecosystem Comparisons (MEDIUM confidence)
- [LangChain vs Vercel AI SDK vs OpenAI SDK: 2026 Guide](https://strapi.io/blog/langchain-vs-vercel-ai-sdk-vs-openai-sdk-comparison-guide)
- [NeuroLink vs LangChain vs Vercel AI SDK: 2026 Comparison](https://dev.to/neurolink/neurolink-vs-langchain-vs-vercel-ai-sdk-an-honest-2026-comparison-mjb)
- [Drizzle vs Prisma: 2026 Comparison](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- [Best React Chart Libraries 2025](https://blog.logrocket.com/best-react-chart-libraries-2025/)
- [Supabase at Scale: 10K to 10M Records](https://www.stacksync.com/blog/supabase-at-scale)
- [Vercel AI SDK Review 2026](https://www.truefoundry.com/blog/vercel-ai-review-2026-we-tested-it-so-you-dont-have-to)

### Version Information (HIGH confidence)
- [openai npm](https://www.npmjs.com/package/openai) -- v6.25.0
- [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk) -- v0.78.0
- [@google/genai npm](https://www.npmjs.com/package/@google/genai) -- v1.43.0
- [ai npm (Vercel AI SDK)](https://www.npmjs.com/package/ai) -- v6.0.105
- [recharts npm](https://www.npmjs.com/package/recharts) -- v3.7.0
- [zustand npm](https://www.npmjs.com/package/zustand) -- v5.0.11
- [@upstash/ratelimit npm](https://www.npmjs.com/package/@upstash/ratelimit) -- v2.0.8
- [prisma npm](https://www.npmjs.com/package/prisma) -- v7.x
- [langchain npm](https://www.npmjs.com/package/langchain) -- v1.2.28 (not recommended)
