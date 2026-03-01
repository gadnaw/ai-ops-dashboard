import type { ReactNode } from "react";

// Route group layout — public access.
// The (dashboard)/dashboard/ nested layout provides its own full-page UI
// with header, filter bar, and Realtime feed. No auth guard here —
// dashboard is read-only and visible without login.
export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
