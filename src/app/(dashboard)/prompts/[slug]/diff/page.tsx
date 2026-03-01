// app/(dashboard)/prompts/[slug]/diff/page.tsx
// Server Component — no "use client"
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTwoVersionsByIds, getTemplateBySlug } from "@/lib/prompts/queries";
import { SideBySideDiff } from "@/components/prompts/DiffViewer";

export const dynamic = "force-dynamic";

export default async function DiffPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ v1?: string; v2?: string }>;
}) {
  const { slug } = await params;
  const { v1: v1Id, v2: v2Id } = await searchParams;

  if (!v1Id || !v2Id) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-red-400">Missing version IDs. Use ?v1=ID&amp;v2=ID query params.</p>
      </div>
    );
  }

  const template = await getTemplateBySlug(slug);
  if (!template) notFound();

  let v1: { id: string; version: number; content: string; systemPrompt: string | null };
  let v2: { id: string; version: number; content: string; systemPrompt: string | null };

  try {
    ({ v1, v2 } = await getTwoVersionsByIds(v1Id, v2Id));
  } catch {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-red-400">One or both versions not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/prompts" className="transition-colors hover:text-gray-300">
          Prompt Templates
        </Link>
        <span>/</span>
        <Link href={`/prompts/${slug}`} className="transition-colors hover:text-gray-300">
          {template.name}
        </Link>
        <span>/</span>
        <span className="text-gray-300">
          Diff v{v1.version} vs v{v2.version}
        </span>
      </div>

      <h1 className="mb-2 text-xl font-bold text-white">
        Comparing v{v1.version} &rarr; v{v2.version}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Character-level diff. Green = additions. Red = removals.
        {v1.content.length + v2.content.length > 5000 && (
          <span className="ml-1 text-amber-500/80">Word-level diff used (content &gt;5KB).</span>
        )}
      </p>

      <SideBySideDiff v1={v1} v2={v2} />

      {/* System prompt diff if they differ */}
      {v1.systemPrompt !== v2.systemPrompt && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-gray-400">System Prompt Changes</h2>
          <SideBySideDiff
            v1={{ version: v1.version, content: v1.systemPrompt ?? "" }}
            v2={{ version: v2.version, content: v2.systemPrompt ?? "" }}
          />
        </div>
      )}
    </div>
  );
}
