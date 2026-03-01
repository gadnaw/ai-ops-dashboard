import { prisma } from "@/lib/db/prisma";

export interface FiredAlert {
  ruleId: string;
  ruleName: string;
  metric: string;
  currentValue: number;
  thresholdValue: number;
  webhookUrl: string;
  webhookSecret: string | null;
}

/**
 * Calls the check_alert_rules() PL/pgSQL function.
 * Returns rules that fired (threshold exceeded and not in cooldown).
 * Cooldown enforcement happens inside the SQL function via last_fired_at update.
 */
export async function runAlertCheck(): Promise<FiredAlert[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      rule_id: string;
      rule_name: string;
      metric: string;
      current_value: number;
      threshold_value: number;
      webhook_url: string;
      webhook_secret: string | null;
    }>
  >`SELECT * FROM check_alert_rules()`;

  return rows.map((r) => ({
    ruleId: r.rule_id,
    ruleName: r.rule_name,
    metric: r.metric,
    currentValue: Number(r.current_value),
    thresholdValue: Number(r.threshold_value),
    webhookUrl: r.webhook_url,
    webhookSecret: r.webhook_secret,
  }));
}
