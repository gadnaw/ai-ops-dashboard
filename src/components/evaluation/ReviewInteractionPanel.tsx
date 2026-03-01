"use client";

import { useState, useTransition } from "react";
import { approveScore, overrideScore } from "@/app/actions/evaluation";
import { ScoreDisplay } from "./ScoreDisplay";

interface RubricDimension {
  id: string;
  name: string;
  anchors: Record<string, string>;
}

interface ReviewInteractionPanelProps {
  scoreId: string;
  judgeScores: Record<string, number>;
  reasoning: string;
  flags: string[];
  rubricDimensions: RubricDimension[];
}

export function ReviewInteractionPanel({
  scoreId,
  judgeScores,
  reasoning,
  flags,
  rubricDimensions,
}: ReviewInteractionPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasOverrides = Object.keys(overrides).length > 0;

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveScore({
        scoreId,
        ...(notes ? { reviewerNotes: notes } : {}),
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        setSubmitted(true);
      }
    });
  }

  function handleOverride() {
    if (!hasOverrides) return;
    setError(null);
    startTransition(async () => {
      const result = await overrideScore({
        scoreId,
        dimensionOverrides: overrides,
        ...(notes ? { reviewerNotes: notes } : {}),
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        setSubmitted(true);
      }
    });
  }

  if (submitted) {
    return (
      <div className="py-4 text-center text-sm font-medium text-green-600">Review submitted</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Judge reasoning */}
      <div className="rounded-md bg-slate-50 p-3">
        <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
          Judge reasoning
        </p>
        <p className="text-sm text-slate-700">{reasoning}</p>
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((flag) => (
            <span
              key={flag}
              className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700"
            >
              {flag}
            </span>
          ))}
        </div>
      )}

      {/* Per-dimension scores with override inputs */}
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
          Dimension Scores (enter override to change)
        </p>
        {rubricDimensions.map((dim) => (
          <div key={dim.id} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm font-medium">{dim.name}</span>
            <ScoreDisplay score={overrides[dim.id] ?? judgeScores[dim.id] ?? 0} size="sm" />
            <input
              type="number"
              min={1}
              max={5}
              step={1}
              placeholder={String(judgeScores[dim.id] ?? "?")}
              className="w-20 rounded border px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={overrides[dim.id] ?? ""}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!e.target.value) {
                  setOverrides((prev) => {
                    const next = { ...prev };
                    delete next[dim.id];
                    return next;
                  });
                } else if (val >= 1 && val <= 5) {
                  setOverrides((prev) => ({ ...prev, [dim.id]: val }));
                }
              }}
            />
            <span className="hidden max-w-xs truncate text-xs text-slate-400 lg:block">
              {dim.anchors[String(overrides[dim.id] ?? judgeScores[dim.id] ?? 3)] ?? ""}
            </span>
          </div>
        ))}
      </div>

      {/* Notes */}
      <textarea
        placeholder="Review notes (optional)"
        className="w-full resize-none rounded-md border p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      {/* Error display */}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          disabled={isPending}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving\u2026" : "Approve Judge Score"}
        </button>
        <button
          onClick={handleOverride}
          disabled={isPending || !hasOverrides}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving\u2026" : "Override Scores"}
        </button>
      </div>
    </div>
  );
}
