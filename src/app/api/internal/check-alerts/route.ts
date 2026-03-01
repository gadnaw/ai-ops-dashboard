import { runAlertCheck } from "@/lib/alerts/check";
import { dispatchWebhook } from "@/lib/alerts/dispatch";

export async function POST(request: Request) {
  const secret = request.headers.get("x-internal-secret");
  if (secret !== process.env.INTERNAL_CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const firedAlerts = await runAlertCheck();

  if (firedAlerts.length === 0) {
    return Response.json({ fired: 0 });
  }

  const dispatches = await Promise.allSettled(firedAlerts.map((alert) => dispatchWebhook(alert)));

  const succeeded = dispatches.filter((r) => r.status === "fulfilled").length;
  const failed = dispatches.filter((r) => r.status === "rejected").length;

  return Response.json({
    fired: firedAlerts.length,
    dispatched: succeeded,
    dispatchFailed: failed,
  });
}
