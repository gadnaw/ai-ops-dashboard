"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export interface ModelPieChartProps {
  data: Array<{ model: string; provider: string; total_requests: number }>;
}

export function ModelPieChart({ data }: ModelPieChartProps) {
  const chartData = data.map((d) => ({
    name: d.model.split(":")[1] ?? d.model, // show model name without provider prefix
    value: d.total_requests,
    fullId: d.model,
  }));

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            isAnimationActive={false}
            // stroke="none" replaces deprecated blendStroke (Recharts 3.x breaking change)
            stroke="none"
          >
            {chartData.map((_entry, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]!} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => [v.toLocaleString(), "Requests"]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
