"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10b981", // emerald
  anthropic: "#6366f1", // indigo
  google: "#f59e0b", // amber
};

interface CostDataPoint {
  bucket: string;
  openai: number;
  anthropic: number;
  google: number;
}

function aggregateByProvider(
  rawData: Array<{ bucket: string; provider: string; total_cost: number }>
): CostDataPoint[] {
  const byBucket = new Map<string, CostDataPoint>();
  for (const row of rawData) {
    if (!byBucket.has(row.bucket)) {
      byBucket.set(row.bucket, {
        bucket: row.bucket,
        openai: 0,
        anthropic: 0,
        google: 0,
      });
    }
    const point = byBucket.get(row.bucket)!;
    if (row.provider === "openai") point.openai += row.total_cost;
    else if (row.provider === "anthropic") point.anthropic += row.total_cost;
    else if (row.provider === "google") point.google += row.total_cost;
  }
  return Array.from(byBucket.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export interface CostTrendChartProps {
  data: Array<{ bucket: string; provider: string; total_cost: number }>;
}

export function CostTrendChart({ data }: CostTrendChartProps) {
  const chartData = aggregateByProvider(data);

  const formatXAxis = (tick: string) => {
    try {
      return format(new Date(tick), "MM/dd HH:mm");
    } catch {
      return tick;
    }
  };

  return (
    // Explicit height div prevents ResponsiveContainer zero-dimension render (Risk 5)
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="bucket" tickFormatter={formatXAxis} tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(v: number) => `$${v.toFixed(4)}`}
            tick={{ fontSize: 11 }}
            width={70}
          />
          <Tooltip formatter={(v: number | undefined) => [`$${(v ?? 0).toFixed(6)}`, undefined]} />
          <Legend />
          <Area
            type="monotone"
            dataKey="openai"
            name="OpenAI"
            stackId="1"
            stroke={PROVIDER_COLORS.openai!}
            fill={PROVIDER_COLORS.openai!}
            fillOpacity={0.6}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="anthropic"
            name="Anthropic"
            stackId="1"
            stroke={PROVIDER_COLORS.anthropic!}
            fill={PROVIDER_COLORS.anthropic!}
            fillOpacity={0.6}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="google"
            name="Google"
            stackId="1"
            stroke={PROVIDER_COLORS.google!}
            fill={PROVIDER_COLORS.google!}
            fillOpacity={0.6}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
