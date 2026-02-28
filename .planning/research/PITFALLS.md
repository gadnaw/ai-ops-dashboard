# Domain Pitfalls

**Domain:** AI Operations / LLM Monitoring Dashboard
**Researched:** 2026-03-01

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or fundamental architecture failures.

---

### Pitfall 1: Supabase + Prisma Connection Pooling Misconfiguration

**What goes wrong:** Prisma defaults to creating `num_cpus * 2 + 1` connections per instance. On Vercel serverless, each cold-started function opens its own pool. With even moderate traffic, you exhaust Supabase's connection limit (60 on free tier, 200 on Pro) within minutes. Migrations fail with `prepared statement "s0" does not exist` when run through Supavisor's transaction-mode pooler.

**Why it happens:** Prisma and Supabase both manage connection pooling but with different assumptions. Supavisor's transaction mode (port 6543) does not support prepared statements, which Prisma creates by default in the background. Developers use a single `DATABASE_URL` for both runtime queries and migrations.

**Consequences:** Production database becomes unreachable. Dashboard shows connection timeout errors. Migrations corrupt or fail silently. Data integrity at risk during partial migration failures.

**Prevention:**
- Use TWO connection strings: `DATABASE_URL` (pooled, port 6543 with `?pgbouncer=true`) for Prisma Client, and `DIRECT_URL` (direct, port 5432) for Prisma CLI/migrations
- Set `connection_limit=1` in the Prisma connection string for serverless environments, increase cautiously only if proven necessary
- Add `pgbouncer=true` to the pooled connection string to disable Prisma's prepared statements
- Configure in `schema.prisma`: `directUrl = env("DIRECT_URL")` under the datasource block

**Detection:** `FATAL: too many connections` errors in Supabase logs. Prisma `P2024` (timed out fetching connection from pool) or `P1001` (can't reach database) errors. Migration failures mentioning prepared statements.

**Confidence:** HIGH -- verified via [Supabase Prisma troubleshooting docs](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting) and [Prisma Supabase guide](https://www.prisma.io/docs/orm/overview/databases/supabase)

---

### Pitfall 2: Vercel Serverless Timeout Kills Dashboard Aggregation Queries

**What goes wrong:** The Hobby tier enforces a hard 10-second timeout on serverless functions. Pro bumps this to 60 seconds. Dashboard pages that aggregate LLM request logs (cost summaries, latency percentiles, prompt version comparisons) hit these limits once the logs table exceeds a few thousand rows, especially with Prisma's abstraction overhead.

**Why it happens:** Dashboard aggregation queries are inherently expensive -- they scan time-series data, group by multiple dimensions (provider, model, prompt version), and compute aggregates. Prisma adds its own overhead (query translation, result deserialization). Combined with a serverless cold start (800ms-2.5s), you lose 10-25% of your time budget before a single query runs.

**Consequences:** Users see timeout errors on the dashboard. API routes return 504 Gateway Timeout. The dashboard appears broken under any realistic data volume, which is fatal for a portfolio demo meant to show production readiness.

**Prevention:**
- Pre-compute aggregations: use Supabase database functions or scheduled jobs to materialize summary tables (hourly/daily rollups) rather than computing on the fly
- Use Vercel's Fluid Compute (available on paid plans) which allows up to 14 minutes and provides concurrency within a single instance, reducing cold starts
- Implement incremental aggregation: update running totals on each new log entry rather than full scans
- Add composite indexes on `(created_at, provider, model)` and `(prompt_version_id, created_at)` for the logs table
- Use Prisma's `select` instead of `include` to fetch only needed columns
- Paginate all list queries; never load unbounded result sets

**Detection:** API routes returning 504 status. Vercel function logs showing `FUNCTION_INVOCATION_TIMEOUT`. Dashboard pages taking >3 seconds to render.

**Confidence:** HIGH -- verified via [Vercel timeout documentation](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out) and [Prisma large-scale challenges](https://medium.com/@dotsinspace/challenges-with-prisma-io-orm-82bfc54043d1)

---

### Pitfall 3: LangChain Abstraction Tax and Version Instability

**What goes wrong:** LangChain pulls in 400+ transitive dependencies, introduces breaking API changes between minor versions, and adds processing layers that create latency in a monitoring platform where low overhead is critical. The abstractions are designed for building AI applications, not for observing them -- which is what this platform does.

**Why it happens:** LangChain is an AI application framework, not a monitoring library. Using it for an observability platform is a category mismatch. You need thin wrappers around provider APIs for request interception and metrics collection, not the full chain/agent/memory abstraction stack. LangChain's rapid iteration means code that works today may break on `npm update` next month.

**Consequences:** Bloated bundle size slows dashboard load. Debugging through LangChain abstractions wastes development time. Version updates break production. The monitoring layer itself becomes a source of latency and instability -- the opposite of what an observability tool should be.

**Prevention:**
- **Strongly reconsider whether LangChain is needed at all for this project.** For an observability platform, you primarily need: (a) thin SDK wrappers around OpenAI/Anthropic/Google APIs that intercept requests and collect metrics, and (b) a proxy or middleware layer that logs prompts, responses, tokens, latency, and cost.
- If LangChain is used for demo purposes (showing LLM orchestration that the platform monitors), isolate it completely: put it in a separate "demo app" package that generates traffic, not in the monitoring platform itself
- Pin LangChain to exact versions (`"langchain": "0.3.x"` not `"^0.3.0"`)
- Consider Vercel AI SDK as a lighter alternative for multi-provider streaming with a unified interface -- it was purpose-built for Next.js and has much smaller dependency footprint
- For direct provider calls, use the official SDKs (openai, @anthropic-ai/sdk, @google/generative-ai) with a custom wrapper that adds instrumentation

**Detection:** `node_modules` exceeding 500MB. Build times increasing. Unexplained failures after dependency updates. Latency on monitored requests that disappears when LangChain is bypassed.

**Confidence:** HIGH -- verified via [multiple](https://sider.ai/blog/ai-tools/is-langchain-still-worth-it-a-2025-review-of-features-limits-and-real-world-fit) [sources](https://www.lindy.ai/blog/langchain-alternatives) and widespread community consensus on LangChain's abstraction overhead

---

### Pitfall 4: API Key Exposure in Client-Side Code

**What goes wrong:** LLM provider API keys (OpenAI, Anthropic, Google) or the Supabase service_role key get bundled into client-side JavaScript. Any user can extract them from browser dev tools and run up charges or access/delete data.

**Why it happens:** Next.js App Router makes the server/client boundary implicit. A developer adds an API key to an environment variable, prefixes it with `NEXT_PUBLIC_` for convenience (or imports a server module from a client component), and the key ships to every browser. The Supabase `anon` key is intentionally public, but the `service_role` key bypasses all RLS policies -- confusing the two is a common mistake.

**Consequences:** Financial exposure: rogue API usage on your OpenAI/Anthropic account. Data breach: service_role key gives full database access. Reputational damage: for a portfolio project demonstrating "production-grade" practices, this is disqualifying.

**Prevention:**
- NEVER prefix LLM API keys or the Supabase service_role key with `NEXT_PUBLIC_`
- All LLM provider calls MUST go through Next.js API routes (server-side only)
- Use Supabase's `anon` key on the client (protected by RLS), `service_role` only in server-side code
- Implement server-side Route Handlers for all provider interactions
- Add a pre-commit hook or CI check that greps for `NEXT_PUBLIC_.*KEY` patterns in `.env` files
- Store secrets in Vercel's environment variable system, not in `.env.local` committed to git
- Rotate keys every 90 days; set billing alerts on all LLM provider accounts

**Detection:** Search the built output (`_next/static`) for API key patterns. Use `NEXT_PUBLIC_` audit in CI. Check browser Network tab for direct calls to `api.openai.com` from the frontend.

**Confidence:** HIGH -- verified via [Supabase API key documentation](https://supabase.com/docs/guides/api/api-keys) and [Next.js security best practices](https://www.turbostarter.dev/blog/complete-nextjs-security-guide-2025-authentication-api-protection-and-best-practices)

---

### Pitfall 5: Server/Client Component Boundary Mismanagement

**What goes wrong:** Placing `"use client"` too high in the component tree forces large subtrees into the client bundle, killing the performance advantages of React Server Components. Conversely, trying to use `useState`, `useEffect`, or Zustand stores in Server Components causes build errors. Dashboard pages that should be fast server-rendered aggregations become bloated client-side SPAs.

**Why it happens:** The App Router's mental model is new and counterintuitive. Developers default to `"use client"` at the page level to "make things work," not realizing this converts the entire page and all its imports into client components. A monitoring dashboard has a natural split -- data-heavy tables and charts are mostly read-only (server), while filters, search, and real-time updates need interactivity (client) -- but this split requires deliberate composition.

**Consequences:** Bundle size bloats. Initial page load slows. Server-side data fetching advantages are lost. Hydration errors appear due to mismatches between server and client state. The dashboard "works" but performs poorly, undermining the "production-grade" positioning.

**Prevention:**
- Default to Server Components. Only add `"use client"` to the smallest leaf components that need interactivity (filter dropdowns, search inputs, real-time counters)
- Use the "donut pattern": Server Component parent fetches data, passes it as props to a Client Component child that handles interactivity
- Keep Recharts chart wrappers as Client Components, but fetch and transform chart data in Server Components
- Wrap slow data fetches in `<Suspense>` boundaries with skeleton loaders, not `"use client"`
- Never import a Server Component into a Client Component -- pass it as `children` props instead

**Detection:** Run `next build` and check the bundle analysis. If page bundles exceed 100KB for data-display pages, the boundary is wrong. Hydration mismatch warnings in the console.

**Confidence:** HIGH -- verified via [Next.js official documentation](https://nextjs.org/docs/app/getting-started/server-and-client-components) and [LogRocket RSC performance analysis](https://blog.logrocket.com/react-server-components-performance-mistakes)

---

## Moderate Pitfalls

Mistakes that cause significant delays, technical debt, or degraded user experience.

---

### Pitfall 6: LLM Provider Streaming Format Inconsistency

**What goes wrong:** Building a unified streaming display that works across OpenAI, Anthropic, and Google requires handling three different SSE event formats. OpenAI uses `choices[0].delta.content`, Anthropic uses typed events (`content_block_delta` with `delta.text`), and Google uses yet another structure. A "works with OpenAI" implementation silently breaks or drops tokens with other providers.

**Why it happens:** There is no standard for LLM streaming response format. Each provider designed their SSE payload independently. Token usage reporting also differs: OpenAI reports usage in the final chunk, Anthropic reports input tokens at `message_start` and output tokens at `message_delta`.

**Prevention:**
- Build a provider adapter layer from day one. Each provider gets its own stream parser that normalizes events into a common internal format: `{ type: 'token' | 'usage' | 'done', content: string, usage?: TokenUsage }`
- Consider Vercel AI SDK which already implements this normalization with `streamText()` supporting OpenAI, Anthropic, and Google with a unified interface
- Test streaming with all three providers in development, not just OpenAI
- Handle partial JSON in SSE chunks (providers sometimes split JSON across chunk boundaries)

**Confidence:** HIGH -- verified via [Anthropic streaming docs](https://platform.claude.com/docs/en/build-with-claude/streaming) and [provider format comparison](https://medium.com/percolation-labs/comparing-the-streaming-response-structure-for-different-llm-apis-2b8645028b41)

---

### Pitfall 7: Cost Calculation Edge Cases

**What goes wrong:** Cost tracking shows incorrect numbers because it ignores cached tokens, system prompt tokens, or uses stale pricing. Users see costs that don't match their provider billing, destroying trust in the monitoring platform's core value proposition.

**Why it happens:** OpenAI's prompt caching (automatic for prompts over 1024 tokens) charges cached input tokens at 10% of the regular rate, but this requires parsing `usage.prompt_tokens_details.cached_tokens` from the response. Anthropic has a different caching model. System prompts are billed but often excluded from naive token counting. Provider pricing changes without notice -- hardcoded price tables go stale.

**Prevention:**
- Always parse the FULL usage object from API responses, including `cached_tokens`, `reasoning_tokens`, and any provider-specific fields
- Store raw token counts AND computed costs separately. When pricing changes, you can recompute historical costs
- Implement a pricing configuration table (provider, model, input_price_per_1k, cached_input_price_per_1k, output_price_per_1k) that can be updated without code changes
- Add a "pricing last updated" indicator in the UI so users know the freshness
- For Anthropic, account for their separate prompt caching pricing (cache creation vs cache read tokens)
- Include a "raw API response" view in the UI so users can verify token counts against their provider dashboard

**Detection:** Compare platform-reported costs against provider billing dashboards. Discrepancies signal missing edge cases. Run test prompts with known token counts and verify.

**Confidence:** HIGH -- verified via [OpenAI prompt caching docs](https://platform.openai.com/docs/guides/prompt-caching) and [OpenAI pricing](https://developers.openai.com/api/docs/pricing)

---

### Pitfall 8: Prisma N+1 Queries in Dashboard Aggregations

**What goes wrong:** Dashboard pages that show "requests by prompt version" or "cost by provider by day" execute one query per row instead of a single aggregated query. A page showing 30 days of data across 5 providers fires 150+ queries. Prisma's dataloader batching only helps with `findUnique`, not with custom aggregations.

**Why it happens:** Prisma's relation loading uses `include` which triggers separate queries per relation. Dashboard components that iterate over results and fetch related data in loops create classic N+1 patterns. Prisma's query API makes it easy to write code that looks clean but generates terrible SQL.

**Prevention:**
- Use Prisma's `groupBy` for all aggregation queries instead of fetching records and aggregating in JavaScript
- Use `$queryRaw` for complex aggregations that Prisma's query builder cannot express efficiently (time-bucketed aggregations, percentile calculations)
- Use `select` instead of `include` everywhere -- only fetch the columns you need
- Add database views for common dashboard queries (e.g., `daily_cost_summary`, `hourly_latency_percentiles`)
- Monitor query count per page render using Prisma's logging (`log: ['query']`) during development
- Consider using Supabase's built-in PostgREST for simple aggregations and Prisma only for complex operations

**Detection:** Enable Prisma query logging. If a single page load generates >10 queries, investigate. Check Supabase dashboard for slow query logs.

**Confidence:** HIGH -- verified via [Prisma query optimization docs](https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance) and [Prisma scaling challenges](https://medium.com/@dotsinspace/challenges-with-prisma-io-orm-82bfc54043d1)

---

### Pitfall 9: Supabase Realtime Subscription Fragility

**What goes wrong:** Real-time dashboard updates (new requests appearing, live cost counters, latency sparklines) stop working silently. Subscriptions enter a CLOSED state but the UI doesn't reflect this. Tab backgrounding, network interruptions, or exceeding channel limits cause subscriptions to die without recovery.

**Why it happens:** Supabase Realtime has plan-based limits on concurrent connections, events per second, and channel joins per second. When limits are exceeded, connections are silently dropped. The built-in reconnection logic works for simple cases but has known issues: subscriptions can report CLOSED status while the underlying connection appears open, and reconnection after prolonged background tab states can get stuck in a loop.

**Prevention:**
- Implement explicit connection health monitoring: check subscription status on an interval and force reconnect if stale
- Use a single Supabase channel with filters rather than multiple channels per dashboard widget
- Implement a "connection status" indicator in the UI (green/yellow/red) so users know when data is stale
- Add a manual "refresh" button as a fallback for when real-time fails
- Handle tab visibility changes (`document.visibilitychange`) to force resubscription when the tab becomes active
- Debounce incoming events to avoid overwhelming the UI with rapid updates
- Set reasonable expectations: use real-time for notifications and counters, not for full table replication

**Detection:** Subscription status callbacks showing CLOSED. Dashboard data stops updating but no error is visible. Users report "stale" data.

**Confidence:** HIGH -- verified via [Supabase Realtime limits documentation](https://supabase.com/docs/guides/realtime/limits) and [community reconnection issues](https://github.com/orgs/supabase/discussions/27513)

---

### Pitfall 10: Zustand Hydration Mismatch with Next.js App Router

**What goes wrong:** Client state managed by Zustand (filter selections, dashboard preferences, selected time range) causes React hydration errors because the server renders with default/empty state while the client initializes with persisted localStorage values.

**Why it happens:** Zustand's `persist` middleware stores state in localStorage, which is only available client-side. During SSR, the store has default values. On hydration, the client reads persisted values from localStorage, producing different HTML than the server rendered. React detects the mismatch and throws a hydration error or, worse, silently produces incorrect UI.

**Prevention:**
- Use `skipHydration: true` in Zustand persist options and manually call `rehydrate()` in a `useEffect`
- Alternatively, use a custom hook built on `useSyncExternalStore` with a server-side fallback value
- Do NOT define Zustand stores as global module-level singletons in the App Router -- they can leak state between requests in server-side contexts
- Create stores per-request using a provider pattern (React Context wrapping a Zustand store ref)
- Keep persisted state minimal: only user preferences, not data that should come from the server

**Detection:** React hydration mismatch warnings in the browser console. UI "flashing" between states on page load. Filter values resetting unexpectedly.

**Confidence:** HIGH -- verified via [Zustand Next.js guide](https://zustand.docs.pmnd.rs/guides/nextjs) and [community solutions](https://medium.com/@koalamango/fix-next-js-hydration-error-with-zustand-state-management-0ce51a0176ad)

---

### Pitfall 11: Recharts Performance with Dashboard-Scale Data

**What goes wrong:** Charts become sluggish or freeze when rendering time-series data with thousands of points. A latency chart showing 30 days of per-request data (potentially 10,000+ points) causes the browser tab to become unresponsive. SVG DOM nodes multiply rapidly since Recharts renders each data point as a separate element.

**Why it happens:** Recharts is SVG-based, meaning every data point creates a DOM node. The `getStringSize()` function for axis label calculations gets called ~40,000 times for dense charts. Animations add further overhead. For a monitoring dashboard that naturally deals with high-cardinality time-series data, this is a fundamental mismatch.

**Prevention:**
- Downsample data before rendering: show hourly/minute-level aggregates, not raw per-request data points. Implement server-side downsampling with time-bucket aggregation
- Limit chart data to 200-500 points maximum. Use the LTTB (Largest-Triangle-Three-Buckets) algorithm for visually accurate downsampling
- Disable animations on all dashboard charts (`isAnimationActive={false}`)
- Use `React.memo` and stable `dataKey` references (via `useCallback`) to prevent unnecessary re-renders
- Lazy-load charts below the fold with Intersection Observer
- For truly real-time charts (updating every second), consider switching to a Canvas-based library like `react-chartjs-2` or `lightweight-charts` for those specific widgets

**Detection:** Browser DevTools Performance tab showing long frames (>16ms) during chart renders. React Profiler showing Recharts components as render bottlenecks.

**Confidence:** HIGH -- verified via [Recharts performance guide](https://recharts.github.io/en-US/guide/performance/) and [Recharts large dataset issue #1146](https://github.com/recharts/recharts/issues/1146)

---

### Pitfall 12: Data Fetching Waterfalls in Dashboard Pages

**What goes wrong:** A dashboard page that shows cost summary, latency chart, recent requests, and prompt version stats fetches each sequentially. Each Server Component `await`s its own data, creating a waterfall where the total page load is the SUM of all query times rather than the MAX.

**Why it happens:** The natural pattern in App Router -- each component fetches its own data with `await` -- creates sequential waterfalls because `await` blocks rendering of the entire tree beneath it. Without explicit `<Suspense>` boundaries, the page waits for ALL data before sending any HTML.

**Prevention:**
- Use `Promise.all()` or `Promise.allSettled()` at the page level to fetch all dashboard data in parallel
- Wrap each dashboard section in its own `<Suspense>` boundary with skeleton loaders. This allows independent streaming -- the cost summary can appear while latency data is still loading
- Use `loading.tsx` files in route segments for automatic Suspense boundaries
- For truly independent dashboard panels, consider Parallel Routes (`@cost`, `@latency`, `@requests` slots in the layout)
- Pre-compute and cache commonly needed aggregations so queries are fast regardless of fetching pattern

**Detection:** Measure Time to First Byte (TTFB) vs Time to Interactive (TTI). If TTI is significantly higher than the slowest individual query, you have waterfalls. Use Next.js built-in performance traces.

**Confidence:** HIGH -- verified via [Next.js data fetching patterns documentation](https://nextjs.org/docs/14/app/building-your-application/data-fetching/patterns)

---

## Minor Pitfalls

Mistakes that cause annoyance or minor technical debt but are recoverable.

---

### Pitfall 13: RLS Policy Conflicts with Prisma Queries

**What goes wrong:** Supabase Row Level Security policies are applied when using Supabase's client libraries but NOT when using Prisma (which connects directly to PostgreSQL). Developers set up RLS policies, test through Supabase client, then find that Prisma bypasses all security. Or conversely, they add RLS and find their Prisma queries return empty results because the connection role lacks permissions.

**Prevention:**
- Decide early: either use RLS consistently (which means using Supabase client for data access, not Prisma) or handle authorization in application code (which means using Prisma but implementing your own access control layer)
- If using both Prisma and Supabase client, document clearly which is used where and why
- For this project, the recommended approach is: Prisma for all server-side data access (with application-level auth checks), Supabase client for client-side real-time subscriptions only

**Confidence:** MEDIUM -- based on architecture understanding of how RLS and direct PostgreSQL connections interact

---

### Pitfall 14: Testing LLM-Dependent Features

**What goes wrong:** Tests that call real LLM APIs are slow (seconds per call), expensive (tokens cost money), and non-deterministic (same prompt produces different outputs). E2E tests for the dashboard become flaky because they depend on LLM response timing and content.

**Prevention:**
- Create recorded API response fixtures for each provider. Use libraries like `nock` or `msw` to intercept HTTP calls and return recorded responses
- For streaming tests, record the full SSE event sequence and replay it with realistic timing
- Use a separate "test seed" script that populates the database with realistic but deterministic monitoring data
- For E2E tests (Playwright recommended), mock at the API route level, not the provider level -- test that the dashboard correctly displays data, not that OpenAI's API works
- Set up a small test budget ($5/month) for periodic integration tests against real APIs, run on CI schedule (not per-PR)
- Use snapshot testing for chart rendering -- verify the data shape passed to Recharts, not the visual output

**Confidence:** MEDIUM -- based on [LLM testing practices](https://langfuse.com/blog/2025-10-21-testing-llm-applications) and general testing patterns

---

### Pitfall 15: Demo Data Looking Unrealistic

**What goes wrong:** The portfolio demo uses obviously fake data: perfectly uniform distributions, unrealistic token counts, no error states, no latency spikes. Evaluators (hiring managers, clients) immediately recognize it as synthetic and question whether the platform handles real-world scenarios.

**Prevention:**
- Generate demo data with realistic distributions: latency should follow a log-normal distribution with occasional spikes, costs should vary by model, error rates should be 1-3% with occasional bursts
- Include realistic failure modes in demo data: rate limit errors, timeout errors, malformed responses
- Show prompt versioning with actual version progression (v1 has higher costs, v2 optimizes tokens, v3 adds caching)
- Use real-ish prompt content (summarization, classification, extraction tasks) not "Hello World" prompts
- Include time patterns: higher traffic during business hours, lower on weekends
- Add at least one "incident" in the demo timeline -- a cost spike or latency degradation that the dashboard clearly surfaces

**Confidence:** HIGH -- based on portfolio review experience and common demo anti-patterns

---

### Pitfall 16: Over-Engineering for a Portfolio Project

**What goes wrong:** The project balloons to include features no portfolio reviewer will ever evaluate: multi-tenancy, complex RBAC, advanced anomaly detection with ML, custom alerting rules engine. Months pass with no deployable demo. The "production-grade" aspiration becomes the enemy of actually shipping.

**Prevention:**
- Define a firm MVP: single-user dashboard showing requests, costs, latency, and prompt versions for 2-3 LLM providers. This is already impressive if executed well
- Time-box the project: 4-6 weeks to deployable demo. If a feature cannot be completed in that window, it goes on a "Future Work" list (which itself demonstrates product thinking)
- Prioritize breadth of monitoring over depth of any single feature: showing cost + latency + prompt versioning + error tracking at a basic level beats having an enterprise-grade cost analysis module alone
- Build features that can be demonstrated in a 2-minute screen recording. If it takes 10 minutes to explain, it's too complex
- Focus on polish over features: clean UI, smooth transitions, proper loading states, and good error messages impress more than feature count

**Confidence:** HIGH -- universal risk for portfolio projects

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Project scaffolding & DB setup | Connection pooling misconfiguration (#1) | Set up dual connection strings from the start; test with `connection_limit=1` |
| Dashboard data fetching | Waterfall queries (#12), Prisma N+1 (#8) | Use `Promise.all` + Suspense boundaries; enable Prisma query logging from day one |
| Real-time features | Subscription fragility (#9), Zustand hydration (#10) | Build connection health monitoring; use `skipHydration` pattern |
| LLM provider integration | Streaming format differences (#6), API key exposure (#4) | Build provider adapter layer; enforce server-only API routes |
| Cost tracking | Calculation edge cases (#7) | Parse full usage objects; store raw counts separate from computed costs |
| Charts & visualization | Recharts performance (#11) | Downsample server-side; disable animations; limit to 500 data points |
| Testing | LLM mocking (#14), demo data (#15) | Use MSW/nock for provider mocking; invest in realistic seed data generator |
| LangChain integration | Abstraction overhead (#3) | Isolate LangChain to demo traffic generation; use direct SDKs for monitoring layer |
| Overall scope | Over-engineering (#16), scope creep | Time-box to 4-6 weeks; define MVP features before writing code |

---

## Sources

### Official Documentation (HIGH confidence)
- [Supabase Prisma Troubleshooting](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting)
- [Prisma + Supabase Guide](https://www.prisma.io/docs/orm/overview/databases/supabase)
- [Vercel Function Timeouts](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out)
- [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js Data Fetching Patterns](https://nextjs.org/docs/14/app/building-your-application/data-fetching/patterns)
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits)
- [Supabase API Keys](https://supabase.com/docs/guides/api/api-keys)
- [OpenAI Prompt Caching](https://platform.openai.com/docs/guides/prompt-caching)
- [Anthropic Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Recharts Performance Guide](https://recharts.github.io/en-US/guide/performance/)
- [Zustand Next.js Setup](https://zustand.docs.pmnd.rs/guides/nextjs)
- [Prisma Query Optimization](https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance)

### Community & Analysis (MEDIUM confidence)
- [RSC Performance Pitfalls - LogRocket](https://blog.logrocket.com/react-server-components-performance-mistakes)
- [Prisma at Scale Challenges](https://medium.com/@dotsinspace/challenges-with-prisma-io-orm-82bfc54043d1)
- [LLM Streaming Format Comparison](https://medium.com/percolation-labs/comparing-the-streaming-response-structure-for-different-llm-apis-2b8645028b41)
- [LangChain 2025 Review](https://sider.ai/blog/ai-tools/is-langchain-still-worth-it-a-2025-review-of-features-limits-and-real-world-fit)
- [LangChain Alternatives - Lindy](https://www.lindy.ai/blog/langchain-alternatives)
- [Recharts Large Dataset Issues](https://github.com/recharts/recharts/issues/1146)
- [Supabase Realtime Reconnection Issues](https://github.com/orgs/supabase/discussions/27513)
- [Zustand Hydration Fix](https://medium.com/@koalamango/fix-next-js-hydration-error-with-zustand-state-management-0ce51a0176ad)
- [LLM Testing Practices - Langfuse](https://langfuse.com/blog/2025-10-21-testing-llm-applications)
- [Next.js Security Guide 2025](https://www.turbostarter.dev/blog/complete-nextjs-security-guide-2025-authentication-api-protection-and-best-practices)
