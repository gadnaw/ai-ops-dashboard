import { createSupabaseServerClient } from "./supabase-server";
import { prisma } from "@/lib/db/prisma";
import type { AuthSession } from "./types";

// Returns null if not authenticated. Never throws.
// Use in Server Components to conditionally render UI.
export async function getSession(): Promise<AuthSession | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;

    // Resolve role from profiles table (Prisma, server-side)
    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { role: true, email: true },
    });

    if (!profile) return null;

    return {
      userId: user.id,
      email: profile.email,
      role: profile.role as AuthSession["role"],
    };
  } catch {
    return null;
  }
}
