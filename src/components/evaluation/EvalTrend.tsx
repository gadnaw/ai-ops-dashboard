"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface ScoreTrendPoint {
  date: string;
  avgScore: number;
  count: number;
}

interface EvalTrendProps {
  data: ScoreTrendPoint[];
  reviewThreshold?: number;
}

export function EvalTrend({ data, reviewThreshold = 3 }: EvalTrendProps) {
  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
        No evaluation data yet. Scores will appear after the evaluation processor runs.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          tickFormatter={(val: string) =>
            new Date(val).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          }
        />
        <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} width={28} />
        <Tooltip formatter={(v: number | undefined) => [(v ?? 0).toFixed(2), "Avg Score"]} />
        <Legend
          formatter={(value: string) =>
            value === "avgScore" ? "Avg Overall Score" : "Evaluations"
          }
        />
        <ReferenceLine
          y={reviewThreshold}
          stroke="#f59e0b"
          strokeDasharray="4 4"
          label={{
            value: "Review threshold",
            position: "right",
            fontSize: 10,
            fill: "#f59e0b",
          }}
        />
        <Line
          type="monotone"
          dataKey="avgScore"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
