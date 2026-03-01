"use client";

import type { DegradationChain } from "@/lib/degradation/constants";
import { STAGE_CONFIG } from "@/lib/degradation/constants";

interface StageDetailPanelProps {
  chain: DegradationChain;
}

export function StageDetailPanel({ chain }: StageDetailPanelProps) {
  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <h4 className="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
        Stage Details
      </h4>

      <div className="space-y-2">
        {chain.stages.map((event, index) => {
          const stageNum = event.stage as 1 | 2 | 3 | 4;
          const config = STAGE_CONFIG[stageNum];
          const color = config?.color ?? "#94a3b8";

          return (
            <div key={index} className="flex gap-3">
              {/* Stage color indicator */}
              <div className="flex flex-col items-center">
                <div
                  className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {index < chain.stages.length - 1 && (
                  <div className="mt-1 mb-1 w-px flex-1" style={{ backgroundColor: "#e5e7eb" }} />
                )}
              </div>

              {/* Stage info */}
              <div className="min-w-0 flex-1 pb-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    Stage {event.stage}: {config?.name ?? event.stageName}
                  </span>
                  <span className="ml-2 flex-shrink-0 text-xs text-gray-400">
                    {event.createdAt.toLocaleTimeString()}
                  </span>
                </div>

                <p className="mt-0.5 text-xs text-gray-500">{event.reason.replace(/_/g, " ")}</p>

                {/* Stage-specific details */}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {event.queuedMs !== null && (
                    <span className="text-xs text-gray-400">Wait time: {event.queuedMs}ms</span>
                  )}
                  {event.fallbackModel && (
                    <span className="text-xs text-gray-400">Fallback: {event.fallbackModel}</span>
                  )}
                  {event.cacheHitKey && (
                    <span className="font-mono text-xs text-gray-400">
                      Cache key: {event.cacheHitKey.slice(0, 8)}...
                    </span>
                  )}
                  {event.retryAfterSec !== null && (
                    <span className="text-xs font-medium text-red-500">
                      Retry after: {event.retryAfterSec}s
                    </span>
                  )}
                  {event.tokensAtEvent !== null && (
                    <span className="text-xs text-gray-400">
                      Tokens remaining: {event.tokensAtEvent.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
