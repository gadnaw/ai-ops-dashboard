import type { Prisma } from "@prisma/client";
import { getTemplates } from "@/lib/prompts/queries";
import { createPromptTemplate, createPromptVersion } from "@/lib/prompts/actions";
import type { NextRequest } from "next/server";

/**
 * GET /api/v1/prompts
 * Returns all prompt templates with their active version.
 */
export async function GET() {
  try {
    const templates = await getTemplates();
    return Response.json({ templates });
  } catch (err) {
    console.error("[GET /api/v1/prompts] error:", err);
    return Response.json({ error: "Failed to fetch prompt templates" }, { status: 500 });
  }
}

/**
 * POST /api/v1/prompts
 * Create a new prompt template, optionally with an initial version.
 *
 * Body:
 *   { slug, name, description?, initialContent?, systemPrompt?, modelConfig? }
 */
export async function POST(request: NextRequest) {
  let body: {
    slug?: string;
    name?: string;
    description?: string;
    initialContent?: string;
    systemPrompt?: string;
    modelConfig?: Prisma.InputJsonValue;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.slug?.trim()) {
    return Response.json({ error: "slug is required" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  // Create the template
  const templateResult = await createPromptTemplate({
    slug: body.slug,
    name: body.name,
    ...(body.description ? { description: body.description } : {}),
  });

  if ("error" in templateResult) {
    const status = templateResult.error.includes("already exists") ? 409 : 500;
    return Response.json({ error: templateResult.error }, { status });
  }

  const template = templateResult.data;

  // If initial content provided, create v1
  if (body.initialContent?.trim()) {
    const versionResult = await createPromptVersion({
      templateId: template.id,
      content: body.initialContent,
      ...(body.systemPrompt ? { systemPrompt: body.systemPrompt } : {}),
      ...(body.modelConfig ? { modelConfig: body.modelConfig } : {}),
    });

    if ("error" in versionResult) {
      // Template was created but version failed — return partial success
      return Response.json({ template, versionError: versionResult.error }, { status: 201 });
    }

    return Response.json({ template, version: versionResult.data }, { status: 201 });
  }

  return Response.json({ template }, { status: 201 });
}
