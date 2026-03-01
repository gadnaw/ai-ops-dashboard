// src/app/(dashboard)/experiments/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const revalidate = 0;

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-700",
  stopped: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
};

export default async function ExperimentsPage() {
  const experiments = await prisma.experiment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      variants: { select: { id: true, name: true, isControl: true, trafficWeight: true } },
      _count: { select: { metrics: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">A/B Experiments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sequential testing with SPRT auto-stop at 95% confidence
          </p>
        </div>
      </div>

      {experiments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-12 text-center text-gray-400">
          <p className="text-sm">No experiments yet.</p>
          <p className="mt-1 text-xs">Create an experiment via POST /api/v1/experiments</p>
        </div>
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <Link
              key={exp.id}
              href={`/experiments/${exp.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{exp.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[exp.status] ?? ""}`}
                    >
                      {exp.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                    <span>{exp.variants.length} variants</span>
                    <span>Metric: {exp.primaryMetric}</span>
                    <span>MDE: {exp.mde}</span>
                    {exp.winnerVariantId && (
                      <span className="font-medium text-green-600">Winner determined</span>
                    )}
                  </div>
                </div>
                <span className="text-sm text-gray-300">&rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
