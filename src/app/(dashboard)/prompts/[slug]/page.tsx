// app/(dashboard)/prompts/[slug]/page.tsx
// Server Component — no "use client"
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTemplateWithVersionsBySlug } from "@/lib/prompts/queries";
import { VersionList } from "@/components/prompts/VersionList";

export const dynamic = "force-dynamic";

export default async function PromptTemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const template = await getTemplateWithVersionsBySlug(slug);

  if (!template) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
            <Link href="/prompts" className="transition-colors hover:text-gray-300">
              Prompt Templates
            </Link>
            <span>/</span>
            <span className="text-gray-300">{template.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{template.name}</h1>
          <p className="mt-1 font-mono text-sm text-gray-400">{template.slug}</p>
          {template.description && (
            <p className="mt-2 text-sm text-gray-400">{template.description}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-3">
          {template.activeVersion && (
            <Link
              href={`/playground?promptVersionId=${template.activeVersion.id}`}
              className="rounded-md bg-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-600"
            >
              Test in Playground
            </Link>
          )}
          <Link
            href={`/prompts/${template.slug}/new-version`}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-500"
          >
            New Version
          </Link>
        </div>
      </div>

      {/* Active version preview */}
      {template.activeVersion && (
        <div className="mb-6 rounded-lg border border-green-800/40 bg-green-950/20 p-4">
          <div className="mb-2 text-xs font-medium text-green-400">
            Active Version — v{template.activeVersion.version}
          </div>
          <pre className="line-clamp-3 font-mono text-sm whitespace-pre-wrap text-gray-300">
            {template.activeVersion.content}
          </pre>
        </div>
      )}

      {/* Version history */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">
          Version History
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({template.versions.length} version{template.versions.length !== 1 ? "s" : ""})
          </span>
        </h2>
        <VersionList
          templateId={template.id}
          templateSlug={template.slug}
          versions={template.versions}
          activeVersionId={template.activeVersionId}
        />
      </div>
    </div>
  );
}
