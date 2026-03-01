// app/(dashboard)/prompts/page.tsx
// Server Component — no "use client"
import Link from "next/link";
import { getTemplates } from "@/lib/prompts/queries";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const templates = await getTemplates();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Prompt Templates</h1>
          <p className="mt-1 text-sm text-gray-400">
            Version-controlled prompt templates for all endpoints
          </p>
        </div>
        <Link
          href="/prompts/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500"
        >
          New Template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <p className="mb-2 text-lg">No prompt templates yet</p>
          <p className="text-sm">Create your first template to start versioning prompts.</p>
          <Link
            href="/prompts/new"
            className="mt-4 inline-block text-sm text-blue-400 hover:text-blue-300"
          >
            Create a template &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => {
            const latestVersion = template.versions[0];
            const activeVersionNum = template.activeVersion?.version;

            return (
              <Link
                key={template.id}
                href={`/prompts/${template.slug}`}
                className="block rounded-lg border border-gray-700 bg-gray-800/60 p-4 transition-colors hover:border-gray-500 hover:bg-gray-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h2 className="font-medium text-white">{template.name}</h2>
                      <span className="rounded bg-gray-700/60 px-1.5 py-0.5 font-mono text-xs text-gray-500">
                        {template.slug}
                      </span>
                    </div>
                    {template.description && (
                      <p className="mt-1 text-sm text-gray-400">{template.description}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {activeVersionNum !== undefined ? (
                      <div className="font-mono text-xs text-green-400">
                        v{activeVersionNum} active
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">No active version</div>
                    )}
                    {latestVersion && (
                      <div className="mt-0.5 text-xs text-gray-600">
                        latest: v{latestVersion.version}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
