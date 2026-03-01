---
phase: 3
plan: "03-02"
subsystem: prompt-ui
tags: [codemirror, diff, useOptimistic, server-components, next15-async-params]
requires: ["03-01"]
provides: ["prompt-management-ui", "diff-viewer", "version-list-rollback"]
affects: ["03-03"]
tech-stack:
  added: []
  patterns:
    - "dynamic import ssr:false for CodeMirror (browser-only library)"
    - "useOptimistic + startTransition for instant rollback feedback"
    - "Next.js 16 async params/searchParams pattern (Promise<{ slug }>)"
    - "Server Components fetch data; Client Islands own interactivity"
    - "ViewPlugin with RangeSetBuilder for CodeMirror decoration"
key-files:
  created:
    - src/components/prompts/CodeMirrorEditorInner.tsx
    - src/components/prompts/PromptEditor.tsx
    - src/components/prompts/DiffViewer.tsx
    - src/components/prompts/VersionList.tsx
    - src/components/prompts/NewPromptForm.tsx
    - src/components/prompts/NewVersionForm.tsx
    - src/app/(dashboard)/prompts/page.tsx
    - src/app/(dashboard)/prompts/new/page.tsx
    - src/app/(dashboard)/prompts/[slug]/page.tsx
    - src/app/(dashboard)/prompts/[slug]/new-version/page.tsx
    - src/app/(dashboard)/prompts/[slug]/diff/page.tsx
  modified:
    - src/lib/prompts/queries.ts
    - src/app/(dashboard)/dashboard/@requests/page.tsx
decisions:
  - "getTemplateWithVersionsBySlug added: pages use slug from URL params, not UUID id. Added alongside existing getTemplateWithVersions(id) to preserve backward compat."
  - "getTwoVersionsByIds added: diff page needs two specific versions by UUID (from ?v1=ID&v2=ID query params), not just the 2 most recent."
  - "getTemplates extended: added versions: { take: 1 } include to show latest version number on list page without separate query."
  - "exactOptionalPropertyTypes fix: CodeMirror onChange uses conditional spread {...(onChange ? { onChange } : {})} pattern — same as AI SDK streamText() pattern."
  - "useOptimistic rollback: setOptimisticActiveId called synchronously in startTransition; auto-reverts if rollbackToVersion throws."
  - "@requests/page.tsx prompt version filter: Server Component with URL-based filtering (GET form submit to /dashboard?promptVersionId=ID). No Zustand needed — page-level query param."
metrics:
  duration: "~25 minutes"
  completed: "2026-03-01"
---

# Phase 3 Plan 02: Prompt UI Summary

**One-liner:** Full prompt management UI — CodeMirror 6 editor with amber variable highlighting, jsdiff side-by-side diff, useOptimistic rollback, and 5 server-rendered routes under /prompts.

## What Was Built

### Client Island Components (6 files)

**CodeMirrorEditorInner.tsx** — The raw CodeMirror 6 editor. Browser-only. Contains all `@codemirror` imports which would cause SSR crashes if imported at module level. Features:
- Custom `ViewPlugin` with `RangeSetBuilder` decorating `{{variableName}}` patterns in amber (#f59e0b)
- `EditorView.baseTheme` applying `.cm-template-variable` CSS class
- `EditorView.editable.of(false)` extension for read-only mode
- `EditorView.lineWrapping` for multi-line prompts

**PromptEditor.tsx** — SSR-safe wrapper using `dynamic(() => import('./CodeMirrorEditorInner'), { ssr: false })`. Shows a loading placeholder div matching the editor height to prevent CLS. This is the public API for the editor.

**DiffViewer.tsx** — `diffChars` / `diffWords` from the `diff` npm package. Auto-selects word-level diff for content > 5KB (performance). Renders green spans for additions, red strikethrough for removals. Exports `DiffViewer` (inline) and `SideBySideDiff` (two-panel grid).

**VersionList.tsx** — `useOptimistic` + `startTransition` for rollback. When a user clicks Rollback, the UI immediately shows the selected version as ACTIVE before the `rollbackToVersion` Server Action responds. Auto-reverts on error. Shows variable badges, diff link vs active version, and creation date.

**NewPromptForm.tsx** — Template creation form. Auto-generates URL-safe slug from template name (replaces non-`[a-z0-9]` with hyphens). Uses `'error' in result` discriminated union narrowing on the Server Action response.

**NewVersionForm.tsx** — Version creation form. Wraps `PromptEditor` for the content field. Calls `extractVariables()` on every content change for live variable detection preview. Shows amber variable badges below the editor.

### Server Component Pages (5 routes)

| Route | Purpose |
|-------|---------|
| `/prompts` | Template list — name, slug, active version, latest version |
| `/prompts/new` | NewPromptForm wrapper — static page |
| `/prompts/[slug]` | Version history + VersionList Client Island |
| `/prompts/[slug]/new-version` | NewVersionForm wrapper with next-version-number hint |
| `/prompts/[slug]/diff` | SideBySideDiff — v1/v2 UUIDs from ?v1=ID&v2=ID query params |

All slug/diff pages use `async params: Promise<{ slug: string }>` pattern required by Next.js 16.

### Queries Extended (queries.ts)

Three additions beyond what 03-01 delivered:

1. `getTemplateWithVersionsBySlug(slug)` — pages need slug from URL params, not UUID
2. `getTwoVersionsByIds(v1Id, v2Id)` — diff page compares two specific versions by UUID
3. `getTemplates()` extended — includes `versions: { take: 1 }` for latest version number on list page

### Dashboard @requests Filter

`src/app/(dashboard)/dashboard/@requests/page.tsx` now accepts `searchParams: Promise<{ promptVersionId?: string }>` and renders a prompt version dropdown. The filter uses a native HTML GET form to navigate to `/dashboard?promptVersionId=ID`, keeping filtering as a URL state with no client-side JavaScript required. Templates are fetched alongside the chart data via `Promise.all`.

## Deviations from Plan

### Auto-fixed — Rule 1 (Bug/Discrepancy)

**1. getTemplateWithVersions signature mismatch**

- **Found during:** Task 2 implementation
- **Issue:** Plan instructed using `getTemplateWithVersions(params.slug)` but the function takes a UUID `id`, not a slug. Pages use slugs in URL params.
- **Fix:** Added `getTemplateWithVersionsBySlug(slug)` query function. All slug pages use this instead.
- **Files modified:** `src/lib/prompts/queries.ts`

**2. getTwoVersionsForDiff signature mismatch**

- **Found during:** Task 2 diff page
- **Issue:** Plan shows `getTwoVersionsForDiff(v1Id, v2Id)` returning `{ v1, v2 }` but the function takes a `templateId` and returns the 2 most recent versions, not two specific versions.
- **Fix:** Added `getTwoVersionsByIds(v1Id, v2Id)` that fetches two specific versions by their UUIDs — exactly what the diff page needs.
- **Files modified:** `src/lib/prompts/queries.ts`

**3. createPromptVersion signature mismatch**

- **Found during:** Task 1 NewVersionForm
- **Issue:** Plan shows `createPromptVersion(templateId, { content, systemPrompt })` but the function takes `CreateVersionInput` with `templateId` in the object.
- **Fix:** NewVersionForm calls `createPromptVersion({ templateId, content, ...systemPrompt })` matching the actual signature.
- **Files modified:** `src/components/prompts/NewVersionForm.tsx`

**4. exactOptionalPropertyTypes — onChange conditional spread**

- **Found during:** Task 1 type-check
- **Issue:** TypeScript strict mode (`exactOptionalPropertyTypes: true`) rejects passing `onChange={(fn) | undefined}` directly to CodeMirror props.
- **Fix:** Applied the conditional spread pattern `{...(onChange ? { onChange } : {})}` — same pattern as established in Decision from 02-02.
- **Files modified:** `src/components/prompts/CodeMirrorEditorInner.tsx`, `src/components/prompts/PromptEditor.tsx`

**5. diff package returns undefined in some type variants**

- **Found during:** Task 1 type-check on DiffViewer
- **Issue:** TypeScript inferred `diffChars` return as possibly `undefined`.
- **Fix:** Added `const changes = rawChanges ?? []` fallback.
- **Files modified:** `src/components/prompts/DiffViewer.tsx`

## Commits

| Hash | Message |
|------|---------|
| `02588cb` | feat(03-02): add PromptEditor (CodeMirror 6), DiffViewer (jsdiff), VersionList (useOptimistic), and version form components |
| `ca73379` | feat(03-02): add prompt management pages (list, detail, diff, new version forms) and prompt version filter |

## Next Phase Readiness

**03-03 Playground** can now link to `/prompts/[slug]` and use `promptVersionId` from query params in the chat interface. The `PromptEditor` component is reusable for the playground's prompt composition UI.

Key exports for 03-03:
- `import { PromptEditor } from '@/components/prompts/PromptEditor'` — CodeMirror editor, SSR-safe
- `import { extractVariables } from '@/lib/prompts/variables'` — variable detection
- `/playground?promptVersionId=UUID` — link from PromptTemplate detail page already wired
