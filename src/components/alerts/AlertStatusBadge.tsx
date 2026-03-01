type AlertStatus = "fired" | "acknowledged" | "resolved";

const STATUS_CONFIG: Record<AlertStatus, { label: string; className: string }> = {
  fired: {
    label: "Active",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  acknowledged: {
    label: "Acknowledged",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  resolved: {
    label: "Resolved",
    className: "bg-green-100 text-green-700 border-green-200",
  },
};

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.fired;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
