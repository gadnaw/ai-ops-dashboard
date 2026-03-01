import { rollbackToVersion } from "@/lib/prompts/actions";
import { getTemplateWithVersions } from "@/lib/prompts/queries";
import type { NextRequest } from "next/server";

/**
 * POST /api/v1/prompts/[id]/rollback
 * Roll back a template's active version to a specified prior version.
 *
 * The [id] parameter is the template ID.
 *
 * Body:
 *   { versionId: string }  — the prompt_versions.id to make active
 *
 * This operation is atomic — only active_version_id is updated.
 * Version content is immutable (enforced by DB trigger).
 * The model router reads active_version_id on the next request.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: templateId } = await params;

  if (!templateId) {
    return Response.json({ error: "Template ID is required" }, { status: 400 });
  }

  let body: { versionId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.versionId?.trim()) {
    return Response.json({ error: "versionId is required" }, { status: 400 });
  }

  const result = await rollbackToVersion(templateId, body.versionId);

  if ("error" in result) {
    const status = result.error.includes("not found") ? 404 : 500;
    return Response.json({ error: result.error }, { status });
  }

  // Return the updated template with all versions for the caller's convenience
  const template = await getTemplateWithVersions(templateId);

  return Response.json({
    success: true,
    activeVersionId: result.data.activeVersionId,
    template,
  });
}
