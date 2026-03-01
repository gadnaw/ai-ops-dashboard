import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Required for after() fire-and-forget logging (Phase 2+)
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
