"use client";

import { useState, useTransition } from "react";
import { createAlertRule, testWebhook } from "@/app/actions/alerts";

const METRIC_OPTIONS = [
  { value: "cost_per_window", label: "Cost per window ($)" },
  { value: "p95_latency_ms", label: "p95 Latency (ms)" },
  { value: "error_rate_pct", label: "Error rate (%)" },
  { value: "eval_score_avg", label: "Average eval score" },
];

const WINDOW_OPTIONS = [
  { value: "5", label: "5 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "60", label: "1 hour" },
];

export function AlertRuleForm({ onCreated }: { onCreated?: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [testResult, setTestResult] = useState<"idle" | "testing" | "success" | "failed">("idle");
  const [webhookUrl, setWebhookUrl] = useState("");

  async function handleTestWebhook() {
    if (!webhookUrl) return;
    setTestResult("testing");
    const result = await testWebhook(webhookUrl);
    setTestResult(result.success ? "success" : "failed");
  }

  return (
    <form
      action={(formData: FormData) => {
        startTransition(async () => {
          await createAlertRule(formData);
          onCreated?.();
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Rule name</label>
          <input
            name="name"
            type="text"
            placeholder="e.g. Cost Spike Alert"
            className="w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Metric</label>
          <select
            name="metric"
            required
            className="w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {METRIC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Threshold value</label>
          <input
            name="threshold_value"
            type="number"
            step="0.01"
            required
            placeholder="e.g. 5000"
            className="w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Window</label>
          <select
            name="window_minutes"
            className="w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {WINDOW_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Cooldown (minutes)</label>
          <input
            name="cooldown_minutes"
            type="number"
            defaultValue="60"
            min="5"
            className="w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Webhook URL</label>
        <div className="flex gap-2">
          <input
            name="webhook_url"
            type="url"
            required
            placeholder="https://hooks.example.com/alerts"
            className="flex-1 rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <button
            type="button"
            onClick={handleTestWebhook}
            disabled={!webhookUrl || testResult === "testing"}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {testResult === "testing"
              ? "Testing..."
              : testResult === "success"
                ? "OK"
                : testResult === "failed"
                  ? "Failed"
                  : "Test"}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Webhook secret{" "}
          <span className="font-normal text-slate-400">(optional -- for HMAC signing)</span>
        </label>
        <input
          name="webhook_secret"
          type="password"
          placeholder="Your webhook signing secret"
          className="w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      <input type="hidden" name="threshold_type" value="absolute" />

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? "Creating..." : "Create Rule"}
      </button>
    </form>
  );
}
