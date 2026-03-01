// app/(dashboard)/playground/page.tsx
// Server Component — fetches templates server-side, passes as props to Client Island.
// No "use client" directive.
import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { PlaygroundForm } from "@/components/playground/PlaygroundForm";

export const dynamic = "force-dynamic";

export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ promptVersionId?: string }>;
}) {
  // Next.js 16: searchParams is a Promise — must await it.
  const { promptVersionId } = await searchParams;

  // Fetch all templates with their full version content server-side.
  // We include all versions (not just the latest) so the PromptVersionPicker
  // can display and switch between versions in the Client Island.
  const templates = await prisma.promptTemplate.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      activeVersionId: true,
      versions: {
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          content: true,
          systemPrompt: true,
          variables: true,
        },
      },
    },
  });

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Playground</h1>
          <p className="mt-1 text-sm text-gray-400">
            Test prompt versions with live streaming. Requests are logged to the dashboard.
          </p>
        </div>
        <Link
          href="/prompts"
          className="text-sm text-blue-400 transition-colors hover:text-blue-300"
        >
          Manage Templates &rarr;
        </Link>
      </div>

      {/* Playground form — Client Island */}
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-gray-500">Loading playground...</p>
          </div>
        }
      >
        <div className="flex-1">
          <PlaygroundForm
            templates={templates}
            {...(promptVersionId ? { initialVersionId: promptVersionId } : {})}
          />
        </div>
      </Suspense>
    </div>
  );
}
