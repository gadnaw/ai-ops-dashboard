import { getSession } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";

export async function Nav() {
  const session = await getSession();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-gray-900">AI Ops Dashboard</span>
            <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">
              Dashboard
            </a>
            {session && (
              <a href="/config" className="text-sm text-gray-500 hover:text-gray-900">
                Config
              </a>
            )}
          </div>

          {session ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">{session.email}</span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                {session.role}
              </span>
              <form action={signOut}>
                <button type="submit" className="text-sm text-gray-500 hover:text-gray-900">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <a href="/login" className="text-sm font-medium text-gray-900 hover:underline">
              Sign in
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
