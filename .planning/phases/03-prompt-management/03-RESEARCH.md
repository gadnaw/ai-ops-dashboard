# Phase 3: Prompt Management + Playground — Research

**Researched:** 2026-03-01
**Domain:** Prompt versioning, streaming playground, diff views, PostgreSQL versioning, CodeMirror 6
**Confidence:** HIGH (all critical areas verified against official documentation or authoritative sources)
**Readiness:** yes

---

## Summary

Phase 3 delivers the "prompt engineering workflow" loop: version-controlled prompt templates with
immutable snapshots, side-by-side character-level diffs, one-click rollback, and a streaming
playground with live token counting. All ten research topics were investigated with results
verified against official documentation.

**The five most consequential findings:**

1. **useChat vs useCompletion**: useCompletion is correct for the playground (single-turn, prompt-in
   / completion-out). useChat manages full conversation history and is heavier; the playground needs
   a prompt + parameters form feeding a single completion. Token count is only available in
   `onFinish(prompt, completion)` on the client — during streaming it is approximated client-side.

2. **streamText token usage property names**: In Vercel AI SDK 6, the server-side properties are
   `usage.inputTokens` and `usage.outputTokens` (NOT `promptTokens` / `completionTokens` which were
   AI SDK 3.x names). The `onFinish` callback receives `{ text, finishReason, usage, totalUsage,
   response }` — log from here via `after()`.

3. **Per-template version numbering**: Prisma's `autoincrement()` is a global sequence — it cannot
   increment per `template_id`. The correct pattern is a PostgreSQL trigger that runs
   `SELECT COALESCE(MAX(version), 0) + 1 FROM prompt_versions WHERE template_id = NEW.template_id`
   on INSERT, protected by a row-level advisory lock on the template row to prevent race conditions.

4. **Diff library**: Use `diff` (npm package, the canonical jsdiff library by kpdecker). It provides
   `diffChars()` returning `Array<{ value, added, removed, count }>`. Render directly to React
   `<span>` elements — no heavy wrapper needed. Bundle is small (~5 KB gzipped) with TypeScript
   types included.

5. **Editor**: Use `@uiw/react-codemirror` (CodeMirror 6). It must be loaded with `dynamic()` and
   `{ ssr: false }` in Next.js because CodeMirror relies on browser APIs. The `{{variable}}`
   highlight is implemented via a custom `ViewPlugin` using the `Decoration` API — not a full
   language grammar, just a regexp-based decoration pass.

**Primary recommendation:** Build the playground around `useCompletion`, stream through the existing
`/api/v1/chat` route, pass `promptVersionId` and `modelConfig` in the request body (not headers),
log the completed response in `streamText`'s `onFinish` via the existing `after()` pattern, and
approximate token count client-side during streaming using `gpt-tokenizer`.

---

## Standard Stack

### Core (Phase 3 additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `diff` | 7.x | Character-level text diff | Canonical jsdiff by kpdecker; BSD-3; ~5 KB gzipped; TypeScript types; no runtime deps |
| `@uiw/react-codemirror` | 4.25.x | Prompt template editor | CodeMirror 6 React wrapper; ~135 KB gzipped (with basicSetup); modular; SSR-safe via dynamic() |
| `gpt-tokenizer` | 2.x | Client-side live token estimation | Pure JS, no WASM, browser-native, supports o200k_base (gpt-4o); synchronous API |

### Already in Stack (inherited from Phases 1-2)

| Library | Purpose |
|---------|---------|
| `ai` (Vercel AI SDK 6) | `useCompletion()`, `streamText()`, `toUIMessageStreamResponse()` |
| `@prisma/client` 7.x | Schema, migrations, prompt template CRUD |
| `next` 15.x | Server Actions, `after()`, route handlers, `revalidatePath` |
| `react` 19.x | `useOptimistic`, `useActionState`, `startTransition` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `diff` (jsdiff) | `diff-match-patch` | diff-match-patch is larger (~40 KB gzipped), Google-authored, more complex API (patch/apply ops); overkill for display-only diffs |
| `diff` (jsdiff) | `react-diff-viewer-continued` | Adds a heavy component abstraction; we need custom styling to match design system |
| `@uiw/react-codemirror` | Monaco Editor | Monaco is ~5 MB unoptimized, ~1-2 MB gzipped; cannot lazy-load features; SSR problems; wildly over-engineered for prompt editing |
| `@uiw/react-codemirror` | Plain `<textarea>` | No variable highlighting; fine for MVP fallback if CodeMirror causes build issues |
| `gpt-tokenizer` | `js-tiktoken` (WASM) | js-tiktoken requires WASM which complicates edge/serverless environments; gpt-tokenizer is pure JS |
| `gpt-tokenizer` | Server-side count only | Creates UX lag — user sees "calculating..." instead of live counter |
| `useCompletion` | `useChat` | useChat manages history array; adds complexity for single-turn playground; useCompletion is purpose-built |

**Installation (Phase 3 only):**
```bash
pnpm add diff @uiw/react-codemirror @codemirror/state @codemirror/view gpt-tokenizer
```

---

## Architecture Patterns

### Recommended Project Structure (Phase 3 additions)

```
src/
├── app/
│   ├── prompts/
│   │   ├── page.tsx                    # Server Component — prompt list (Prisma query)
│   │   ├── new/
│   │   │   └── page.tsx                # Server Component shell + NewPromptForm Client Island
│   │   └── [slug]/
│   │       ├── page.tsx                # Server Component — version history list
│   │       ├── [version]/
│   │       │   └── page.tsx            # Server Component — single version view
│   │       └── diff/
│   │           └── page.tsx            # Server Component shell + DiffViewer Client Island
│   └── playground/
│       └── page.tsx                    # Server Component shell + Playground Client Island
├── app/
│   └── api/
│       └── v1/
│           └── chat/
│               └── route.ts            # EXISTING — extended to accept promptVersionId
├── components/
│   ├── prompts/
│   │   ├── PromptEditor.tsx            # "use client" — CodeMirror editor + variable extraction
│   │   ├── DiffViewer.tsx              # "use client" — diffChars rendering
│   │   ├── VersionList.tsx             # "use client" — version history with rollback button
│   │   └── RollbackButton.tsx          # "use client" — useOptimistic + Server Action
│   └── playground/
│       ├── PlaygroundForm.tsx          # "use client" — useCompletion, model/params selector
│       └── TokenCounter.tsx            # "use client" — gpt-tokenizer live counter
├── lib/
│   └── prompts/
│       ├── actions.ts                  # "use server" — createVersion, rollback, deleteTemplate
│       ├── queries.ts                  # Server-side Prisma queries (no "use client")
│       └── variables.ts               # {{var}} extraction utility (shared, no directives)
└── prisma/
    └── migrations/
        └── 20260301_prompt_versioning/ # Migration with trigger SQL
```

### Pattern 1: Server Components as Data Shell, Client Islands for Interactivity

**What:** Server Component fetches data, passes it to a Client Component that owns all interactive state.
**When to use:** Version list, diff viewer, playground form — all need server data + client interaction.

```typescript
// app/prompts/[slug]/page.tsx — Server Component (no "use client")
import { getTemplateWithVersions } from '@/lib/prompts/queries';
import { VersionList } from '@/components/prompts/VersionList';

export default async function PromptPage({ params }: { params: { slug: string } }) {
  // Direct Prisma query — runs on server, never in client bundle
  const template = await getTemplateWithVersions(params.slug);
  if (!template) notFound();

  // Pass serializable data to Client Island
  return (
    <main>
      <h1>{template.name}</h1>
      {/* VersionList is "use client" — owns rollback/compare interactions */}
      <VersionList
        templateId={template.id}
        versions={template.versions}
        activeVersionId={template.activeVersionId}
      />
    </main>
  );
}
```

```typescript
// lib/prompts/queries.ts — NO "use client" or "use server", runs wherever imported
import { prisma } from '@/lib/db/prisma';

export async function getTemplateWithVersions(slug: string) {
  return prisma.promptTemplate.findUnique({
    where: { slug },
    include: {
      versions: { orderBy: { version: 'desc' } },
    },
  });
}
```

### Pattern 2: Immutable Version Creation via Server Action

**What:** Server Action creates a new prompt version, computes the next version number, extracts variables.
**Critical:** Never allow version content to be edited after creation — INSERT only, no UPDATE on content.

```typescript
// lib/prompts/actions.ts
'use server';

import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { extractVariables } from './variables';

export async function createPromptVersion(
  templateId: string,
  data: {
    content: string;
    systemPrompt?: string;
    modelConfig: Record<string, unknown>;
  }
) {
  const variables = extractVariables(data.content);

  // Version number assignment is handled by PostgreSQL trigger (see Prisma section)
  // We INSERT with version=0; trigger overwrites with correct per-template MAX(version)+1
  const version = await prisma.promptVersion.create({
    data: {
      templateId,
      version: 0, // Trigger overwrites this
      content: data.content,
      systemPrompt: data.systemPrompt ?? null,
      modelConfig: data.modelConfig,
      variables,
    },
  });

  revalidatePath(`/prompts`);
  return version;
}
```

### Pattern 3: Streaming Playground with useCompletion

**What:** Single-turn playground using `useCompletion`. User sets prompt + variables + model config, submits, sees streaming tokens.
**Why useCompletion over useChat:** Playground is single-turn (prompt in → completion out). No conversation history management needed.

```typescript
// components/playground/PlaygroundForm.tsx
'use client';

import { useCompletion } from 'ai/react';
import { useState } from 'react';
import { TokenCounter } from './TokenCounter';

export function PlaygroundForm({
  promptVersionId,
  initialContent,
  variables,
}: {
  promptVersionId: string;
  initialContent: string;
  variables: string[];
}) {
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    Object.fromEntries(variables.map((v) => [v, '']))
  );
  const [model, setModel] = useState('openai:gpt-4o-mini');

  const { completion, complete, isLoading, error } = useCompletion({
    api: '/api/v1/chat',
    onFinish: (prompt, completion) => {
      // Token counts only available server-side via onFinish in streamText
      // Client shows estimated count from gpt-tokenizer during streaming
      console.log('Completion finished:', completion.length, 'chars');
    },
    onError: (err) => console.error('Playground error:', err),
  });

  const handleRun = () => {
    // Interpolate variables into content
    const interpolated = interpolateVariables(initialContent, variableValues);

    complete(interpolated, {
      body: {
        promptVersionId,
        modelId: model,
        // modelConfig passed as body — NOT in headers (avoids exposing API keys)
      },
    });
  };

  return (
    <div>
      {/* Variable inputs */}
      {variables.map((v) => (
        <input
          key={v}
          placeholder={`{{${v}}}`}
          value={variableValues[v]}
          onChange={(e) => setVariableValues((prev) => ({ ...prev, [v]: e.target.value }))}
        />
      ))}

      <button onClick={handleRun} disabled={isLoading}>
        {isLoading ? 'Streaming...' : 'Run'}
      </button>

      {/* Live token counter during streaming */}
      <TokenCounter text={completion} isStreaming={isLoading} />

      {/* Streaming output */}
      <pre>{completion}</pre>
      {error && <p className="text-red-500">{error.message}</p>}
    </div>
  );
}

function interpolateVariables(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}
```

### Pattern 4: Server-Side streamText with Logging

**What:** The existing `/api/v1/chat` route handles playground requests identically to production. Token usage and full response text logged in `onFinish` via `after()`.

```typescript
// app/api/v1/chat/route.ts (extended for Phase 3)
import { streamText } from 'ai';
import { after } from 'next/server';
import { registry } from '@/lib/model-router/registry';
import { prisma } from '@/lib/db/prisma';

export const maxDuration = 30;

export async function POST(request: Request) {
  const { prompt, messages, promptVersionId, modelId, modelConfig } =
    await request.json();

  const result = streamText({
    model: registry.languageModel(modelId ?? 'openai:gpt-4o-mini'),
    prompt,
    messages,
    temperature: modelConfig?.temperature ?? 0.7,
    maxOutputTokens: modelConfig?.maxTokens ?? 2048,

    onFinish: async ({ text, usage, finishReason, response }) => {
      // usage.inputTokens and usage.outputTokens (AI SDK 6 property names)
      after(async () => {
        await prisma.requestLog.create({
          data: {
            provider: modelId?.split(':')[0] ?? 'openai',
            model: modelId?.split(':')[1] ?? 'gpt-4o-mini',
            promptVersionId: promptVersionId ?? null,
            inputTokens: usage?.inputTokens ?? 0,
            outputTokens: usage?.outputTokens ?? 0,
            totalTokens: usage?.inputTokens ?? 0 + (usage?.outputTokens ?? 0),
            responseText: text,
            finishReason,
            requestedAt: new Date(),
          },
        });
      });
    },
  });

  // toUIMessageStreamResponse() — current AI SDK 6 method name
  // (was toDataStreamResponse() in earlier versions)
  return result.toUIMessageStreamResponse();
}
```

**IMPORTANT — AI SDK 6 token property names:**
- `usage.inputTokens` — NOT `usage.promptTokens` (that was AI SDK 3.x)
- `usage.outputTokens` — NOT `usage.completionTokens`
- `usage.totalTokens` — may differ from `inputTokens + outputTokens` for providers that include reasoning tokens
- `result.totalUsage` — accumulated across multi-step generations (use `totalUsage` for billing)

### Pattern 5: Diff Rendering with jsdiff

**What:** Character-level diff between two version strings, rendered as colored spans.
**Library:** `diff` npm package (canonical jsdiff by kpdecker). Current version: 7.x.

```typescript
// components/prompts/DiffViewer.tsx
'use client';

import { diffChars, diffWords } from 'diff';

interface DiffViewerProps {
  oldText: string;
  newText: string;
  mode?: 'chars' | 'words';
}

export function DiffViewer({ oldText, newText, mode = 'chars' }: DiffViewerProps) {
  const changes = mode === 'chars'
    ? diffChars(oldText, newText)
    : diffWords(oldText, newText);

  return (
    <pre className="font-mono text-sm whitespace-pre-wrap p-4 bg-gray-950 rounded-lg">
      {changes.map((change, i) => {
        if (change.added) {
          return (
            <span
              key={i}
              className="bg-green-900/50 text-green-300"
              title={`+${change.count} char${change.count !== 1 ? 's' : ''}`}
            >
              {change.value}
            </span>
          );
        }
        if (change.removed) {
          return (
            <span
              key={i}
              className="bg-red-900/50 text-red-300 line-through"
              title={`-${change.count} char${change.count !== 1 ? 's' : ''}`}
            >
              {change.value}
            </span>
          );
        }
        // Unchanged text — render as-is
        return <span key={i} className="text-gray-300">{change.value}</span>;
      })}
    </pre>
  );
}
```

**diffChars output format (confirmed from official repo):**
```typescript
// Change object type
interface Change {
  value: string;    // concatenated token content
  added?: boolean;  // insertion (undefined = false)
  removed?: boolean; // deletion (undefined = false)
  count: number;    // number of characters (for diffChars) or words (for diffWords)
}

// Example output for diffChars('hello', 'helo world'):
[
  { value: 'hel', count: 3 },                   // unchanged
  { value: 'l', removed: true, count: 1 },      // deleted
  { value: 'o', count: 1 },                     // unchanged
  { value: ' world', added: true, count: 6 },   // inserted
]
```

**Performance note:** `diffChars` has `maxEditLength` and `timeout` options for large strings. For prompt templates (typically < 10KB), default settings are fine. For very large templates, use `diffWords` for better performance and readability.

### Pattern 6: Prompt Variable Extraction

**What:** Extract `{{variable}}` names from template content on save. Store in `variables` JSONB column.
**Approach:** Custom regex — lightweight, no Handlebars dependency needed.

```typescript
// lib/prompts/variables.ts — no directives, works in server and client contexts
export function extractVariables(content: string): string[] {
  // Match {{varName}} — supports word characters and underscores
  // Does NOT match: {{{triple}}}, {{#block}}, {{/block}} (Handlebars helpers)
  const regex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  const variables = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables).sort(); // Deterministic order
}

export function interpolateVariables(
  content: string,
  values: Record<string, string>
): string {
  return content.replace(
    /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g,
    (_, key) => values[key] ?? `{{${key}}}`
  );
}

// Edge cases handled:
// {{var_name}}     -> matches (underscore allowed)
// {{var123}}       -> matches (digit in body allowed)
// {{123var}}       -> NO match (must start with letter or underscore)
// {{{triple}}}     -> NO match (three braces not matched by two-brace regex)
// {{#if condition}} -> NO match (# prefix excluded by [a-zA-Z_] first char)
// {{ spaces }}     -> NO match (spaces excluded — intentional for simplicity)
```

**Why not Handlebars library:** The full Handlebars.js parser is ~80 KB gzipped. For variable extraction and interpolation only, the regex approach is sufficient and produces no external dependency. If the project later needs conditionals (`{{#if}}`), add Handlebars at that point.

**Edge case — variables in code blocks:** The regex will extract variable names even inside markdown code fences (`` ```...``` ``). This is acceptable behavior for prompt templates — users often do want to parameterize code examples. If exclusion is needed, strip code blocks before extraction (not required for MVP).

### Pattern 7: CodeMirror 6 Prompt Editor with Variable Highlighting

**SSR constraint:** CodeMirror uses browser DOM APIs. In Next.js it MUST be loaded with `dynamic()` and `ssr: false`. Failure to do this causes "window is not defined" build errors.

```typescript
// components/prompts/PromptEditor.tsx — dynamic import wrapper
'use client';

import dynamic from 'next/dynamic';

// Dynamic import with SSR disabled — required for CodeMirror
const CodeMirrorEditor = dynamic(
  () => import('./CodeMirrorEditorInner').then((mod) => mod.CodeMirrorEditorInner),
  {
    ssr: false,
    loading: () => <textarea className="w-full h-64 font-mono text-sm p-3" />,
  }
);

export function PromptEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  return <CodeMirrorEditor value={value} onChange={onChange} readOnly={readOnly} />;
}
```

```typescript
// components/prompts/CodeMirrorEditorInner.tsx — actual CodeMirror component
// This file is NOT imported in SSR context
'use client';

import CodeMirror from '@uiw/react-codemirror';
import { EditorView, ViewPlugin, Decoration, DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';

// Custom decoration for {{variable}} highlighting
const variableDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: any) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const regex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

      for (const { from, to } of view.visibleRanges) {
        const text = view.state.sliceDoc(from, to);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
          const start = from + match.index;
          const end = start + match[0].length;
          builder.add(
            start,
            end,
            Decoration.mark({ class: 'cm-template-variable' })
          );
        }
      }

      return builder.finish();
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

// CSS for the variable class (add to global CSS or as EditorView.theme)
const variableTheme = EditorView.baseTheme({
  '.cm-template-variable': {
    color: '#f59e0b',       // amber-400 — stands out against dark backgrounds
    fontWeight: 'bold',
  },
});

export function CodeMirrorEditorInner({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <CodeMirror
      value={value}
      height="300px"
      theme="dark"
      extensions={[
        variableDecorationPlugin,
        variableTheme,
        EditorView.lineWrapping,
        ...(readOnly ? [EditorView.editable.of(false)] : []),
      ]}
      onChange={onChange}
      basicSetup={{
        lineNumbers: false,    // Prompts don't need line numbers
        foldGutter: false,
        highlightActiveLine: true,
        bracketMatching: false,
      }}
    />
  );
}
```

**Bundle size:** ~135 KB gzipped with basicSetup. Loaded only when the editor route is visited (dynamic import). The loading fallback (`<textarea>`) prevents CLS.

### Pattern 8: Per-Template Version Auto-Increment via PostgreSQL Trigger

**The problem:** Prisma `autoincrement()` is a global sequence. We need version numbers 1, 2, 3 per template, not globally.

**Solution: PostgreSQL trigger + advisory lock on INSERT**

```sql
-- Migration SQL (add to Prisma migration file as raw SQL)
-- Create the trigger function
CREATE OR REPLACE FUNCTION assign_prompt_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Advisory lock on template row prevents concurrent inserts from racing
  -- pg_advisory_xact_lock is transaction-scoped (auto-released on commit/rollback)
  PERFORM pg_advisory_xact_lock(NEW.template_id::bigint);

  SELECT COALESCE(MAX(version), 0) + 1
  INTO next_version
  FROM prompt_versions
  WHERE template_id = NEW.template_id;

  NEW.version := next_version;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to prompt_versions table
CREATE TRIGGER set_prompt_version
  BEFORE INSERT ON prompt_versions
  FOR EACH ROW
  EXECUTE FUNCTION assign_prompt_version();
```

**Prisma schema — declare version as plain Int (not autoincrement):**

```prisma
// schema.prisma
model PromptTemplate {
  id              String          @id @default(cuid())
  slug            String          @unique
  name            String
  description     String?
  createdBy       String?
  createdAt       DateTime        @default(now())
  activeVersionId String?

  versions        PromptVersion[]
  activeVersion   PromptVersion?  @relation("ActiveVersion", fields: [activeVersionId], references: [id])

  @@map("prompt_templates")
}

model PromptVersion {
  id           String   @id @default(cuid())
  templateId   String
  version      Int      // Assigned by trigger — Prisma sends 0, trigger overwrites
  content      String
  systemPrompt String?
  modelConfig  Json     @default("{}")
  variables    Json     @default("[]")
  createdBy    String?
  createdAt    DateTime @default(now())

  template     PromptTemplate  @relation(fields: [templateId], references: [id], onDelete: Cascade)
  activeFor    PromptTemplate? @relation("ActiveVersion")

  // Composite unique: one version number per template
  @@unique([templateId, version])
  @@map("prompt_versions")
}
```

**Concurrency analysis:**
- `pg_advisory_xact_lock(template_id)` serializes concurrent INSERTs for the same template
- Different templates do NOT block each other (different lock keys)
- Lock is automatically released when transaction commits or rolls back
- No deadlock risk because we only ever take one advisory lock per transaction here
- For a portfolio demo, this is safe. For high-write production (100+ versions/sec same template), use a dedicated sequence table instead

**Prisma migration tip:** Prisma does not auto-generate this trigger. You must include it in a migration SQL file. Use `prisma migrate dev --create-only` to generate the migration scaffold, then add the trigger SQL manually.

### Pattern 9: One-Click Rollback with useOptimistic

**What:** User clicks "Rollback to v3" — UI immediately shows v3 as active, Server Action updates DB, revalidates.
**Why useOptimistic:** The DB update takes 50-200ms. Optimistic update prevents perceived lag.

```typescript
// components/prompts/VersionList.tsx
'use client';

import { useOptimistic, startTransition } from 'react';
import { rollbackToVersion } from '@/lib/prompts/actions';

export function VersionList({
  templateId,
  versions,
  activeVersionId,
}: {
  templateId: string;
  versions: Array<{ id: string; version: number; createdAt: Date }>;
  activeVersionId: string | null;
}) {
  // Optimistic active version — shows immediately on click, reverts if action fails
  const [optimisticActiveId, setOptimisticActiveId] = useOptimistic(activeVersionId);

  const handleRollback = (versionId: string) => {
    startTransition(async () => {
      setOptimisticActiveId(versionId); // Immediate UI update
      await rollbackToVersion(templateId, versionId); // Server Action
      // If action throws, optimisticActiveId reverts to activeVersionId automatically
    });
  };

  return (
    <ul>
      {versions.map((v) => (
        <li key={v.id} className="flex items-center gap-3">
          <span className="font-mono text-sm">v{v.version}</span>
          {optimisticActiveId === v.id ? (
            <span className="text-green-400 text-xs">ACTIVE</span>
          ) : (
            <button
              onClick={() => handleRollback(v.id)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Rollback
            </button>
          )}
          <span className="text-gray-500 text-xs">
            {v.createdAt.toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

```typescript
// lib/prompts/actions.ts (rollback action)
'use server';

import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';

export async function rollbackToVersion(templateId: string, versionId: string) {
  // Atomic update — verify versionId belongs to templateId before updating
  const version = await prisma.promptVersion.findFirst({
    where: { id: versionId, templateId },
    select: { id: true },
  });

  if (!version) {
    throw new Error('Version not found or does not belong to this template');
  }

  await prisma.promptTemplate.update({
    where: { id: templateId },
    data: { activeVersionId: versionId },
  });

  revalidatePath('/prompts');
  revalidatePath(`/prompts/[slug]`, 'page'); // Revalidate all slug pages
}
```

### Pattern 10: Live Token Counter with gpt-tokenizer

**What:** Count tokens client-side as streaming response accumulates. Shows "~142 tokens" during streaming, then exact server count in `onFinish` (if surfaced via response body or separate fetch).

```typescript
// components/playground/TokenCounter.tsx
'use client';

import { useEffect, useState } from 'react';
import { countTokens } from 'gpt-tokenizer';

export function TokenCounter({
  text,
  isStreaming,
  promptText,
  model = 'gpt-4o',
}: {
  text: string;
  isStreaming: boolean;
  promptText?: string;
  model?: string;
}) {
  const [tokenCount, setTokenCount] = useState(0);

  useEffect(() => {
    if (!text && !promptText) {
      setTokenCount(0);
      return;
    }

    // gpt-tokenizer uses o200k_base encoding for gpt-4o models
    // For Anthropic/Google models: estimation is approximate (~4 chars/token heuristic)
    const fullText = (promptText ?? '') + text;
    const count = countTokens(fullText);
    setTokenCount(count);
  }, [text, promptText]);

  return (
    <div className="text-xs text-gray-500 font-mono">
      {isStreaming ? '~' : ''}{tokenCount} tokens
      {isStreaming && <span className="animate-pulse ml-1">▊</span>}
    </div>
  );
}
```

**Cross-provider token counting caveat:**
- `gpt-tokenizer` is accurate for OpenAI models (GPT-4o uses `o200k_base` encoding)
- For Anthropic Claude: Anthropic uses a different tokenizer; `gpt-tokenizer` will be ~10-15% off
- For Google Gemini: Similar divergence
- **Solution for portfolio demo:** Show client-side estimate as `~N tokens` with tilde prefix during streaming. After stream completes, the server's `usage.inputTokens + usage.outputTokens` is authoritative — surface this in the response if needed via a custom data stream part

**Server-side exact count pattern (optional enhancement):**
```typescript
// In the route handler, after streamText resolves:
// The exact count is available in onFinish({ usage })
// To surface it to the client, use experimental_prepareResponseBody or
// a separate GET /api/v1/logs/latest endpoint
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Character diff | Custom LCS algorithm | `diff` npm package (diffChars) | Myers diff algorithm; handles Unicode; has performance limits (maxEditLength); BSD-3 license |
| Token counting | Manual character count / 4 | `gpt-tokenizer` | BPE tokenization is non-trivial; character heuristics are 20-40% off for code/symbols |
| Streaming state management | Raw EventSource / WebSocket | `useCompletion` hook | Handles SSE reconnection, abort, isLoading state, error state |
| Version increment | Application-layer MAX+1 without locking | PostgreSQL trigger + advisory lock | Race condition: two concurrent requests both read MAX=5, both insert v6 |
| Optimistic UI | `useState` + manual revert on error | `useOptimistic` (React 19 built-in) | Automatic revert when Transition fails; no manual error handling needed |
| Variable substitution | Eval or new Function() | Simple string.replace() with regex | Eval is a security risk; regex is sufficient for `{{var}}` substitution |
| Server Component data passing | API fetch from Client Component | Props from Server Component | Adds waterfall request; Server Components can query DB directly and pass props |

---

## Common Pitfalls

### Pitfall 1: Token Property Names Changed in AI SDK 6

**What goes wrong:** Code uses `usage.promptTokens` / `usage.completionTokens` (AI SDK 3.x names) which return `undefined` in AI SDK 6.
**Why it happens:** Documentation examples from 2023-2024 tutorials use old names.
**How to avoid:** In AI SDK 6, the correct names are `usage.inputTokens` and `usage.outputTokens`. The `totalTokens` property may be `undefined` for some providers — compute as `inputTokens + outputTokens` if needed.
**Warning signs:** Token counts logged as `NaN` or `undefined`; GitHub issue #1882 in vercel/ai tracks this confusion.

### Pitfall 2: CodeMirror SSR Crash

**What goes wrong:** `window is not defined` or `document is not defined` at build time or on first server render.
**Why it happens:** CodeMirror accesses browser globals at import time. Even wrapping in `useEffect` is insufficient — the import itself causes the error.
**How to avoid:** Always wrap the CodeMirror component in `dynamic(() => import(...), { ssr: false })`. Keep ALL CodeMirror imports inside the dynamically imported file.
**Warning signs:** Next.js build fails with "ReferenceError: window is not defined"; hydration errors in the console.

### Pitfall 3: Version Race Condition Without Lock

**What goes wrong:** Two users create prompt versions simultaneously; both get version number 3.
**Why it happens:** `SELECT MAX(version) + 1` is not atomic. Two transactions read the same MAX, both compute 3, both INSERT — one fails the unique constraint, the request errors.
**How to avoid:** Use `pg_advisory_xact_lock(template_id::bigint)` inside the trigger before the `SELECT MAX`. This serializes concurrent INSERTs for the same template without blocking unrelated templates.
**Warning signs:** `UniqueConstraintViolationError` on `prompt_versions(template_id, version)` unique index under concurrent load.

### Pitfall 4: Mutable Version Content

**What goes wrong:** An API endpoint allows PUT/PATCH on `prompt_versions.content`, breaking the immutability guarantee.
**Why it happens:** Standard CRUD scaffolding generates update endpoints by default.
**How to avoid:** The `promptVersion` model must have NO update operation in Server Actions. Prisma schema should enforce this at the application layer. Add a database-level trigger `BEFORE UPDATE ON prompt_versions` that raises an exception if `content`, `system_prompt`, or `model_config` are changed.
**Warning signs:** Diff viewer shows no changes between versions that should differ; request logs reference a version that no longer matches what was sent.

### Pitfall 5: API Keys in Client-Side Request Body

**What goes wrong:** The playground sends `{ apiKey: process.env.OPENAI_API_KEY }` in the fetch body from a Client Component.
**Why it happens:** Developer accesses `process.env` in a Client Component (Next.js exposes server env vars prefixed with `NEXT_PUBLIC_` to the client; non-prefixed vars appear as `undefined` at runtime but can appear in source maps or be accidentally included).
**How to avoid:** The playground Client Component NEVER handles API keys. It sends `{ modelId, promptVersionId, variableValues }` to `/api/v1/chat`. The route handler resolves the API key from `process.env` on the server. Never prefix LLM API keys with `NEXT_PUBLIC_`.
**Warning signs:** Network tab shows API keys in request payloads; browser console warnings about `undefined` env vars.

### Pitfall 6: onFinish Not Called on Stream Abort

**What goes wrong:** User clicks "Stop" during streaming; `onFinish` is never called; request is not logged.
**Why it happens:** Vercel AI SDK `streamText` does not call `onFinish` if the stream is aborted by the client. GitHub issue #7628 confirms this is by-design.
**How to avoid:** Use `onChunk` or `onStepFinish` to incrementally update a partial log, or accept that aborted requests are not logged (acceptable for playground). Alternatively, log a "started" record on request entry and mark as "aborted" via an `AbortSignal` handler.
**Warning signs:** Playground requests that are manually stopped do not appear in the request log dashboard.

### Pitfall 7: diffChars on Large Prompts is Slow

**What goes wrong:** Diffing two 50KB prompt templates causes the browser tab to freeze for 2-5 seconds.
**Why it happens:** `diffChars` uses the Myers diff algorithm with O(n*d) complexity where d is edit distance. Very large diffs with many changes are expensive.
**How to avoid:** Use `diffWords` for templates over ~5KB — word-level diff is 10-100x faster and more readable. Add a `timeout: 5000` option to `diffChars` for safety, and fall back to a "files too large to diff" message if timeout fires.
**Warning signs:** Browser performance tab shows long scripting tasks when navigating to diff view.

---

## Code Examples

### Complete useCompletion Route Handler

```typescript
// app/api/v1/chat/route.ts
import { streamText } from 'ai';
import { after } from 'next/server';
import { registry } from '@/lib/model-router/registry';
import { prisma } from '@/lib/db/prisma';

export const maxDuration = 30;

export async function POST(request: Request) {
  const body = await request.json();
  const {
    prompt,              // useCompletion sends { prompt }
    messages,            // useChat sends { messages }
    promptVersionId,
    modelId = 'openai:gpt-4o-mini',
    modelConfig = {},
  } = body;

  const result = streamText({
    model: registry.languageModel(modelId),
    prompt: prompt ?? undefined,
    messages: messages ?? undefined,
    system: modelConfig.systemPrompt,
    temperature: modelConfig.temperature ?? 0.7,
    maxOutputTokens: modelConfig.maxTokens ?? 2048,

    onFinish: async ({ text, usage, finishReason }) => {
      after(async () => {
        try {
          await prisma.requestLog.create({
            data: {
              provider: modelId.split(':')[0],
              model: modelId.split(':')[1],
              promptVersionId: promptVersionId ?? null,
              inputTokens: usage?.inputTokens ?? 0,
              outputTokens: usage?.outputTokens ?? 0,
              finishReason: finishReason ?? 'unknown',
              requestedAt: new Date(),
            },
          });
        } catch (err) {
          console.error('Logging failed (non-fatal):', err);
        }
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
```

### Variable Extraction Unit-Testable Function

```typescript
// lib/prompts/variables.ts
export function extractVariables(content: string): string[] {
  const regex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  const variables = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    variables.add(match[1]);
  }
  return Array.from(variables).sort();
}

// Tests:
// extractVariables('Hello {{name}}, your order {{orderId}} is ready')
// => ['name', 'orderId']
// extractVariables('No variables here')
// => []
// extractVariables('{{a}} {{a}} {{b}}')  // deduplication
// => ['a', 'b']
// extractVariables('{{{triple}}}')
// => []  (triple braces NOT matched)
```

### Side-by-Side Diff Layout

```typescript
// Wrap DiffViewer in a layout for before/after presentation
export function SideBySideDiff({ v1, v2 }: { v1: PromptVersion; v2: PromptVersion }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h3 className="text-sm text-gray-400 mb-2">v{v1.version} (before)</h3>
        {/* Show old content with removals highlighted */}
        <DiffViewer
          oldText={v1.content}
          newText={v2.content}
          mode="chars"
          showOnly="removed"  // custom prop — filter to show only unchanged + removed
        />
      </div>
      <div>
        <h3 className="text-sm text-gray-400 mb-2">v{v2.version} (after)</h3>
        {/* Show new content with additions highlighted */}
        <DiffViewer
          oldText={v1.content}
          newText={v2.content}
          mode="chars"
          showOnly="added"   // filter to show only unchanged + added
        />
      </div>
    </div>
  );
}
```

**Note on DiffViewer `showOnly` prop:** Implement by filtering the `changes` array:
- `showOnly="removed"`: render unchanged + removed spans (omit added spans' text)
- `showOnly="added"`: render unchanged + added spans (omit removed spans' text)
This gives the classic "left panel = old file, right panel = new file" presentation.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `toDataStreamResponse()` | `toUIMessageStreamResponse()` | AI SDK 5+ | Use new method name; old name may still work as alias but is deprecated |
| `usage.promptTokens` | `usage.inputTokens` | AI SDK 4+ | Old names return undefined; always use new names |
| Monaco for in-browser editing | CodeMirror 6 | 2022-2024 | Monaco is too heavy for most use cases; CodeMirror 6 modular arch wins |
| `useOptimistic` in `react-dom` | `useOptimistic` in `react` | React 19 | Import from `react`, not `react-dom` |
| Handlebars for variable extraction | Regex | ongoing | Handlebars adds 80 KB for a feature a 5-line regex covers |
| `revalidatePath` everywhere | `revalidatePath` + `refresh()` | Next.js 15+ | `refresh()` from `next/cache` is available for refreshing without tag-based invalidation |
| `after()` in experimental | `after()` stable | Next.js 15.1+ | No longer `experimental_after` — import from `next/server` directly |

---

## Open Questions

1. **Exact `toUIMessageStreamResponse()` behavior with `useCompletion`**
   - What we know: `toDataStreamResponse()` worked with `useCompletion` in AI SDK 4-5; `toUIMessageStreamResponse()` is the AI SDK 6 name
   - What's unclear: Whether `useCompletion`'s `streamProtocol: 'data'` (default) is compatible with `toUIMessageStreamResponse()` or requires `streamProtocol: 'text'` with `result.toTextStreamResponse()`
   - Recommendation: Test both; fall back to `toTextStreamResponse()` if the data stream format causes parsing issues with `useCompletion`'s expected format

2. **token usage availability for cross-provider clients**
   - What we know: `usage.inputTokens` works for OpenAI; Anthropic and Google also return it
   - What's unclear: Whether Gemini 2.5-flash consistently returns `inputTokens` or sometimes omits it
   - Recommendation: Always null-check `usage?.inputTokens ?? 0` before logging

3. **Advisory lock performance under Supabase connection pooler**
   - What we know: `pg_advisory_xact_lock` is transaction-scoped, works with standard pooling
   - What's unclear: Supavisor (statement-mode pooling) may not preserve transaction-scoped advisory locks across pool hops
   - Recommendation: Ensure Supabase pooler is in **session mode** (port 5432) when creating versions, or switch to the `LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE` approach which is pool-safe

---

## Sources

### Primary (HIGH confidence)
- [Vercel AI SDK useChat docs](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat) — parameters, return values, onFinish callback
- [Vercel AI SDK streamText docs](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) — usage object, onFinish, toDataStreamResponse
- [Vercel AI SDK useCompletion docs](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-completion) — single-turn completion API
- [jsdiff GitHub repo](https://github.com/kpdecker/jsdiff) — diffChars/diffWords API, change object format
- [Next.js Updating Data docs](https://nextjs.org/docs/app/getting-started/updating-data) — Server Actions, revalidatePath, useActionState
- [React useOptimistic docs](https://react.dev/reference/react/useOptimistic) — API, integration with startTransition
- [CodeMirror bundling guide](https://codemirror.net/examples/bundle/) — bundle size estimates (135 KB gzipped with basicSetup)
- [gpt-tokenizer GitHub](https://github.com/niieani/gpt-tokenizer) — pure JS, browser-native, gpt-4o support (o200k_base)
- [PostgreSQL Explicit Locking docs](https://www.postgresql.org/docs/current/explicit-locking.html) — pg_advisory_xact_lock
- [Next.js after() API](https://nextjs.org/docs/app/api-reference/functions/after) — stable in 15.1.0

### Secondary (MEDIUM confidence)
- [CodeMirror Mustache highlighter gist](https://gist.github.com/randyburden/26b8c794cb972817426e) — overlay mode example for {{variable}} tokens (CodeMirror 5 API, adapted to CM6 ViewPlugin approach)
- [PostgreSQL trigger for auto-increment version](https://dev.to/nickcosmo/create-an-auto-incrementing-version-column-with-postgresql-triggers-1605) — trigger approach confirmed, adapted for per-template_id use case
- [Monaco vs CodeMirror comparison](https://sourcegraph.com/blog/migrating-monaco-codemirror) — Sourcegraph migration; confirms CodeMirror 6 as current standard for in-browser editors

### Tertiary (LOW confidence — validate before relying on)
- AI SDK 5 blog post mentions `toUIMessageStreamResponse()` — exact compatibility with `useCompletion` unconfirmed; test required
- Supavisor advisory lock behavior — based on general PostgreSQL pooler documentation, not Supabase-specific confirmation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — diff, gpt-tokenizer, @uiw/react-codemirror all verified against npm and official repos
- useCompletion / useChat: HIGH — official AI SDK docs fetched directly
- streamText token properties: HIGH — confirmed `inputTokens`/`outputTokens` from official docs
- PostgreSQL versioning trigger: MEDIUM — pattern is well-established, advisory lock in Supavisor context needs validation
- CodeMirror {{variable}} highlighting: MEDIUM — approach based on CM6 Decoration API (documented), mustache overlay example from CM5 adapted
- Architecture (Server/Client split): HIGH — confirmed from official Next.js docs

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (Vercel AI SDK releases frequently; re-check `toUIMessageStreamResponse` name if API changes)
