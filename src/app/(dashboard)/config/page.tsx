import { Suspense } from "react";
import { EndpointConfigList } from "@/components/config/EndpointConfigList";

// SSR (not ISR) — config changes must be immediately visible
export const dynamic = "force-dynamic";

export default function ConfigPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Model Configuration</h1>
        <p className="mt-2 text-sm text-gray-600">
          Configure temperature, max tokens, and system prompts per endpoint. Changes take effect on
          the next request through that endpoint. Requires Developer or Admin role to save changes.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        }
      >
        <EndpointConfigList />
      </Suspense>
    </div>
  );
}
