import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

const eslintConfig = defineConfig([
  // Base Next.js + TypeScript rules
  ...nextVitals,
  ...nextTs,

  // Disable style rules that conflict with Prettier
  prettierConfig,

  // Override default ignores of eslint-config-next.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),

  // Custom rules for this project
  {
    rules: {
      // TypeScript strictness
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // React
      "react/self-closing-comp": "warn",
      // Security: block accidental console.log in production code
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // Relax rules for config files, test utilities, and seed scripts
  {
    files: ["*.config.{js,mjs,ts}", "src/test/**", "e2e/**", "prisma/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
]);

export default eslintConfig;
