"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";

type ConnectionStatus = "connecting" | "connected" | "error";

export function RealtimeFeed() {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel("dashboard-events") // Channel name — any string except 'realtime'
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dashboard_events",
          // Subscribe to dashboard_events (not request_logs) — M13 constraint.
          // refresh_complete events trigger router.refresh() to bust ISR cache.
        },
        (payload) => {
          const eventType = (payload.new as { event_type?: string }).event_type;

          if (eventType === "refresh_complete") {
            // M13: Use router.refresh() on Realtime event, not ISR revalidation alone.
            // This tells Next.js to re-fetch from the server, bypassing ISR cache.
            router.refresh();
            setLastRefresh(new Date());
          }
        }
      )
      .subscribe((subStatus) => {
        if (subStatus === "SUBSCRIBED") setStatus("connected");
        if (subStatus === "CHANNEL_ERROR") setStatus("error");
        if (subStatus === "TIMED_OUT") setStatus("error");
      });

    // Tab visibility: reconnect on return to avoid stale connection
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void channel.subscribe();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  const statusColor =
    status === "connected"
      ? "bg-green-500"
      : status === "error"
        ? "bg-red-500"
        : "bg-yellow-500 animate-pulse";

  const statusLabel =
    status === "connected" ? "Live" : status === "error" ? "Disconnected" : "Connecting...";

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <span className={`h-2 w-2 rounded-full ${statusColor}`} />
      <span>{statusLabel}</span>
      {lastRefresh && (
        <span className="text-xs text-gray-400">
          Last refresh: {lastRefresh.toLocaleTimeString()}
        </span>
      )}
      {status === "error" && (
        <button
          onClick={() => router.refresh()}
          className="ml-2 text-xs text-blue-500 hover:underline"
        >
          Refresh manually
        </button>
      )}
    </div>
  );
}
