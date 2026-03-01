/**
 * Server-side Prisma query functions for prompt templates and versions.
 * All functions are async and return typed Prisma results.
 * These are NOT Server Actions — they are plain async functions called
 * from Server Actions or Route Handlers.
 */

import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Types re-exported for convenience in higher layers
// ---------------------------------------------------------------------------
export type { PromptTemplate, PromptVersion } from "@prisma/client";

// ---------------------------------------------------------------------------
// Template queries
// ---------------------------------------------------------------------------

/**
 * Return all templates with their active version included.
 * Ordered by creation time descending (newest first).
 */
export async function getTemplates() {
  return prisma.promptTemplate.findMany({
    include: {
      activeVersion: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Return a single template by slug with its active version.
 * Returns null if not found.
 */
export async function getTemplateBySlug(slug: string) {
  return prisma.promptTemplate.findUnique({
    where: { slug },
    include: {
      activeVersion: true,
    },
  });
}

/**
 * Return a template with ALL its versions ordered by version number descending.
 * Includes the active version reference.
 */
export async function getTemplateWithVersions(id: string) {
  return prisma.promptTemplate.findUnique({
    where: { id },
    include: {
      activeVersion: true,
      versions: {
        orderBy: { version: "desc" },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Version queries
// ---------------------------------------------------------------------------

/**
 * Return a single prompt version by ID.
 * Includes the parent template for context.
 * Returns null if not found.
 */
export async function getVersion(id: string) {
  return prisma.promptVersion.findUnique({
    where: { id },
    include: {
      template: true,
    },
  });
}

/**
 * Return a specific version by template ID and version number.
 * Used by the rollback endpoint to verify the target version exists.
 * Returns null if not found.
 */
export async function getVersionByNumber(templateId: string, version: number) {
  return prisma.promptVersion.findUnique({
    where: {
      templateId_version: { templateId, version },
    },
  });
}

/**
 * Return the two most recent versions of a template for diff comparison.
 * Returns [newer, older] — index 0 is the higher version number.
 * Returns fewer entries if fewer than 2 versions exist.
 */
export async function getTwoVersionsForDiff(templateId: string) {
  return prisma.promptVersion.findMany({
    where: { templateId },
    orderBy: { version: "desc" },
    take: 2,
  });
}
