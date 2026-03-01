// src/components/prompts/VersionList.tsx
"use client";

import { useOptimistic, startTransition } from "react";
import { rollbackToVersion } from "@/lib/prompts/actions";

type Version = {
  id: string;
  version: number;
  createdAt: Date;
  variables: unknown; // JSON — cast to string[] on use
};

export function VersionList({
  templateId,
  templateSlug,
  versions,
  activeVersionId,
}: {
  templateId: string;
  templateSlug: string;
  versions: Version[];
  activeVersionId: string | null;
}) {
  // useOptimistic: immediately shows new active version on click,
  // automatically reverts to actual value if Server Action throws
  const [optimisticActiveId, setOptimisticActiveId] = useOptimistic(activeVersionId);

  const handleRollback = (versionId: string) => {
    startTransition(async () => {
      setOptimisticActiveId(versionId); // Instant UI update
      try {
        await rollbackToVersion(templateId, versionId);
      } catch (err) {
        console.error("Rollback failed:", err);
        // useOptimistic auto-reverts on exception from the async transition
      }
    });
  };

  return (
    <div className="space-y-2">
      {versions.map((v) => {
        const isActive = optimisticActiveId === v.id;
        const vars = Array.isArray(v.variables) ? (v.variables as string[]) : [];

        return (
          <div
            key={v.id}
            className={`flex items-center gap-4 rounded-lg border p-3 transition-colors ${
              isActive
                ? "border-green-600/50 bg-green-950/30"
                : "border-gray-700 bg-gray-900 hover:border-gray-600"
            }`}
          >
            {/* Version number */}
            <span className="w-10 shrink-0 font-mono text-sm text-gray-300">v{v.version}</span>

            {/* Active badge */}
            {isActive && (
              <span className="shrink-0 rounded-full border border-green-700/50 bg-green-800/60 px-2 py-0.5 text-xs text-green-300">
                ACTIVE
              </span>
            )}

            {/* Variables */}
            {vars.length > 0 && (
              <div className="flex flex-1 flex-wrap gap-1">
                {vars.map((varName) => (
                  <span
                    key={varName}
                    className="rounded border border-amber-700/30 bg-amber-900/40 px-1.5 py-0.5 font-mono text-xs text-amber-300"
                  >
                    {`{{${varName}}}`}
                  </span>
                ))}
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Created date */}
            <span className="shrink-0 text-xs text-gray-500">
              {new Date(v.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-2">
              {/* Link to diff view — compare this version vs active version */}
              {!isActive && activeVersionId && (
                <a
                  href={`/prompts/${templateSlug}/diff?v1=${v.id}&v2=${activeVersionId}`}
                  className="text-xs text-blue-400 transition-colors hover:text-blue-300"
                >
                  Diff
                </a>
              )}

              {/* Rollback button — disabled for active version */}
              {!isActive ? (
                <button
                  onClick={() => handleRollback(v.id)}
                  className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-600 hover:text-white"
                >
                  Rollback
                </button>
              ) : (
                <span className="px-2 py-1 text-xs text-gray-600 select-none">Current</span>
              )}
            </div>
          </div>
        );
      })}

      {versions.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500">
          No versions yet. Create the first version to get started.
        </p>
      )}
    </div>
  );
}
