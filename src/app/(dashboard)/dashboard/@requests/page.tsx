import dynamic from "next/dynamic";
import { fetchRequestVolume, getTimeRangeFromCookies } from "@/lib/dashboard/queries";

export const revalidate = 300;

// Dynamic import with ssr: false — prevents ResponsiveContainer SSR zero-dimension failure
const RequestVolumeChart = dynamic(
  () => import("@/components/charts/RequestVolumeChart").then((m) => m.RequestVolumeChart),
  {
    ssr: false,
    loading: () => <div className="h-[300px] animate-pulse rounded bg-gray-100" />,
  }
);

export default async function RequestsPanel() {
  const timeRange = await getTimeRangeFromCookies();
  const data = await fetchRequestVolume(timeRange);
  return <RequestVolumeChart data={data} />;
}
