import { RequestVolumeChartLazy } from "@/components/charts/lazy";
import { fetchRequestVolume, getTimeRangeFromCookies } from "@/lib/dashboard/queries";

export const revalidate = 300;

export default async function RequestsPanel() {
  const timeRange = await getTimeRangeFromCookies();
  const data = await fetchRequestVolume(timeRange);
  return <RequestVolumeChartLazy data={data} />;
}
