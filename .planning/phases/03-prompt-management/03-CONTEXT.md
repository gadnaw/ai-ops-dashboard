# Phase 3: Prompt Management + Playground — Context

*Auto-generated from project research and roadmap. Review and edit before planning.*

## Phase Boundary

**Goal:** Users can version, compare, and roll back prompt templates — and test them live with streaming responses. Completes the "prompt engineering workflow" loop: create version → test in playground → compare in dashboard → promote or roll back.

**Success Criteria:**
1. Named prompt versions with `{{variable}}` syntax stored as immutable snapshots with extracted variable names
2. Side-by-side character-level diff between any two versions; no version editable after creation
3. One-click rollback switches the active version immediately, visible in request timeline
4. Playground streams token-by-token with live counter; completed request appears in dashboard request log
5. No LLM API keys appear in client-side JavaScript or browser network requests

## Requirements In Scope

| REQ-ID | Requirement |
|--------|-------------|
| PROMPT-01 | Prompt version control with named versions, immutable snapshots, diff view, rollback |
| DX-01 | Request playground with streaming response, live token counter, model/prompt/parameter selection |

## What's NOT In Scope

- PROMPT-02 (A/B testing) — Phase 4. This phase builds versioning; Phase 4 builds traffic splitting.
- REL-01 (rate limiting) — Phase 4
- EVAL-01 (evaluation pipeline) — Phase 5
- ALERT-01 (webhook alerts) — Phase 5
- Batch evaluation, PII config UI, export — Deferred

## Technical Decisions

- **Prompt storage schema:**
  - `prompt_templates` table: `id`, `slug` (unique), `name`, `description`, `created_by`, `created_at`
  - `prompt_versions` table: `id`, `template_id`, `version` (auto-increment per template), `content`, `system_prompt`, `model_config` (JSONB), `variables` (JSONB — extracted `{{var}}` names), `created_by`, `created_at`
  - Active version pointer: `active_version_id` on `prompt_templates`
- **Template variable parsing:** Simple `{{var}}` regex — extract variable names on save, store in `variables` JSONB column
- **Diff library:** Character-level diff (e.g., `diff` or `jsdiff` library)
- **Streaming:** Vercel AI SDK `useCompletion` hook for single-turn playground streaming with `onFinish` callback; live token estimation via `gpt-tokenizer`
- **Playground requests** go through the same `/api/v1/chat` pipeline as production requests — logged identically

## Key Risks

- **Pitfall 6 (Streaming format inconsistency):** Vercel AI SDK `streamText()` normalizes across providers automatically. No custom SSE parsers.
- **Pitfall 5 (Server/client boundary):** Prompt list and version history as Server Components. Diff view, editor, and playground are Client Islands.

## Dependencies

- Phase 2 must be complete (model router, request logging pipeline, dashboard)

## Claude's Discretion

- Diff library choice (jsdiff, diff-match-patch, etc.)
- Playground UI layout (split pane, sidebar, etc.)
- Prompt template editor component (CodeMirror, Monaco, or simple textarea)
- Whether to add "Save as test case" button in playground (mentioned in requirements but low priority)
- Version naming convention (auto-increment integer vs user-provided tag)
