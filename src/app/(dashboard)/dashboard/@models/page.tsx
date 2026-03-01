import dynamic from "next/dynamic";
import { fetchDailyModelBreakdown, getTimeRangeFromCookies } from "@/lib/dashboard/queries";

export const revalidate = 300;

// Dynamic import with ssr: false — prevents ResponsiveContainer SSR zero-dimension failure
const ModelPieChart = dynamic(
  () => import("@/components/charts/ModelPieChart").then((m) => m.ModelPieChart),
  {
    ssr: false,
    loading: () => <div className="h-[300px] animate-pulse rounded bg-gray-100" />,
  }
);

export default async function ModelsPanel() {
  const timeRange = await getTimeRangeFromCookies();
  const data = await fetchDailyModelBreakdown(timeRange);
  return <ModelPieChart data={data} />;
}
