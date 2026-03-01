import { redirect } from "next/navigation";

// This page is at URL "/" within the (dashboard) route group.
// src/app/page.tsx redirects "/" → "/dashboard", so this file is effectively
// never reached. Redirect defensively in case route resolution changes.
export default function DashboardGroupPage() {
  redirect("/dashboard");
}
