import type { PrismaClient } from "@prisma/client";

/**
 * Seed alert rules and alert history.
 * Creates 3 default alert rules and 3 history events telling the day-15 incident story:
 * - Cost spike on day 15 (resolved)
 * - Latency regression on day 15 (resolved)
 * - Recent error rate alert (acknowledged, not yet resolved)
 * Idempotent: skips if alert_rules already has data.
 */
export async function seedAlerts(prisma: PrismaClient): Promise<void> {
  const existingRuleCount = await prisma.alertRule.count();
  if (existingRuleCount > 0) {
    console.log("  alert_rules already seeded -- skipping");
    return;
  }

  // Calculate dates relative to seed start (30 days ago)
  const now = new Date();
  const seedStart = new Date(now);
  seedStart.setDate(seedStart.getDate() - 30);
  seedStart.setHours(0, 0, 0, 0);

  // Day 15 = seedStart + 14 days
  const day15 = new Date(seedStart);
  day15.setDate(day15.getDate() + 14);

  // Recent = 2 days ago
  const recentDate = new Date(now);
  recentDate.setDate(recentDate.getDate() - 2);

  // Create 3 default alert rules
  const [costRule, latencyRule, errorRule] = await Promise.all([
    prisma.alertRule.create({
      data: {
        name: "Cost Spike Alert",
        metric: "cost_per_window",
        thresholdType: "relative_daily_avg",
        thresholdValue: 2.0, // Fire when cost is 2x the hourly average
        windowMinutes: 60,
        cooldownMinutes: 120,
        webhookUrl: "https://placeholder-webhook.example.com/alerts",
        isActive: true,
        lastFiredAt: new Date(day15.getTime() + 16 * 60 * 60 * 1000), // day15 4pm
      },
    }),
    prisma.alertRule.create({
      data: {
        name: "High Latency Alert",
        metric: "p95_latency_ms",
        thresholdType: "absolute",
        thresholdValue: 5000, // p95 > 5 seconds
        windowMinutes: 15,
        cooldownMinutes: 60,
        webhookUrl: "https://placeholder-webhook.example.com/alerts",
        isActive: true,
        lastFiredAt: new Date(day15.getTime() + 16 * 60 * 60 * 1000 + 5 * 60 * 1000), // day15 4:05pm
      },
    }),
    prisma.alertRule.create({
      data: {
        name: "Error Rate Alert",
        metric: "error_rate_pct",
        thresholdType: "absolute",
        thresholdValue: 5.0, // > 5% error rate
        windowMinutes: 15,
        cooldownMinutes: 60,
        webhookUrl: "https://placeholder-webhook.example.com/alerts",
        isActive: true,
        lastFiredAt: new Date(recentDate.getTime() + 9 * 60 * 60 * 1000 + 15 * 60 * 1000), // 9:15am
      },
    }),
  ]);

  console.log("  Created 3 alert rules (cost, latency, error rate)");

  // Create day-15 incident alert history
  // Story: Cost spike triggered at 2:32 PM, latency followed at 2:35 PM, both resolved by 4 PM
  await Promise.all([
    prisma.alertHistory.create({
      data: {
        ruleId: costRule.id,
        triggeredAt: new Date(day15.getTime() + 14 * 60 * 60 * 1000 + 32 * 60 * 1000), // 2:32 PM
        metricValue: 4.2, // 4.2x daily average (2x threshold exceeded)
        thresholdValue: 2.0,
        status: "resolved",
        acknowledgedAt: new Date(day15.getTime() + 14 * 60 * 60 * 1000 + 45 * 60 * 1000), // 2:45 PM
        resolvedAt: new Date(day15.getTime() + 16 * 60 * 60 * 1000), // 4:00 PM
        resolverNote: "Prompt bug causing 10x token usage fixed and deployed",
        webhookStatusCode: 200,
        webhookAttempts: 1,
      },
    }),
    prisma.alertHistory.create({
      data: {
        ruleId: latencyRule.id,
        triggeredAt: new Date(day15.getTime() + 14 * 60 * 60 * 1000 + 35 * 60 * 1000), // 2:35 PM
        metricValue: 7800, // p95 latency 7.8 seconds
        thresholdValue: 5000,
        status: "resolved",
        acknowledgedAt: new Date(day15.getTime() + 14 * 60 * 60 * 1000 + 47 * 60 * 1000), // 2:47 PM
        resolvedAt: new Date(day15.getTime() + 16 * 60 * 60 * 1000 + 5 * 60 * 1000), // 4:05 PM
        resolverNote: "Correlated with cost spike -- resolved after prompt fix",
        webhookStatusCode: 200,
        webhookAttempts: 1,
      },
    }),
    // A recent unresolved alert for demo (shows active alert state)
    prisma.alertHistory.create({
      data: {
        ruleId: errorRule.id,
        triggeredAt: new Date(recentDate.getTime() + 9 * 60 * 60 * 1000 + 15 * 60 * 1000), // 9:15 AM
        metricValue: 7.3, // 7.3% error rate (5% threshold)
        thresholdValue: 5.0,
        status: "acknowledged",
        acknowledgedAt: new Date(recentDate.getTime() + 9 * 60 * 60 * 1000 + 20 * 60 * 1000), // 9:20 AM
        webhookStatusCode: 200,
        webhookAttempts: 2, // Needed one retry
      },
    }),
  ]);

  console.log(
    "  Created 3 alert history events (cost spike + latency: resolved, error rate: acknowledged)"
  );
}
