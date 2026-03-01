"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ExperimentControlsProps {
  experimentId: string;
  status: string;
  winnerVariantId: string | null;
  variants: Array<{ id: string; name: string; isControl: boolean }>;
}

export function ExperimentControls({
  experimentId,
  status,
  winnerVariantId,
  variants,
}: ExperimentControlsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callAction = async (action: string, extra?: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/experiments/${experimentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Action failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  };

  const treatmentVariants = variants.filter((v) => !v.isControl);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "draft" && (
        <button
          onClick={() => callAction("start")}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Starting..." : "Start Experiment"}
        </button>
      )}

      {status === "running" && (
        <button
          onClick={() => callAction("stop")}
          disabled={loading}
          className="rounded-lg bg-gray-600 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? "Stopping..." : "Stop Experiment"}
        </button>
      )}

      {(status === "stopped" || status === "completed") && winnerVariantId && (
        <button
          onClick={() => callAction("promote_winner", { winnerVariantId })}
          disabled={loading}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "Promoting..." : "Promote Winner to Primary"}
        </button>
      )}

      {(status === "stopped" || status === "completed") &&
        !winnerVariantId &&
        treatmentVariants.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Promote variant:</span>
            {treatmentVariants.map((v) => (
              <button
                key={v.id}
                onClick={() => callAction("promote_winner", { winnerVariantId: v.id })}
                disabled={loading}
                className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-sm text-green-700 hover:bg-green-100 disabled:opacity-50"
              >
                {v.name}
              </button>
            ))}
          </div>
        )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
