"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/guards";

interface UpdateEndpointConfigInput {
  endpointName: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string | null;
  primaryModel: string;
  fallbackChain: string[];
}

export async function updateEndpointConfig(
  input: UpdateEndpointConfigInput
): Promise<{ success: true } | { error: string }> {
  // CONFIG-01: requires DEVELOPER or ADMIN role to modify routing config
  try {
    await requireRole("DEVELOPER");
  } catch {
    return { error: "Insufficient permissions. Developer or Admin role required." };
  }

  // Validate temperature range
  if (input.temperature < 0 || input.temperature > 2) {
    return { error: "Temperature must be between 0 and 2" };
  }

  // Validate maxTokens range
  if (input.maxTokens < 1 || input.maxTokens > 100000) {
    return { error: "Max tokens must be between 1 and 100,000" };
  }

  await prisma.endpointConfig.update({
    where: { endpointName: input.endpointName },
    data: {
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      systemPrompt: input.systemPrompt ?? null,
      primaryModel: input.primaryModel,
      fallbackChain: input.fallbackChain,
    },
  });

  // Revalidate the config page to reflect updated values
  revalidatePath("/config");

  return { success: true };
}
