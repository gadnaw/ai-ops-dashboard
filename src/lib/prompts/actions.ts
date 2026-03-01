"use server";

/**
 * Server Actions for prompt template and version management.
 *
 * All actions return a discriminated union:
 *   { success: true; data: T } | { error: string }
 *
 * Use `'error' in result` (not `result.error`) to narrow the union in callers.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { extractVariables } from "@/lib/prompts/variables";

// ---------------------------------------------------------------------------
// Template actions
// ---------------------------------------------------------------------------

export interface CreateTemplateInput {
  slug: string;
  name: string;
  description?: string;
  createdBy?: string;
}

/**
 * Create a new prompt template.
 * Slug must be unique — returns error if it already exists.
 */
export async function createPromptTemplate(input: CreateTemplateInput): Promise<
  | {
      success: true;
      data: {
        id: string;
        slug: string;
        name: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
      };
    }
  | { error: string }
> {
  try {
    const template = await prisma.promptTemplate.create({
      data: {
        slug: input.slug.trim().toLowerCase(),
        name: input.name.trim(),
        ...(input.description ? { description: input.description.trim() } : {}),
        ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { success: true, data: template };
  } catch (err: unknown) {
    // Prisma unique constraint violation code
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      return { error: `A template with slug "${input.slug}" already exists.` };
    }
    console.error("[createPromptTemplate] error:", err);
    return { error: "Failed to create prompt template." };
  }
}

/**
 * Delete a prompt template and all its versions (cascade).
 * This is permanent — versions cannot be recovered.
 */
export async function deletePromptTemplate(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await prisma.promptTemplate.delete({ where: { id } });
    return { success: true };
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2025") {
      return { error: "Template not found." };
    }
    console.error("[deletePromptTemplate] error:", err);
    return { error: "Failed to delete prompt template." };
  }
}

// ---------------------------------------------------------------------------
// Version actions
// ---------------------------------------------------------------------------

export interface CreateVersionInput {
  templateId: string;
  content: string;
  systemPrompt?: string;
  modelConfig?: Prisma.InputJsonValue;
  createdBy?: string;
}

/**
 * Create a new version for a template and make it the active version.
 *
 * Version number is assigned by the PostgreSQL trigger (per-template
 * auto-increment with advisory lock — no race conditions possible).
 * Variables are extracted from {{var}} patterns in content.
 *
 * This operation is atomic: version creation + active_version_id update
 * happen in a single transaction.
 */
export async function createPromptVersion(input: CreateVersionInput): Promise<
  | {
      success: true;
      data: {
        id: string;
        templateId: string;
        version: number;
        variables: unknown;
        createdAt: Date;
      };
    }
  | { error: string }
> {
  try {
    const variables = extractVariables(input.content);

    const version = await prisma.$transaction(async (tx) => {
      // Create version — trigger assigns version number
      const v = await tx.promptVersion.create({
        data: {
          templateId: input.templateId,
          version: 0, // placeholder — trigger overwrites this before INSERT
          content: input.content,
          ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
          modelConfig: (input.modelConfig ?? {}) as Prisma.InputJsonValue,
          variables: variables,
          ...(input.createdBy ? { createdBy: input.createdBy } : {}),
        },
        select: {
          id: true,
          templateId: true,
          version: true,
          variables: true,
          createdAt: true,
        },
      });

      // Make this version the active version on the template
      await tx.promptTemplate.update({
        where: { id: input.templateId },
        data: { activeVersionId: v.id },
      });

      return v;
    });

    return { success: true, data: version };
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2025") {
      return { error: "Template not found." };
    }
    console.error("[createPromptVersion] error:", err);
    return { error: "Failed to create prompt version." };
  }
}

/**
 * Roll back a template's active version to a prior version.
 *
 * This is an atomic single-field update — it only changes
 * `prompt_templates.active_version_id`. The version's content
 * is immutable (enforced by DB trigger), so rollback is safe.
 *
 * The model router reads active_version_id on the next request.
 */
export async function rollbackToVersion(
  templateId: string,
  versionId: string
): Promise<
  | {
      success: true;
      data: {
        id: string;
        activeVersionId: string | null;
        updatedAt: Date;
      };
    }
  | { error: string }
> {
  try {
    // Verify the version belongs to this template before rolling back
    const version = await prisma.promptVersion.findFirst({
      where: { id: versionId, templateId },
      select: { id: true },
    });

    if (!version) {
      return {
        error: "Version not found or does not belong to this template.",
      };
    }

    const template = await prisma.promptTemplate.update({
      where: { id: templateId },
      data: { activeVersionId: versionId },
      select: {
        id: true,
        activeVersionId: true,
        updatedAt: true,
      },
    });

    return { success: true, data: template };
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2025") {
      return { error: "Template not found." };
    }
    console.error("[rollbackToVersion] error:", err);
    return { error: "Failed to rollback to version." };
  }
}
