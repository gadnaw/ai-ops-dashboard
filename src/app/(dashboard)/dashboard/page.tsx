import { fetchCostSummary, fetchRequestVolume } from "@/lib/dashboard/queries";

// ISR: revalidate every 5 minutes — matches pg_cron refresh interval
export const revalidate = 300;

export default async function DashboardPage() {
  const [costData, volumeData] = await Promise.all([
    fetchCostSummary("30d"),
    fetchRequestVolume("30d"),
  ]);

  const totalCost = costData.reduce((acc, r) => acc + r.total_cost, 0);
  const totalRequests = volumeData.reduce((acc, r) => acc + r.total_requests, 0);
  const errorRate =
    totalRequests > 0
      ? (volumeData.reduce((acc, r) => acc + r.error_requests, 0) / totalRequests) * 100
      : 0;
  const fallbackRate =
    totalRequests > 0
      ? (volumeData.reduce((acc, r) => acc + r.fallback_requests, 0) / totalRequests) * 100
      : 0;

  const stats = [
    {
      label: "Total Cost (30d)",
      value: `$${totalCost.toFixed(4)}`,
      description: "Across all providers",
    },
    {
      label: "Total Requests (30d)",
      value: totalRequests.toLocaleString(),
      description: "10K seed data",
    },
    {
      label: "Error Rate",
      value: `${errorRate.toFixed(1)}%`,
      description: "Errors / total requests",
    },
    {
      label: "Fallback Rate",
      value: `${fallbackRate.toFixed(1)}%`,
      description: "Provider fallbacks",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{stat.label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stat.value}</p>
          <p className="mt-0.5 text-xs text-gray-400">{stat.description}</p>
        </div>
      ))}
    </div>
  );
}
