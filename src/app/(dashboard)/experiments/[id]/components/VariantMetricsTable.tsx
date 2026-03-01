"use client";

import type { ReactElement } from "react";
import type { VariantStats } from "@/lib/ab-testing/metrics";

interface VariantRow {
  variantId: string;
  variantName: string;
  isControl: boolean;
  trafficWeight: number;
  stats: VariantStats;
}

interface VariantMetricsTableProps {
  variants: VariantRow[];
  minSamples: number;
}

export function VariantMetricsTable({ variants, minSamples }: VariantMetricsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="pr-4 pb-2 font-medium text-gray-600">Variant</th>
            <th className="pr-4 pb-2 text-right font-medium text-gray-600">Requests</th>
            <th className="pr-4 pb-2 text-right font-medium text-gray-600">Error Rate</th>
            <th className="pr-4 pb-2 text-right font-medium text-gray-600">Avg Latency</th>
            <th className="pr-4 pb-2 text-right font-medium text-gray-600">Avg Cost</th>
            <th className="pr-4 pb-2 text-right font-medium text-gray-600">Eval Score</th>
            <th className="pb-2 text-right font-medium text-gray-600">SPRT Status</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => {
            const hasEnoughData = v.stats.requestCount >= minSamples;
            const sprtBadge = getSprtBadge(
              v.stats.sprtDecision,
              hasEnoughData,
              v.stats.requestCount,
              minSamples
            );

            return (
              <tr key={v.variantId} className="border-b border-gray-100 last:border-0">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{v.variantName}</span>
                    {v.isControl && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                        control
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {Math.round(v.trafficWeight * 100)}%
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-4 text-right text-gray-700">
                  {v.stats.requestCount.toLocaleString()}
                </td>
                <td className="py-3 pr-4 text-right text-gray-700">
                  {(v.stats.errorRate * 100).toFixed(2)}%
                </td>
                <td className="py-3 pr-4 text-right text-gray-700">
                  {v.stats.avgLatencyMs.toFixed(0)}ms
                </td>
                <td className="py-3 pr-4 text-right text-gray-700">
                  ${v.stats.avgCostUsd.toFixed(6)}
                </td>
                <td className="py-3 pr-4 text-right text-gray-400">
                  {v.stats.avgEvalScore !== null ? v.stats.avgEvalScore.toFixed(2) : "—"}
                </td>
                <td className="py-3 text-right">{sprtBadge}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getSprtBadge(
  decision: string | null,
  hasEnoughData: boolean,
  requestCount: number,
  minSamples: number
): ReactElement {
  if (!hasEnoughData) {
    return (
      <span className="text-xs text-gray-400">
        {requestCount}/{minSamples}
      </span>
    );
  }
  if (decision === "accept_h1") {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        Significant
      </span>
    );
  }
  if (decision === "accept_h0") {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
        No difference
      </span>
    );
  }
  return (
    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">Collecting...</span>
  );
}
