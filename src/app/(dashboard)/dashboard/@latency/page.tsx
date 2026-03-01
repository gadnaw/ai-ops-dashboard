import dynamic from "next/dynamic";
import { fetchLatencyPercentiles, getTimeRangeFromCookies } from "@/lib/dashboard/queries";

export const revalidate = 300;

// Dynamic import with ssr: false — prevents ResponsiveContainer SSR zero-dimension failure
const LatencyChart = dynamic(
  () => import("@/components/charts/LatencyChart").then((m) => m.LatencyChart),
  {
    ssr: false,
    loading: () => <div className="h-[300px] animate-pulse rounded bg-gray-100" />,
  }
);

export default async function LatencyPanel() {
  const timeRange = await getTimeRangeFromCookies();
  const rawData = await fetchLatencyPercentiles(timeRange);
  // Aggregate across providers for the chart — average p50/p95/p99 per bucket
  const byBucket = new Map<string, { p50: number[]; p95: number[]; p99: number[] }>();
  for (const row of rawData) {
    const entry = byBucket.get(row.bucket) ?? { p50: [], p95: [], p99: [] };
    entry.p50.push(row.p50);
    entry.p95.push(row.p95);
    entry.p99.push(row.p99);
    byBucket.set(row.bucket, entry);
  }
  const data = Array.from(byBucket.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, v]) => ({
      bucket,
      p50: Math.round(v.p50.reduce((s, x) => s + x, 0) / v.p50.length),
      p95: Math.round(v.p95.reduce((s, x) => s + x, 0) / v.p95.length),
      p99: Math.round(v.p99.reduce((s, x) => s + x, 0) / v.p99.length),
    }));

  return <LatencyChart data={data} />;
}
