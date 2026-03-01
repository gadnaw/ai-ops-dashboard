interface QueueStatsProps {
  pendingCount: number;
  reviewedTodayCount: number;
  avgPendingScore: number | null;
}

export function QueueStats({ pendingCount, reviewedTodayCount, avgPendingScore }: QueueStatsProps) {
  return (
    <div className="mb-6 grid grid-cols-3 gap-4">
      <div className="rounded-lg border bg-white p-4">
        <p className="text-muted-foreground text-sm">Pending Review</p>
        <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
      </div>
      <div className="rounded-lg border bg-white p-4">
        <p className="text-muted-foreground text-sm">Reviewed Today</p>
        <p className="text-2xl font-bold text-green-600">{reviewedTodayCount}</p>
      </div>
      <div className="rounded-lg border bg-white p-4">
        <p className="text-muted-foreground text-sm">Avg Pending Score</p>
        <p className="text-2xl font-bold">
          {avgPendingScore != null ? avgPendingScore.toFixed(1) : "\u2014"}
        </p>
      </div>
    </div>
  );
}
