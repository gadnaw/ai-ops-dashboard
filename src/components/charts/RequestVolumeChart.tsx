"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

export interface RequestVolumeChartProps {
  data: Array<{
    bucket: string;
    total_requests: number;
    error_requests: number;
    fallback_requests: number;
  }>;
}

export function RequestVolumeChart({ data }: RequestVolumeChartProps) {
  // Derive successful_requests = total - error - fallback for stacked display
  const chartData = data.map((d) => ({
    ...d,
    successful_requests: Math.max(0, d.total_requests - d.error_requests - d.fallback_requests),
  }));

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
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="bucket" tickFormatter={formatXAxis} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar
            dataKey="successful_requests"
            name="Success"
            stackId="a"
            fill="#10b981"
            isAnimationActive={false}
          />
          <Bar
            dataKey="fallback_requests"
            name="Fallback"
            stackId="a"
            fill="#f59e0b"
            isAnimationActive={false}
          />
          <Bar
            dataKey="error_requests"
            name="Error"
            stackId="a"
            fill="#ef4444"
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
