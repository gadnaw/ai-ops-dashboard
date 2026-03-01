import { CostTrendChartLazy } from "@/components/charts/lazy";
import { fetchCostSummary, getTimeRangeFromCookies } from "@/lib/dashboard/queries";

export const revalidate = 300;

export default async function CostPanel() {
  const timeRange = await getTimeRangeFromCookies();
  const data = await fetchCostSummary(timeRange);
  return <CostTrendChartLazy data={data} />;
}
