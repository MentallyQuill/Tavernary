import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "coverage/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
    ".worktrees/**",
    "**/*.d.mts",
  ]),
]);
