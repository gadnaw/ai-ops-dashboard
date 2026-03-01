// app/(dashboard)/prompts/[slug]/new-version/page.tsx
// Server Component — no "use client"
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTemplateWithVersionsBySlug } from "@/lib/prompts/queries";
import { NewVersionForm } from "@/components/prompts/NewVersionForm";

export const dynamic = "force-dynamic";

export default async function NewVersionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const template = await getTemplateWithVersionsBySlug(slug);

  if (!template) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/prompts" className="transition-colors hover:text-gray-300">
            Prompt Templates
          </Link>
          <span>/</span>
          <Link
            href={`/prompts/${template.slug}`}
            className="transition-colors hover:text-gray-300"
          >
            {template.name}
          </Link>
          <span>/</span>
          <span className="text-gray-300">New Version</span>
        </div>
        <h1 className="text-2xl font-bold text-white">New Version</h1>
        <p className="mt-1 text-sm text-gray-400">
          Content is immutable once saved — each save creates a new numbered version.
          {template.versions.length > 0 && (
            <span className="text-gray-500">
              {" "}
              Next version will be v{(template.versions[0]?.version ?? 0) + 1}.
            </span>
          )}
        </p>
      </div>

      <NewVersionForm templateId={template.id} templateSlug={template.slug} />
    </div>
  );
}
