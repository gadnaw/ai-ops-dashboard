---
phase: 3
plan: "03-03"
title: "Playground — Streaming UI, Token Counter, Model/Prompt Selectors"
subsystem: playground
status: complete
tags: [streaming, useCompletion, gpt-tokenizer, playground, ai-sdk-react]

requires:
  - "03-01 (prompt service: getVersion, /api/v1/chat with promptVersionId)"
  - "03-02 (PromptEditor component, /prompts/[slug] deep-link)"
  - "02-02 (model router, streamText, provider registry)"

provides:
  - "PlaygroundUI: /playground?promptVersionId= route with streaming response panel"
  - "StreamingPlayground: useCompletion-based streaming via /api/v1/chat"
  - "TokenCounter: live gpt-tokenizer count during streaming"
  - "Production pipeline proof: playground requests logged to request_logs with prompt_version_id"

affects:
  - "04-x: Phase 4 A/B testing may extend PlaygroundForm body with experimentId/variantId"
  - "chat route: switched to toTextStreamResponse() — any future useChat consumer must handle text stream"

tech-stack:
  added:
    - "@ai-sdk/react 3.0.107 — provides useCompletion hook (not in main ai package in v6)"
  patterns:
    - "Server Component as Client Island shell — fetch data server-side, pass as props"
    - "useMemo for derived token count — avoids setState-in-effect lint error"
    - "exactOptionalPropertyTypes — string | undefined for optional props"
    - "streamProtocol: text + toTextStreamResponse() — matched pair for playground streaming"

key-files:
  created:
    - "src/components/playground/TokenCounter.tsx"
    - "src/components/playground/ModelSelector.tsx"
    - "src/components/playground/PromptVersionPicker.tsx"
    - "src/components/playground/PlaygroundForm.tsx"
    - "src/app/(dashboard)/playground/page.tsx"
  modified:
    - "src/components/layout/nav.tsx (added Prompts + Playground links via next/link)"
    - "src/app/api/v1/chat/route.ts (toUIMessageStreamResponse → toTextStreamResponse)"

decisions:
  - id: "stream-format"
    choice: "toTextStreamResponse() + streamProtocol: text"
    rationale: "useCompletion with streamProtocol: data expects data stream chunks as JSON, which renders garbled output in the playground response panel. Switching both the server route and client hook to text stream protocol gives clean plain-text streaming."
    alternatives: ["Keep toUIMessageStreamResponse() and use streamProtocol: data (data stream protocol needs careful parsing on client side)"]

  - id: "ai-sdk-react-install"
    choice: "Install @ai-sdk/react 3.0.107"
    rationale: "In AI SDK 6, useCompletion is NOT exported from the main 'ai' package. The plan referenced 'ai/react' which doesn't exist. @ai-sdk/react is the correct package for React hooks including useCompletion."
    alternatives: ["Build custom hook using callCompletionApi from 'ai' (more complex, less maintained)"]

  - id: "token-counter-usememo"
    choice: "useMemo instead of useEffect + setState for token counting"
    rationale: "ESLint rule react-hooks/set-state-in-effect prevents calling setState synchronously inside useEffect. useMemo is more idiomatic — token count is derived state that should be computed synchronously during render."
    alternatives: ["useEffect + setTimeout (deferred setState, more complex, worse UX)"]

metrics:
  duration: "~45 minutes"
  completed: "2026-03-01"
  tasks: "2/2"
  commits: 2
---

# Phase 3 Plan 03-03: Playground Summary

**One-liner:** Streaming playground with gpt-tokenizer live count, @ai-sdk/react useCompletion, and toTextStreamResponse() for production-pipeline-logging at /playground.

## What Was Built

### 4 Client Island Components

**TokenCounter** (`src/components/playground/TokenCounter.tsx`)
- Pure `useMemo`-based token count (no useEffect) — avoids ESLint react-hooks/set-state-in-effect
- Uses `countTokens` from `gpt-tokenizer` (o200k_base / GPT-4o tokenizer)
- Shows `~N tokens` during streaming (tilde = client-side estimate), removes tilde after completion
- Accurate for OpenAI; ~10-15% off for Anthropic/Google (different tokenizers)
- Fallback: `Math.ceil(length / 4)` if `countTokens` throws on unusual Unicode

**ModelSelector** (`src/components/playground/ModelSelector.tsx`)
- `<optgroup>` layout by provider: OpenAI / Anthropic / Google
- Models: gpt-4o, gpt-4o-mini, claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, gemini-2.5-flash, gemini-2.0-flash
- Exports `ModelId` type (const assertion union from AVAILABLE_MODELS)

**PromptVersionPicker** (`src/components/playground/PromptVersionPicker.tsx`)
- Template dropdown (all templates) + version dropdown (versions for selected template)
- Auto-selects `activeVersionId` when template changes
- Shows variable count indicator: `{{var1}}, {{var2}}` in amber text
- Accepts `initialVersionId` (from `?promptVersionId=` URL param) for deep-link pre-selection

**PlaygroundForm** (`src/components/playground/PlaygroundForm.tsx`)
- Main Client Island — `useCompletion` from `@ai-sdk/react`
- Left panel: ModelSelector, PromptVersionPicker, variable input fields, PromptEditor (readOnly), temperature/maxTokens sliders, Run/Stop button, TokenCounter
- Right panel: streaming output with cursor animation, completion metadata (model, version, logging note)
- Uses `interpolateVariables()` to fill `{{var}}` before POSTing
- Handles abort via `stop()` from useCompletion
- `streamProtocol: 'text'` — matched to `toTextStreamResponse()` on server

### Playground Page

**`src/app/(dashboard)/playground/page.tsx`** — Server Component
- `export const dynamic = 'force-dynamic'`
- `searchParams: Promise<{...}>` — awaited (Next.js 16 pattern)
- Fetches full templates + all versions via direct Prisma query (not `getTemplates()` which only includes latest version)
- Passes `initialVersionId` via conditional spread (exactOptionalPropertyTypes compliance)

### Navigation Update

**`src/components/layout/nav.tsx`** — added Prompts and Playground links
- Both use `<Link>` from `next/link` (not `<a>`) per @next/next/no-html-link-for-pages ESLint rule

## Stream Format Decision

**Which protocol:** `toTextStreamResponse()` + `streamProtocol: 'text'`

**Why text stream, not data stream:**
The `/api/v1/chat` route originally used `toUIMessageStreamResponse()` (data stream format). When `useCompletion` receives a data stream without `streamProtocol: 'data'` properly parsed, the response panel shows raw JSON chunks like `0:"Hello"\n0:" world"\n`. Switching both ends to text stream gives clean, readable streaming output in the playground panel.

**Impact:** Any future consumer of `/api/v1/chat` must use `streamProtocol: 'text'` or the server route must be reverted to `toUIMessageStreamResponse()`. Phase 4 A/B testing should note this.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] useCompletion not in 'ai/react' (AI SDK 6)**

- **Found during:** Task 1 — TypeScript error: Cannot find module 'ai/react'
- **Issue:** Plan referenced `import { useCompletion } from 'ai/react'` which doesn't exist in AI SDK 6. The `ai` package has `UseCompletionOptions` type but NOT the `useCompletion` hook itself.
- **Fix:** Installed `@ai-sdk/react 3.0.107` and updated import to `@ai-sdk/react`
- **Files modified:** `src/components/playground/PlaygroundForm.tsx`, `package.json`, `pnpm-lock.yaml`
- **Commit:** 5b6d38e

**2. [Rule 1 - Bug] setState-in-effect ESLint error in TokenCounter**

- **Found during:** Task 1 — ESLint error: `react-hooks/set-state-in-effect`
- **Issue:** Original `TokenCounter` used `useEffect` + `setTokenCount(0)` synchronously — ESLint blocks this pattern
- **Fix:** Replaced with `useMemo` — token count is derived state, computed during render
- **Files modified:** `src/components/playground/TokenCounter.tsx`
- **Commit:** 5b6d38e

**3. [Rule 1 - Bug] `<a>` href instead of Next.js Link**

- **Found during:** Task 2 — ESLint error: `@next/next/no-html-link-for-pages`
- **Issue:** Plan used `<a href="/prompts">` in playground page and nav — Next.js ESLint rule requires `<Link>` for internal routes
- **Fix:** Updated both playground page and nav.tsx to use `<Link>` from `next/link`
- **Files modified:** `src/app/(dashboard)/playground/page.tsx`, `src/components/layout/nav.tsx`
- **Commit:** ab243cc

**4. [Rule 2 - Missing Critical] Stream format mismatch**

- **Found during:** Task 2 analysis — `toUIMessageStreamResponse()` vs `streamProtocol: 'text'`
- **Issue:** Plan set `streamProtocol: 'text'` in PlaygroundForm but the route used `toUIMessageStreamResponse()` (data stream). This mismatch would produce garbled output.
- **Fix:** Updated `/api/v1/chat` to use `toTextStreamResponse()` to match client's `streamProtocol: 'text'`
- **Files modified:** `src/app/api/v1/chat/route.ts`
- **Commit:** ab243cc

## Production Pipeline Proof

The playground sends POST to `/api/v1/chat` with `{ prompt, promptVersionId, modelId, modelConfig }`. The route's `after()` callback logs the request to `request_logs` with `promptVersionId` set. After a playground run completes, the request appears in the dashboard within ~5 seconds.

Request log row includes:
- `prompt_version_id` — the UUID of the selected version
- `used_model` — the model chosen in the playground
- `input_tokens`, `output_tokens` — from AI SDK usage (authoritative)
- `duration_ms`, `status`, `endpoint_name: 'chat'`

## Next Phase Readiness

Phase 4 A/B testing framework may extend `PlaygroundForm`'s POST body with `experimentId` and `variantId`. The `body` parameter in `complete()` is already extensible — no structural changes needed.

Note: `/api/v1/chat` now returns `toTextStreamResponse()`. Phase 4 consumers of this route must use `streamProtocol: 'text'` or the route must be updated.

## Commits

| Commit | Description |
|--------|-------------|
| 5b6d38e | feat(03-03): add playground Client Islands — PlaygroundForm, TokenCounter, ModelSelector, PromptVersionPicker |
| ab243cc | feat(03-03): add playground page with streaming, token counter, and production pipeline logging |
