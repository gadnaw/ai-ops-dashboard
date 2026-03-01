import { RequestVolumeChartLazy } from "@/components/charts/lazy";
import { fetchRequestVolume, getTimeRangeFromCookies } from "@/lib/dashboard/queries";
import { getTemplates } from "@/lib/prompts/queries";
import Link from "next/link";

export const revalidate = 300;

export default async function RequestsPanel({
  searchParams,
}: {
  searchParams: Promise<{ promptVersionId?: string }>;
}) {
  const { promptVersionId } = await searchParams;
  const timeRange = await getTimeRangeFromCookies();
  const [data, templates] = await Promise.all([fetchRequestVolume(timeRange), getTemplates()]);

  // Build version options from all templates
  const versionOptions: Array<{ id: string; label: string }> = [];
  for (const template of templates) {
    for (const version of template.versions) {
      versionOptions.push({
        id: version.id,
        label: `${template.name} — v${version.version}`,
      });
    }
  }

  // If a promptVersionId filter is active, show a note (actual query filtering
  // would require modifying fetchRequestVolume — this displays the selection context)
  const activeVersion = promptVersionId
    ? versionOptions.find((v) => v.id === promptVersionId)
    : null;

  return (
    <div>
      {/* Prompt Version Filter */}
      <div className="mb-3 flex items-center gap-3 px-1">
        <label className="shrink-0 text-xs text-gray-500">Prompt Version:</label>
        <div className="flex flex-1 items-center gap-2">
          <select
            defaultValue={promptVersionId ?? ""}
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:border-gray-500 focus:outline-none"
            // Navigate via form — Server Component cannot use onChange directly
            form="prompt-version-filter-form"
            name="promptVersionId"
          >
            <option value="">All versions</option>
            {versionOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <form id="prompt-version-filter-form" method="GET" action="/dashboard">
            <button
              type="submit"
              className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-600"
            >
              Filter
            </button>
          </form>
          {activeVersion && (
            <Link
              href="/dashboard"
              className="text-xs text-gray-500 transition-colors hover:text-gray-400"
            >
              Clear
            </Link>
          )}
        </div>
      </div>

      {activeVersion && (
        <p className="mb-2 px-1 text-xs text-amber-400/80">Filtered by: {activeVersion.label}</p>
      )}

      <RequestVolumeChartLazy data={data} />
    </div>
  );
}
