import dynamic from "next/dynamic";
import { fetchCostSummary, getTimeRangeFromCookies } from "@/lib/dashboard/queries";

export const revalidate = 300;

// Dynamic import with ssr: false — prevents ResponsiveContainer SSR zero-dimension failure
const CostTrendChart = dynamic(
  () => import("@/components/charts/CostTrendChart").then((m) => m.CostTrendChart),
  {
    ssr: false,
    loading: () => <div className="h-[300px] animate-pulse rounded bg-gray-100" />,
  }
);

export default async function CostPanel() {
  const timeRange = await getTimeRangeFromCookies();
  const data = await fetchCostSummary(timeRange);
  return <CostTrendChart data={data} />;
}
