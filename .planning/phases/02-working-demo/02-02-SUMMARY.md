---
phase: 2
plan: "02-02"
title: "Model Router — Provider Registry, Fallback Chain, after() Logging, Chat API"
status: "complete"
subsystem: "model-routing"
tags: ["ai-sdk", "streaming", "fallback", "observability", "after", "prisma"]

dependency-graph:
  requires:
    - "02-01: database schema (request_logs, endpoint_configs, dashboard_events, cost_rate_cards)"
    - "02-01: cost calculator at src/lib/cost/calculator.ts"
    - "02-01: prisma client at src/lib/db/prisma.ts"
  provides:
    - "streamWithFallback() — multi-model fallback chain router"
    - "logRequest() — fire-and-forget request logger with cost calculation"
    - "POST /api/v1/chat — streaming chat endpoint"
    - "GET /api/v1/models — available models and endpoint configs"
    - "provider registry — openai, anthropic, google via createProviderRegistry()"
  affects:
    - "02-03: Dashboard UI reads request_logs populated by this plan"
    - "02-04: Config UI writes endpoint_configs read by this plan"
    - "03-xx: Playground uses registry.languageModel() directly for single-shot calls"
    - "04-xx: Rate limiter hooks into onFallback callback from streamWithFallback()"

tech-stack:
  added:
    - "ai@^6 — createProviderRegistry, streamText, after()"
    - "@ai-sdk/openai, @ai-sdk/anthropic, @ai-sdk/google — already installed"
  patterns:
    - "after() fire-and-forget logging pattern (Next.js 15.1+/16.x stable API)"
    - "Hand-rolled try/catch fallback chain (no built-in cross-provider fallback in AI SDK)"
    - "Exponential backoff with jitter (500ms base, 30% jitter, 8s cap)"
    - "exactOptionalPropertyTypes compatibility — conditional spread for optional fields"

key-files:
  created:
    - "src/lib/model-router/types.ts — ModelId, MODEL_PROVIDERS, MODEL_DISPLAY_NAMES, FallbackChainConfig, RouterResult"
    - "src/lib/model-router/errors.ts — isRetryableError(), isRateLimitError(), getErrorCode()"
    - "src/lib/model-router/registry.ts — createProviderRegistry({ openai, anthropic, google })"
    - "src/lib/model-router/router.ts — loadEndpointConfig(), streamWithFallback()"
    - "src/lib/logging/request-logger.ts — logRequest() for after() callbacks"
    - "src/app/api/v1/chat/route.ts — POST /api/v1/chat streaming endpoint"
    - "src/app/api/v1/models/route.ts — GET /api/v1/models public endpoint"
  modified: []

decisions:
  - id: "maxOutputTokens-rename"
    decision: "AI SDK 6 renamed maxTokens to maxOutputTokens in streamText() call settings"
    rationale: "Broke with TS2353 — parameter no longer exists under old name"
    impact: "router.ts uses maxOutputTokens; FallbackChainConfig.maxTokens kept for DB compatibility"
  - id: "promiseLike-catch"
    decision: "StreamTextResult.text is PromiseLike<string> not Promise<string>"
    rationale: "PromiseLike has no .catch() method — must wrap with Promise.resolve()"
    impact: "chat/route.ts uses Promise.resolve(streamResult.text).catch()"
  - id: "exactOptionalPropertyTypes-pattern"
    decision: "Use conditional spread (...(val ? { key: val } : {})) for optional fields"
    rationale: "strictOptionalProperties rejects undefined where null is required (Prisma, AI SDK)"
    impact: "All optional fields in router.ts and chat/route.ts use conditional spread pattern"
  - id: "registry-type-assertion"
    decision: "registry.languageModel() requires template literal type cast for dynamic model IDs"
    rationale: "Models loaded from DB are plain string; registry expects union of known model IDs"
    impact: "Cast as `openai:\${string}` | `anthropic:\${string}` | `google:\${string}` at call site"
  - id: "null-for-optional-prisma-fields"
    decision: "Pass null (not undefined) for optional Prisma fields in requestLog.create()"
    rationale: "exactOptionalPropertyTypes: Prisma optional fields are string|null, not string|undefined"
    impact: "request-logger.ts uses ?? null for all nullable fields"

metrics:
  tasks-completed: 3
  tasks-total: 3
  commits: 3
  files-created: 7
  deviations: 4
  duration: "~25 minutes"
  completed: "2026-03-01"
---

# Phase 2 Plan 02-02: Model Router Summary

**One-liner:** Multi-model fallback chain router with exponential backoff, after() fire-and-forget logging to request_logs, and streaming POST /api/v1/chat endpoint using AI SDK 6.

## What Was Built

The core of the observability platform's value proposition: every LLM request flows through this router, gets logged with full token and cost breakdown, and falls back automatically if the primary model fails.

### Files Created

| File | Purpose |
|------|---------|
| `src/lib/model-router/types.ts` | ModelId union, MODEL_PROVIDERS/DISPLAY_NAMES records, FallbackChainConfig, RouterResult |
| `src/lib/model-router/errors.ts` | isRetryableError() / isRateLimitError() / getErrorCode() — classify 429/5xx/timeout |
| `src/lib/model-router/registry.ts` | createProviderRegistry({ openai, anthropic, google }) — canonical model resolution |
| `src/lib/model-router/router.ts` | loadEndpointConfig() + streamWithFallback() with exponential backoff |
| `src/lib/logging/request-logger.ts` | logRequest() — writes request_logs + dashboard_events on fallback |
| `src/app/api/v1/chat/route.ts` | POST /api/v1/chat — streaming endpoint with after() logging |
| `src/app/api/v1/models/route.ts` | GET /api/v1/models — public endpoint returning models + endpoint configs |

### Architecture

```
POST /api/v1/chat
  → loadEndpointConfig(endpointName)     [reads endpoint_configs table]
  → streamWithFallback(config, params)   [tries models in order]
      → registry.languageModel(modelId)  [resolves provider:model]
      → streamText({ model, ... })       [AI SDK 6 streaming]
      → on 429/5xx: backoff + next model [exponential backoff + jitter]
  → return streamResult.toUIMessageStreamResponse()   [stream to client]
  → after(() => logRequest({...}))       [fire-and-forget after response sent]
      → calculateCost(tokens)            [from cost_rate_cards cache]
      → prisma.requestLog.create()       [writes to partitioned table]
      → prisma.dashboardEvent.create()   [on fallback: Realtime notification]
```

## Commits

| Hash | Task | Description |
|------|------|-------------|
| 5f86fd3 | Task 1 | Add provider registry, error helpers, and model router types |
| 1bf1bde | Task 2 | Add fallback chain router and request logger with after() pattern |
| 75ab9dc | Task 3 | Add POST /api/v1/chat streaming endpoint and GET /api/v1/models |

## Decisions Made

### 1. AI SDK 6 renamed maxTokens to maxOutputTokens

The `streamText()` call settings parameter changed from `maxTokens` to `maxOutputTokens` in AI SDK 6. The plan used `maxTokens` (the old name) — caught during type-check as TS2353. The `FallbackChainConfig` interface retains `maxTokens` (matches DB column name), but the `streamText()` call passes it as `maxOutputTokens`.

### 2. StreamTextResult.text is PromiseLike not Promise

`streamResult.text` is typed as `PromiseLike<string>`, which lacks `.catch()`. The plan's pattern `streamResult.text.catch(() => undefined)` fails to compile. Fixed with `Promise.resolve(streamResult.text).catch(() => undefined)`.

### 3. exactOptionalPropertyTypes — conditional spread pattern established

TypeScript's `exactOptionalPropertyTypes` (enabled by Next.js default tsconfig) makes `undefined` incompatible with `string | null` optional fields. All optional fields now use conditional spread: `...(value ? { key: value } : {})`. This pattern applies everywhere in the codebase.

### 4. Prisma optional fields require null not undefined

`prisma.requestLog.create()` optional fields (endpoint, errorCode, fallbackReason, etc.) are typed as `string | null`, not `string | undefined`. Using `?? null` coercion throughout `logRequest()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AI SDK 6 maxTokens renamed to maxOutputTokens**

- **Found during:** Task 2 type-check
- **Issue:** `streamText({ maxTokens: ... })` fails TS2353 — property no longer exists
- **Fix:** Changed to `maxOutputTokens` in streamText() call; kept `maxTokens` in FallbackChainConfig for DB field name compatibility
- **Files modified:** `src/lib/model-router/router.ts`
- **Commit:** 1bf1bde

**2. [Rule 1 - Bug] PromiseLike<string> has no .catch() method**

- **Found during:** Task 3 type-check
- **Issue:** `streamResult.text.catch(() => undefined)` fails TS2339 — PromiseLike lacks .catch()
- **Fix:** Wrapped with `Promise.resolve(streamResult.text).catch(() => undefined)`
- **Files modified:** `src/app/api/v1/chat/route.ts`
- **Commit:** 75ab9dc

**3. [Rule 2 - Missing Critical] exactOptionalPropertyTypes requires conditional spread**

- **Found during:** Task 2 and Task 3 type-check
- **Issue:** Passing `undefined` for optional fields in streamText(), Prisma create(), and logRequest() fails under exactOptionalPropertyTypes
- **Fix:** Conditional spread pattern for all optional fields; ?? null for Prisma fields
- **Files modified:** `router.ts`, `request-logger.ts`, `chat/route.ts`
- **Commits:** 1bf1bde, 75ab9dc

**4. [Rule 2 - Missing Critical] registry.languageModel() needs type assertion for dynamic modelId**

- **Found during:** Task 2 type-check
- **Issue:** registry.languageModel(modelId) expects union of known model ID strings; modelId from DB is plain string
- **Fix:** Type assertion as template literal union `` `openai:${string}` | `anthropic:${string}` | `google:${string}` ``
- **Files modified:** `src/lib/model-router/router.ts`
- **Commit:** 1bf1bde

## Interface Contracts for Future Plans

### POST /api/v1/chat

```json
{
  "endpoint": "summarization",
  "prompt": "Your text here",
  "systemPrompt": "Optional override",
  "sessionId": "optional-uuid"
}
```

Response: streaming via `toUIMessageStreamResponse()`. Phase 3 playground uses `useCompletion` hook.

### GET /api/v1/models

Returns:
```json
{
  "models": [{ "id": "openai:gpt-4o", "provider": "openai", "displayName": "GPT-4o", "pricing": {...} }],
  "endpoints": [{ "name": "chat", "primaryModel": "openai:gpt-4o", "fallbackChain": [...] }]
}
```

### streamWithFallback() for Phase 4

The `onFallback` callback parameter is the Phase 4 extension point for degradation stage tracking (queue → fallback → cache → 429). Do not simplify away this callback.

### registry for Phase 3 Playground

Phase 3 playground uses `registry.languageModel(modelId)` directly for user-selected models, bypassing the fallback chain.

## Next Phase Readiness

**Phase 2 Plan 02-03 (Dashboard UI) can proceed:**
- request_logs populated on every /api/v1/chat request
- dashboard_events populated on fallback events for Realtime
- Materialized views (hourly_cost_summary, hourly_latency_percentiles, daily_model_breakdown) will reflect data once requests are made

**Key handoff notes:**
- Import pattern: `import { streamWithFallback, loadEndpointConfig } from '@/lib/model-router/router'`
- Import pattern: `import { registry } from '@/lib/model-router/registry'`
- Import pattern: `import { logRequest } from '@/lib/logging/request-logger'`
- Fallback chain: `config.models` — index 0 is primary, rest are fallbacks
- Token properties: `usage.inputTokens`, `usage.outputTokens`, `usage.inputTokenDetails.cacheReadTokens`
