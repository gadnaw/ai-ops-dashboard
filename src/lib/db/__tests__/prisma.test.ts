import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db/prisma";

describe("Prisma client singleton", () => {
  it("initializes without throwing", () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.$connect).toBe("function");
  });

  it("returns the same instance on multiple imports", async () => {
    const { prisma: prisma2 } = await import("@/lib/db/prisma");
    expect(prisma).toBe(prisma2);
  });
});
