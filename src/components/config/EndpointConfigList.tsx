import { prisma } from "@/lib/db/prisma";
import { EndpointConfigForm } from "./EndpointConfigForm";

export async function EndpointConfigList() {
  const configs = await prisma.endpointConfig.findMany({
    where: { isActive: true },
    orderBy: { endpointName: "asc" },
  });

  if (configs.length === 0) {
    return (
      <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
        No endpoint configurations found. Run the database migration to create defaults.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {configs.map((config) => (
        <div key={config.endpointName} className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 capitalize">
                {config.endpointName}
              </h3>
              <p className="mt-0.5 text-sm text-gray-500">
                Fallback chain:{" "}
                <span className="font-mono text-xs">
                  {config.primaryModel}
                  {Array.isArray(config.fallbackChain) && config.fallbackChain.length > 0
                    ? ` → ${(config.fallbackChain as string[]).join(" → ")}`
                    : ""}
                </span>
              </p>
            </div>
          </div>
          <EndpointConfigForm
            config={{
              endpointName: config.endpointName,
              primaryModel: config.primaryModel,
              fallbackChain: Array.isArray(config.fallbackChain)
                ? (config.fallbackChain as string[])
                : [],
              temperature: Number(config.temperature),
              maxTokens: config.maxTokens,
              systemPrompt: config.systemPrompt,
            }}
          />
        </div>
      ))}
    </div>
  );
}
