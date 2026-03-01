"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface SPRTDataPoint {
  sampleCount: number;
  llr: number;
  upperBoundary: number;
  lowerBoundary: number;
}

interface SPRTChartProps {
  sprtHistory: SPRTDataPoint[];
  minSamples: number;
  status: string;
}

export function SPRTChart({ sprtHistory, minSamples, status }: SPRTChartProps) {
  if (sprtHistory.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
        {status === "draft"
          ? "Start the experiment to begin collecting data"
          : "Collecting baseline data... (200 samples per variant required)"}
      </div>
    );
  }

  const upperBoundary = sprtHistory[0]?.upperBoundary ?? 2.773;
  const lowerBoundary = sprtHistory[0]?.lowerBoundary ?? -1.558;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">SPRT Confidence Trajectory</h3>
        <span className="text-xs text-gray-400">
          Upper boundary: {upperBoundary.toFixed(3)} (H1) | Lower: {lowerBoundary.toFixed(3)} (H0)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={sprtHistory} margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
          <XAxis
            dataKey="sampleCount"
            label={{
              value: "Observations per Variant",
              position: "insideBottom",
              offset: -5,
            }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            label={{
              value: "Log-Likelihood Ratio",
              angle: -90,
              position: "insideLeft",
              offset: 10,
            }}
            tick={{ fontSize: 11 }}
            domain={[lowerBoundary - 0.5, upperBoundary + 0.5]}
          />

          {/* LLR trajectory */}
          <Line
            type="monotone"
            dataKey="llr"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            name="LLR"
          />

          {/* Decision boundaries */}
          <ReferenceLine
            y={upperBoundary}
            stroke="#22c55e"
            strokeDasharray="4 4"
            label={{
              value: "H1 accepted (treatment wins)",
              position: "right",
              fontSize: 10,
            }}
          />
          <ReferenceLine
            y={lowerBoundary}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{
              value: "H0 accepted (no difference)",
              position: "right",
              fontSize: 10,
            }}
          />
          <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />

          {/* Minimum sample guard line */}
          <ReferenceLine
            x={minSamples}
            stroke="#94a3b8"
            strokeDasharray="2 2"
            label={{ value: `Min ${minSamples}`, position: "top", fontSize: 10 }}
          />

          <Tooltip
            formatter={(value: unknown) => [
              typeof value === "number" ? value.toFixed(4) : String(value),
              "Log-Likelihood Ratio",
            ]}
            labelFormatter={(label: unknown) => `Sample count: ${String(label)}`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </LineChart>
      </ResponsiveContainer>

      <p className="mt-1 text-xs text-gray-400">
        LLR above green line = treatment variant is significantly different (95% confidence). LLR
        below red line = no significant difference detected. Gray dashed line = minimum sample
        requirement.
      </p>
    </div>
  );
}
