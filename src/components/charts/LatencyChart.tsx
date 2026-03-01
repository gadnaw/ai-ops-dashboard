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
} from "recharts";
import { format } from "date-fns";

export interface LatencyChartProps {
  data: Array<{ bucket: string; p50: number; p95: number; p99: number }>;
}

export function LatencyChart({ data }: LatencyChartProps) {
  const formatXAxis = (tick: string) => {
    try {
      return format(new Date(tick), "MM/dd HH:mm");
    } catch {
      return tick;
    }
  };

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="bucket" tickFormatter={formatXAxis} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v: number) => `${v}ms`} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => [`${v}ms`, undefined]} />
          <Legend />
          <Line
            type="monotone"
            dataKey="p50"
            name="p50"
            stroke="#10b981"
            isAnimationActive={false}
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="p95"
            name="p95"
            stroke="#f59e0b"
            isAnimationActive={false}
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="p99"
            name="p99"
            stroke="#ef4444"
            isAnimationActive={false}
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
