// src/components/prompts/DiffViewer.tsx
"use client";

import { diffChars, diffWords } from "diff";

interface DiffViewerProps {
  oldText: string;
  newText: string;
  mode?: "chars" | "words";
  // showOnly: for side-by-side layout
  // 'removed' = left panel (show unchanged + removed, omit added)
  // 'added'   = right panel (show unchanged + added, omit removed)
  // undefined = inline diff (show everything)
  showOnly?: "added" | "removed";
}

export function DiffViewer({ oldText, newText, mode = "chars", showOnly }: DiffViewerProps) {
  // Use diffWords for large templates (>5KB) for performance
  const usedMode = oldText.length + newText.length > 5000 ? "words" : mode;
  const rawChanges =
    usedMode === "chars"
      ? diffChars(oldText, newText, { timeout: 5000 })
      : diffWords(oldText, newText);
  const changes = rawChanges ?? [];

  return (
    <pre className="max-h-[480px] overflow-auto rounded-lg bg-gray-950 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap">
      {changes.map((change, i) => {
        // Side-by-side mode: omit the opposite panel's unique content
        if (showOnly === "removed" && change.added) {
          // Left panel: skip added content (it doesn't exist in old version)
          return null;
        }
        if (showOnly === "added" && change.removed) {
          // Right panel: skip removed content (it doesn't exist in new version)
          return null;
        }

        if (change.added) {
          return (
            <span
              key={i}
              className="bg-green-900/40 text-green-300 ring-1 ring-green-700/50"
              title={`+${change.count ?? 0} ${usedMode === "words" ? "word" : "char"}${(change.count ?? 0) !== 1 ? "s" : ""}`}
            >
              {change.value}
            </span>
          );
        }

        if (change.removed) {
          return (
            <span
              key={i}
              className="bg-red-900/40 text-red-300 line-through ring-1 ring-red-700/50"
              title={`-${change.count ?? 0} ${usedMode === "words" ? "word" : "char"}${(change.count ?? 0) !== 1 ? "s" : ""}`}
            >
              {change.value}
            </span>
          );
        }

        // Unchanged text
        return (
          <span key={i} className="text-gray-400">
            {change.value}
          </span>
        );
      })}
    </pre>
  );
}

/**
 * Side-by-side diff layout: left panel shows old version with removals,
 * right panel shows new version with additions.
 */
export function SideBySideDiff({
  v1,
  v2,
}: {
  v1: { version: number; content: string };
  v2: { version: number; content: string };
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h3 className="mb-2 px-1 font-mono text-sm text-gray-400">
          v{v1.version}
          <span className="ml-2 text-xs text-red-400">(before)</span>
        </h3>
        <DiffViewer oldText={v1.content} newText={v2.content} showOnly="removed" />
      </div>
      <div>
        <h3 className="mb-2 px-1 font-mono text-sm text-gray-400">
          v{v2.version}
          <span className="ml-2 text-xs text-green-400">(after)</span>
        </h3>
        <DiffViewer oldText={v1.content} newText={v2.content} showOnly="added" />
      </div>
    </div>
  );
}
