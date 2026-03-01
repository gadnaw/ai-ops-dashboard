import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Required for after() fire-and-forget logging (Phase 2+)
    // @ts-expect-error — 'after' is available at runtime in Next.js 16 but not yet typed
    after: true,
  },
  serverExternalPackages: ["@prisma/client", "prisma"],
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

export default nextConfig;
