import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Database — dual connection strings (Pitfall 1)
    DATABASE_URL: z.url(),
    DIRECT_URL: z.url(),
    // Supabase
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    // Auth secret for JWT signing
    NEXTAUTH_SECRET: z.string().min(32).optional(),
  },
  client: {
    // Supabase public keys (anon key is safe to expose — RLS enforced)
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
});
