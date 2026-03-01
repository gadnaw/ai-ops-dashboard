"use client";

import { BarChart, Bar, XAxis, YAxis, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { DegradationChain } from "@/lib/degradation/queries";
import { STAGE_CONFIG } from "@/lib/degradation/queries";

interface TimelineRow {
  name: string; // label for y-axis (e.g. "Stage 1 — Queued")
  spacer: number; // ms from t=0 to stage start (transparent offset bar)
  duration: number; // ms this stage took (colored visible bar)
  stage: number; // 1-4 for coloring
}

function buildTimelineRows(chain: DegradationChain): TimelineRow[] {
  if (chain.stages.length === 0) return [];

  const t0 = chain.startedAt.getTime();

  return chain.stages.map((event) => {
    const startMs = event.createdAt.getTime() - t0;
    // Duration: use queuedMs for stage 1, else estimate 50ms per stage
    const duration = event.queuedMs ?? 50;
    const stageNum = event.stage as 1 | 2 | 3 | 4;
    const config = STAGE_CONFIG[stageNum];

    return {
      name: config?.name ?? `Stage ${event.stage}`,
      spacer: startMs,
      duration,
      stage: event.stage,
    };
  });
}

interface DegradationTimelineProps {
  chain: DegradationChain;
  onClose?: () => void;
}

export function DegradationTimeline({ chain, onClose }: DegradationTimelineProps) {
  const rows = buildTimelineRows(chain);

  if (rows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-gray-400">
        No stage data available
      </div>
    );
  }

  const chartHeight = Math.max(120, rows.length * 44);

  const outcomeLabel =
    chain.outcome === "rejected"
      ? "429 Rejected"
      : chain.outcome === "cached"
        ? "Served from Cache"
        : chain.outcome === "fallback"
          ? "Fallback Model Used"
          : "Queued";

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Degradation Chain — {outcomeLabel}</h3>
        {onClose && (
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            &#x2715;
          </button>
        )}
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ left: 130, right: 40, top: 5, bottom: 5 }}
          barSize={20}
        >
          <XAxis
            type="number"
            unit="ms"
            domain={[0, "dataMax + 200"]}
            tickFormatter={(v: number) => `${v}ms`}
            tick={{ fontSize: 11 }}
          />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />

          {/* Transparent spacer bar — provides horizontal offset */}
          <Bar dataKey="spacer" stackId="timeline" fill="transparent" isAnimationActive={false} />

          {/* Colored stage duration bar */}
          <Bar
            dataKey="duration"
            stackId="timeline"
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          >
            {rows.map((row, index) => {
              const stageNum = row.stage as 1 | 2 | 3 | 4;
              const color = STAGE_CONFIG[stageNum]?.color ?? "#94a3b8";
              return <Cell key={index} fill={color} />;
            })}
          </Bar>

          <Tooltip
            formatter={(value: unknown, name: unknown) => {
              if (name === "spacer") return null;
              return [`${typeof value === "number" ? value : 0}ms`, "Duration"];
            }}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Stage legend */}
      <div className="mt-3 flex flex-wrap gap-3">
        {Object.entries(STAGE_CONFIG).map(([stageNum, config]) => (
          <div key={stageNum} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="inline-block h-3 w-3 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: config.color }}
            />
            {config.name}
          </div>
        ))}
      </div>
    </div>
  );
}
