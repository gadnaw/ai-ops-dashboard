import dynamic from "next/dynamic";
import { fetchCostSummary } from "@/lib/dashboard/queries";

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
  const data = await fetchCostSummary("7d");
  return <CostTrendChart data={data} />;
}
