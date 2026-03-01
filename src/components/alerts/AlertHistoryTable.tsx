"use client";

import { useTransition, useState } from "react";
import { acknowledgeAlert, resolveAlert } from "@/app/actions/alerts";
import { AlertStatusBadge } from "./AlertStatusBadge";

const METRIC_LABELS: Record<string, string> = {
  cost_per_window: "Cost/window ($)",
  p95_latency_ms: "p95 Latency (ms)",
  error_rate_pct: "Error rate (%)",
  eval_score_avg: "Avg eval score",
};

interface AlertHistoryEntry {
  id: string;
  ruleName: string;
  metric: string;
  metricValue: number;
  thresholdValue: number;
  status: "fired" | "acknowledged" | "resolved";
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  webhookAttempts: number;
  webhookStatusCode: number | null;
}

export function AlertHistoryTable({ entries }: { entries: AlertHistoryEntry[] }) {
  const [isPending, startTransition] = useTransition();
  const [resolveNote, setResolveNote] = useState<Record<string, string>>({});

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500">
        <p className="font-medium">No alert history</p>
        <p className="mt-1 text-sm">Alerts will appear here when thresholds are crossed.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="pr-4 pb-2 font-medium">Rule</th>
            <th className="pr-4 pb-2 font-medium">Metric</th>
            <th className="pr-4 pb-2 font-medium">Value / Threshold</th>
            <th className="pr-4 pb-2 font-medium">Status</th>
            <th className="pr-4 pb-2 font-medium">Triggered</th>
            <th className="pb-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((entry) => (
            <tr key={entry.id} className="py-3">
              <td className="py-3 pr-4 font-medium">{entry.ruleName}</td>
              <td className="py-3 pr-4 text-slate-600">
                {METRIC_LABELS[entry.metric] ?? entry.metric}
              </td>
              <td className="py-3 pr-4 font-mono text-xs">
                <span className="font-medium text-red-600">{entry.metricValue.toFixed(2)}</span>
                <span className="text-slate-400"> / {entry.thresholdValue.toFixed(2)}</span>
              </td>
              <td className="py-3 pr-4">
                <AlertStatusBadge status={entry.status} />
              </td>
              <td className="py-3 pr-4 text-xs text-slate-500">
                {new Date(entry.triggeredAt).toLocaleString()}
                {entry.webhookAttempts > 0 && (
                  <span className="block text-slate-400">
                    Webhook: {entry.webhookAttempts} attempt(s){" "}
                    {entry.webhookStatusCode ? `(HTTP ${entry.webhookStatusCode})` : ""}
                  </span>
                )}
              </td>
              <td className="py-3">
                <div className="flex items-center gap-2">
                  {entry.status === "fired" && (
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          await acknowledgeAlert(entry.id);
                        })
                      }
                      disabled={isPending}
                      className="rounded border border-yellow-300 px-2 py-1 text-xs text-yellow-700 hover:bg-yellow-50 disabled:opacity-50"
                    >
                      Acknowledge
                    </button>
                  )}
                  {(entry.status === "fired" || entry.status === "acknowledged") && (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="Note (optional)"
                        className="w-28 rounded border px-1.5 py-1 text-xs"
                        value={resolveNote[entry.id] ?? ""}
                        onChange={(e) =>
                          setResolveNote((prev) => ({ ...prev, [entry.id]: e.target.value }))
                        }
                      />
                      <button
                        onClick={() =>
                          startTransition(async () => {
                            await resolveAlert({
                              alertHistoryId: entry.id,
                              ...(resolveNote[entry.id]
                                ? { resolverNote: resolveNote[entry.id] }
                                : {}),
                            });
                          })
                        }
                        disabled={isPending}
                        className="rounded border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                  {entry.status === "resolved" && entry.resolvedAt && (
                    <span className="text-xs text-slate-400">
                      Resolved {new Date(entry.resolvedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
