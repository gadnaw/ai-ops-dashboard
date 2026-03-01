import { getSession } from "@/lib/auth/session";

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
      <p className="text-gray-500 mb-8">
        Welcome back, {session?.email}. Full dashboard coming in Phase 2.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["ADMIN", "DEVELOPER", "VIEWER"] as const).map((role) => (
          <div key={role} className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-medium text-gray-900">{role}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {role === "ADMIN" && "Full access — manage users, API keys, alert rules"}
              {role === "DEVELOPER" && "Read/write on prompts and evaluations"}
              {role === "VIEWER" && "Read-only access across all dashboards"}
            </p>
            <div className={`mt-3 inline-flex items-center text-xs font-medium ${
              session?.role === role ? "text-green-600" : "text-gray-400"
            }`}>
              {session?.role === role ? "Your role" : "Not assigned"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
