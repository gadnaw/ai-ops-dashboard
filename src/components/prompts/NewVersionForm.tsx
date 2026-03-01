// src/components/prompts/NewVersionForm.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPromptVersion } from "@/lib/prompts/actions";
import { extractVariables } from "@/lib/prompts/variables";
import { PromptEditor } from "./PromptEditor";

export function NewVersionForm({
  templateId,
  templateSlug,
}: {
  templateId: string;
  templateSlug: string;
}) {
  const [content, setContent] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Live variable extraction — updates as user types in editor
  const detectedVars = extractVariables(content);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!content.trim()) {
      setError("Content is required");
      return;
    }

    startTransition(async () => {
      const result = await createPromptVersion({
        templateId,
        content,
        ...(systemPrompt ? { systemPrompt } : {}),
      });

      if ("error" in result) {
        setError(result.error);
      } else {
        router.push(`/prompts/${templateSlug}`);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="mb-1 block text-sm text-gray-400">
          System Prompt <span className="text-gray-600">(optional)</span>
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Role and behavioral instructions for the model..."
          rows={3}
          className="w-full resize-none rounded-md border border-gray-600 bg-gray-800 px-3 py-2 font-mono text-sm text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">
          Template Content
          <span className="ml-2 text-xs text-amber-500/80">
            Use {`{{variableName}}`} for placeholders
          </span>
        </label>
        <PromptEditor value={content} onChange={setContent} height="240px" />
      </div>

      {/* Live variable detection */}
      {detectedVars.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Variables detected:</span>
          {detectedVars.map((v) => (
            <span
              key={v}
              className="rounded border border-amber-700/30 bg-amber-900/40 px-1.5 py-0.5 font-mono text-xs text-amber-300"
            >
              {`{{${v}}}`}
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending || !content.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save Version"}
        </button>
        <a
          href={`/prompts/${templateSlug}`}
          className="rounded-md bg-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-600"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
