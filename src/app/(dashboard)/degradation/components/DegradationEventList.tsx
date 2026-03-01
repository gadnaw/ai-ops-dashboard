"use client";

import { useState } from "react";
import type { DegradationChain } from "@/lib/degradation/constants";
import { STAGE_CONFIG } from "@/lib/degradation/constants";
import { DegradationTimeline } from "./DegradationTimeline";
import { StageDetailPanel } from "./StageDetailPanel";

const OUTCOME_BADGE: Record<string, string> = {
  queued: "bg-blue-100 text-blue-800",
  fallback: "bg-amber-100 text-amber-800",
  cached: "bg-purple-100 text-purple-800",
  rejected: "bg-red-100 text-red-800",
};

interface DegradationEventListProps {
  chains: DegradationChain[];
}

export function DegradationEventList({ chains }: DegradationEventListProps) {
  const [selectedChain, setSelectedChain] = useState<DegradationChain | null>(null);

  if (chains.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400">
        <p className="text-sm">No degradation events in the selected time window.</p>
        <p className="mt-1 text-xs">
          Trigger rate limiting by sending requests with a low-capacity API key.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Event list */}
      <div className="space-y-2">
        {chains.map((chain, index) => {
          const badgeClass = OUTCOME_BADGE[chain.outcome] ?? "bg-gray-100 text-gray-800";
          const stagesReached = chain.stages.length;
          const maxStageConfig = STAGE_CONFIG[chain.maxStage as 1 | 2 | 3 | 4];
          const isSelected = chain === selectedChain;

          return (
            <button
              key={index}
              onClick={() => setSelectedChain(isSelected ? null : chain)}
              className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                isSelected
                  ? "border-blue-300 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
                    {chain.outcome.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-500">
                    {stagesReached} stage{stagesReached !== 1 ? "s" : ""} traversed
                  </span>
                  {maxStageConfig && (
                    <span className="text-xs text-gray-400">&rarr; {maxStageConfig.name}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{chain.totalDurationMs}ms total</span>
                  <span className="text-xs text-gray-400">
                    {chain.startedAt.toLocaleTimeString()}
                  </span>
                  <span className="text-xs text-gray-300">{isSelected ? "▲" : "▼"}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Inline detail — shown below the selected event */}
      {selectedChain && (
        <div className="rounded-lg border border-blue-200 bg-white p-4">
          <DegradationTimeline chain={selectedChain} onClose={() => setSelectedChain(null)} />
          <StageDetailPanel chain={selectedChain} />
        </div>
      )}
    </div>
  );
}
