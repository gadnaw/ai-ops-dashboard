import { ModelPieChartLazy } from "@/components/charts/lazy";
import { fetchDailyModelBreakdown, getTimeRangeFromCookies } from "@/lib/dashboard/queries";

export const revalidate = 300;

export default async function ModelsPanel() {
  const timeRange = await getTimeRangeFromCookies();
  const data = await fetchDailyModelBreakdown(timeRange);
  return <ModelPieChartLazy data={data} />;
}
