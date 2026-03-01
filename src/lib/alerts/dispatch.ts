import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import type { FiredAlert } from "./check";

interface WebhookPayload {
  event: "alert.triggered";
  rule_id: string;
  rule_name: string;
  metric: string;
  current_value: number;
  threshold_value: number;
  triggered_at: string;
  dashboard_url: string;
}

/**
 * Dispatches a webhook with HMAC-SHA256 signing and 3-attempt exponential backoff.
 * Updates alert_history with webhook delivery status.
 * Non-retryable on 4xx responses (except 429).
 */
export async function dispatchWebhook(alert: FiredAlert): Promise<void> {
  const payload: WebhookPayload = {
    event: "alert.triggered",
    rule_id: alert.ruleId,
    rule_name: alert.ruleName,
    metric: alert.metric,
    current_value: alert.currentValue,
    threshold_value: alert.thresholdValue,
    triggered_at: new Date().toISOString(),
    dashboard_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/alerts`,
  };

  const payloadJson = JSON.stringify(payload);
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Exponential backoff: attempt 0 = immediate, attempt 1 = 2s, attempt 2 = 4s
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt - 1) * 2000));
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Alert-Delivery-Attempt": String(attempt + 1),
        "X-Alert-Rule-Id": alert.ruleId,
      };

      // HMAC-SHA256 signature: t=<unix_timestamp>,v1=<hex_signature>
      // Signed payload: "<timestamp>.<payloadJson>"
      if (alert.webhookSecret) {
        const timestamp = Math.floor(Date.now() / 1000);
        const signedPayload = `${timestamp}.${payloadJson}`;
        const hmac = crypto.createHmac("sha256", alert.webhookSecret);
        hmac.update(signedPayload);
        const signature = hmac.digest("hex");
        headers["X-Alert-Signature"] = `t=${timestamp},v1=${signature}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s timeout

      const response = await fetch(alert.webhookUrl, {
        method: "POST",
        headers,
        body: payloadJson,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Update alert_history delivery status
      await updateAlertHistoryWebhookStatus(alert.ruleId, response.status, attempt + 1);

      if (response.ok) return; // Success

      // Non-retryable: 4xx except 429
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        console.error(
          `Webhook dispatch non-retryable HTTP ${response.status} for rule ${alert.ruleId}`
        );
        return;
      }

      // 5xx or 429 -- retry on next iteration
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      console.error(
        `Webhook dispatch attempt ${attempt + 1} failed for rule ${alert.ruleId}:`,
        isAbort ? "request timeout (10s)" : error
      );
    }
  }

  console.error(`Webhook dispatch exhausted all ${maxAttempts} attempts for rule ${alert.ruleId}`);
}

async function updateAlertHistoryWebhookStatus(
  ruleId: string,
  statusCode: number,
  attempts: number
): Promise<void> {
  // Update the most recent alert_history row for this rule
  await prisma.$executeRaw`
    UPDATE alert_history
    SET webhook_status_code = ${statusCode},
        webhook_attempts = ${attempts}
    WHERE rule_id = ${ruleId}::uuid
      AND triggered_at = (
        SELECT MAX(triggered_at)
        FROM alert_history
        WHERE rule_id = ${ruleId}::uuid
      )
  `;
}
