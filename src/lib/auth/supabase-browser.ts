"use client";

import { createBrowserClient } from "@supabase/ssr";

// Singleton — call once per app. Safe to call multiple times (returns same instance).
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
