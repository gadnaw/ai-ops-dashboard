import { redirect } from "next/navigation";
import { getSession } from "./session";
import { hasRole } from "./types";
import type { AuthSession, UserRole } from "./types";

// Use in Server Actions and Route Handlers that require authentication.
// Redirects to /login if not authenticated.
// Returns the authenticated session.
export async function requireAuth(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

// Use in Server Actions and Route Handlers that require a specific role.
// Throws a typed error (not redirect) for API route handlers.
// For page-level protection, prefer requireAuth() + UI conditional rendering.
export async function requireRole(
  requiredRole: UserRole
): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (!hasRole(session, requiredRole)) {
    throw new Error(
      `Forbidden: requires ${requiredRole} role, current role is ${session.role}`
    );
  }
  return session;
}

// Convenience wrappers for common role checks
export const requireAdmin = () => requireRole("ADMIN");
export const requireDeveloper = () => requireRole("DEVELOPER");

// Pattern for Server Actions — wrap requireRole, catch Forbidden errors
// Usage:
//   const session = await requireAdmin();
//   // if user lacks ADMIN role, throws Error("Forbidden: requires ADMIN...")
//   // caller handles with try/catch and returns { error: "Insufficient permissions" }
