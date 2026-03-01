# AI Ops Dashboard

Production-grade observability platform for monitoring LLM API integrations. Track costs, latency, error rates, and prompt performance across OpenAI, Anthropic, and Google models — all from a single dashboard.

**Live Demo:** [c1-ai-observability-platform.vercel.app](https://c1-ai-observability-platform.vercel.app)

## Why This Exists

Teams shipping AI features into production need the same observability they expect from traditional APIs — but LLM calls are expensive, non-deterministic, and hard to debug. This dashboard gives you:

- **Cost visibility** — Per-request token tracking with model-level breakdowns
- **Latency monitoring** — P50/P95/P99 percentiles with time-series trends
- **Prompt versioning** — Git-like version control with diff, rollback, and A/B testing
- **Reliability tools** — Rate limiting, graceful degradation, anomaly alerts

## Features

### Real-Time Dashboard
Cost trends, latency percentiles, request volume, and model distribution — powered by PostgreSQL materialized views and Supabase Realtime subscriptions.

### Multi-Model Routing
Provider-agnostic routing across OpenAI, Anthropic, and Google via Vercel AI SDK. Configurable fallback chains with auto-retry on 429/5xx errors.

### Prompt Version Control
Create named prompt versions with immutable snapshots. Side-by-side diff viewer, one-click rollback, and full version history stored in PostgreSQL.

### A/B Testing with SPRT
Traffic splitting with configurable ratios. Sequential Probability Ratio Test (SPRT) for statistically valid auto-stop decisions — no repeated t-test peeking problems.

### Evaluation Pipeline
Admin-defined rubrics with multi-dimension 1-5 scoring. Automated LLM-as-judge evaluation with a human-in-the-loop review queue for quality calibration.

### Graceful Degradation
Token-bucket rate limiting per API key with 4-stage degradation: queue overflow, fallback to cheaper model, cached response, then 429 with Retry-After. Visual degradation timeline.

### Anomaly Alerts
Configurable alert rules for cost spikes, latency regression, and error rate thresholds. Sliding window detection (5m/15m/1h) with cooldown periods and acknowledge/resolve workflow.

### Interactive Playground
Select any model and prompt version, tweak parameters, and stream responses token-by-token with a live token counter. Every request auto-logs through the same tracking pipeline.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org/) (App Router, Server Components, Parallel Routes) |
| Language | TypeScript (strict mode) |
| AI SDK | [Vercel AI SDK 6](https://sdk.vercel.ai/) — OpenAI, Anthropic, Google providers |
| Database | [Supabase](https://supabase.com/) (PostgreSQL 15 with Row Level Security) |
| ORM | [Prisma 7](https://www.prisma.io/) with `@prisma/adapter-pg` for connection pooling |
| Charts | [Recharts 3](https://recharts.org/) |
| State | [Zustand 5](https://zustand.docs.pmnd.rs/) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) |
| Auth | Supabase Auth (Email + GitHub/Google OAuth) |
| Deploy | [Vercel](https://vercel.com/) |
| Testing | Vitest + Playwright + MSW |

## Architecture

```
Browser
  |
  v
Next.js App Router (Vercel)
  |
  ├─ Server Components ─── Prisma ──── Supabase PostgreSQL
  |                                      ├─ Materialized Views (dashboard queries)
  |                                      ├─ Row Level Security (RBAC)
  |                                      └─ pg_cron (alert checks, eval processing)
  |
  ├─ API Routes (/api/v1/*) ─── Vercel AI SDK ─── OpenAI / Anthropic / Google
  |                              |
  |                              └─ after() ─── Fire-and-forget request logging
  |
  └─ Supabase Realtime ──── Live dashboard updates
```

**Key architectural decisions:**
- **Materialized views** for dashboard aggregations — never scan raw `request_logs`
- **Dual-client DB** — Prisma for CRUD operations, Supabase client for hot-path writes and Realtime
- **Fire-and-forget logging** via Next.js `after()` API — zero latency impact on user-facing responses
- **SPRT over repeated t-tests** for A/B experiment auto-stop — statistically correct sequential testing
- **PostgreSQL token bucket** for rate limiting (Upstash Redis as future upgrade path)

## Project Structure

```
src/
  app/
    (auth)/              Login, signup, OAuth callback
    (dashboard)/
      dashboard/         Main dashboard (parallel route slots)
        @cost/           Cost trend chart
        @latency/        Latency percentiles chart
        @models/         Model distribution pie chart
        @requests/       Request volume bar chart
      prompts/           Prompt list, detail, diff, versioning
      experiments/       A/B test list and detail (SPRT chart)
      evaluation/        Eval overview and review queue
      playground/        Interactive model playground
      degradation/       Degradation timeline
      alerts/            Alert history and rules management
      config/            Model/endpoint configuration
    api/
      v1/               Public API (chat, prompts, experiments, evaluation, models, degradation)
      internal/          pg_cron endpoints (alert checks, eval processing)
      health/            Health check endpoint

  components/
    charts/             Recharts dashboard visualizations
    alerts/             Alert table, rule forms, status badges
    evaluation/         Eval trend, queue stats, review panel
    experiments/        Experiment components
    playground/         Model selector, token counter, prompt picker
    prompts/            Code editor, diff viewer, version list
    layout/             Navigation
    ui/                 Shared primitives (button, input)

  lib/
    ab-testing/         SPRT engine, experiment lifecycle
    alerts/             Alert rule evaluation, dispatch
    auth/               Session, RBAC, OAuth
    cost/               Token counting, cost calculation
    dashboard/          Dashboard query functions
    degradation/        Rate limit events, degradation stages
    evaluator/          LLM-as-judge, rubric scoring
    logging/            Request/response logging pipeline
    model-router/       Multi-model routing, fallback chains
    prompts/            Prompt CRUD, versioning, rollback
    rate-limiter/       Token bucket, per-key limits

prisma/
  schema.prisma         16 models, 3 enums
  seed.ts               10K request logs, prompt versions, experiments, evaluations, alerts
  migrations/           PostgreSQL migrations

supabase/
  setup.sql             pg_cron, RLS policies, Realtime config
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- A [Supabase](https://supabase.com/) project
- At least one LLM API key (OpenAI, Anthropic, or Google)

### Setup

1. **Clone and install**

```bash
git clone https://github.com/gadnaw/ai-ops-dashboard.git
cd ai-ops-dashboard
pnpm install
```

2. **Configure environment**

```bash
cp .env.example .env.local
```

Fill in your credentials:

| Variable | Required | Source |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase > Project Settings > Database (pooled, port 6543) |
| `DIRECT_URL` | Yes | Supabase > Project Settings > Database (direct, port 5432) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase > Project Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase > Project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase > Project Settings > API |
| `OPENAI_API_KEY` | Optional | [platform.openai.com](https://platform.openai.com/) |
| `ANTHROPIC_API_KEY` | Optional | [console.anthropic.com](https://console.anthropic.com/) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional | [aistudio.google.com](https://aistudio.google.com/) |

3. **Set up the database**

```bash
pnpm db:generate        # Generate Prisma client
pnpm db:migrate         # Run migrations
pnpm db:seed            # Seed 10K demo request logs
```

Then run the Supabase setup script (`supabase/setup.sql`) in the SQL Editor to enable pg_cron jobs, RLS policies, and Realtime.

4. **Start developing**

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with Turbopack |
| `pnpm build` | Production build |
| `pnpm lint` | Run ESLint |
| `pnpm type-check` | TypeScript type checking |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm test:e2e` | Run E2E tests (Playwright) |
| `pnpm db:migrate:dev` | Create/apply migrations in dev |
| `pnpm db:seed` | Seed demo data |
| `pnpm db:studio` | Open Prisma Studio |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/chat` | Send a chat completion (multi-model routing) |
| `GET` | `/api/v1/prompts` | List all prompts |
| `POST` | `/api/v1/prompts` | Create a prompt |
| `GET` | `/api/v1/prompts/:id` | Get prompt with version history |
| `POST` | `/api/v1/prompts/:id/rollback` | Rollback to a previous version |
| `GET` | `/api/v1/experiments` | List A/B experiments |
| `POST` | `/api/v1/experiments` | Create an experiment |
| `GET` | `/api/v1/experiments/:id/metrics` | Get experiment metrics and SPRT results |
| `GET` | `/api/v1/evaluation` | List evaluations |
| `POST` | `/api/v1/evaluation` | Submit an evaluation |
| `GET` | `/api/v1/models` | List configured models |
| `GET` | `/api/v1/degradation` | List degradation events |
| `GET` | `/api/health` | Health check (DB, materialized views, dashboard query) |

## Database Schema

16 Prisma models across 5 domains:

- **Identity** — `profiles`, `api_keys` (SHA-256 hashed, per-key rate limits)
- **Observability** — `request_logs`, `model_endpoints` + 3 materialized views
- **Prompts** — `prompts`, `prompt_versions` (immutable snapshots)
- **Experiments** — `experiments`, `experiment_variants`, `experiment_assignments`
- **Reliability** — `rate_limit_buckets`, `rate_limit_events`, `degradation_events`, `alert_rules`, `alert_history`, `evaluations`

## Deployment

The app deploys to Vercel with a single command:

```bash
vercel --prod
```

Build command: `pnpm db:generate && pnpm build`

Ensure all environment variables are set on Vercel (`vercel env add`).

## License

MIT
