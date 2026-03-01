"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function acknowledgeAlert(
  alertHistoryId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return { error: "Unauthorized -- must be logged in" };
    }

    await prisma.alertHistory.update({
      where: { id: alertHistoryId },
      data: {
        status: "acknowledged",
        acknowledgedAt: new Date(),
      },
    });

    revalidatePath("/alerts");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to acknowledge alert";
    return { error: message };
  }
}

export async function resolveAlert(params: {
  alertHistoryId: string;
  resolverNote?: string;
}): Promise<{ success: true } | { error: string }> {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return { error: "Unauthorized -- must be logged in" };
    }

    await prisma.alertHistory.update({
      where: { id: params.alertHistoryId },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        resolverNote: params.resolverNote ?? null,
      },
    });

    revalidatePath("/alerts");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve alert";
    return { error: message };
  }
}

export async function createAlertRule(
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return { error: "Unauthorized -- must be logged in" };
    }

    const metric = formData.get("metric") as string;
    const thresholdType = (formData.get("threshold_type") as string) ?? "absolute";
    const thresholdValue = parseFloat(formData.get("threshold_value") as string);
    const windowMinutes = parseInt(formData.get("window_minutes") as string, 10);
    const cooldownMinutes = parseInt(formData.get("cooldown_minutes") as string, 10);
    const webhookUrl = formData.get("webhook_url") as string;
    const webhookSecret = (formData.get("webhook_secret") as string) || null;
    const name = formData.get("name") as string;

    if (!metric || !webhookUrl || isNaN(thresholdValue)) {
      return { error: "Missing required fields: metric, threshold_value, webhook_url" };
    }

    await prisma.alertRule.create({
      data: {
        name: name || `${metric} alert`,
        metric,
        thresholdType,
        thresholdValue,
        windowMinutes: isNaN(windowMinutes) ? 15 : windowMinutes,
        cooldownMinutes: isNaN(cooldownMinutes) ? 60 : cooldownMinutes,
        webhookUrl,
        ...(webhookSecret ? { webhookSecret } : {}),
      },
    });

    revalidatePath("/alerts/rules");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create alert rule";
    return { error: message };
  }
}

export async function toggleAlertRule(
  ruleId: string,
  isActive: boolean
): Promise<{ success: true } | { error: string }> {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return { error: "Unauthorized -- must be logged in" };
    }

    await prisma.alertRule.update({
      where: { id: ruleId },
      data: { isActive },
    });

    revalidatePath("/alerts/rules");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to toggle alert rule";
    return { error: message };
  }
}

export async function deleteAlertRule(
  ruleId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return { error: "Unauthorized -- must be logged in" };
    }

    await prisma.alertRule.delete({
      where: { id: ruleId },
    });

    revalidatePath("/alerts/rules");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete alert rule";
    return { error: message };
  }
}

export async function testWebhook(
  webhookUrl: string
): Promise<{ success: boolean; status: number }> {
  try {
    const testPayload = JSON.stringify({
      event: "alert.test",
      message: "Test webhook from AI Ops Dashboard",
      sent_at: new Date().toISOString(),
    });

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: testPayload,
      signal: controller.signal,
    });

    return { success: response.ok, status: response.status };
  } catch {
    return { success: false, status: 0 };
  }
}
