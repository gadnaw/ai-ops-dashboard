import type { Profile } from "@prisma/client";

export type UserRole = "ADMIN" | "DEVELOPER" | "VIEWER";

// Session shape returned by getSession() — includes Supabase user + resolved profile role
export interface AuthSession {
  userId: string;
  email: string;
  role: UserRole;
}

// Type guard for role hierarchy checks
export function hasRole(session: AuthSession, required: UserRole): boolean {
  const hierarchy: Record<UserRole, number> = {
    ADMIN: 3,
    DEVELOPER: 2,
    VIEWER: 1,
  };
  return hierarchy[session.role] >= hierarchy[required];
}

// Re-export Profile for convenience
export type { Profile };
