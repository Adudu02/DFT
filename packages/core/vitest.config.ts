import { defineConfig } from "vitest/config";

// Cobertura del motor (⑯): provider v8, tabla en terminal + HTML en coverage/.
// Umbrales = baseline medido menos margen (ver design del change coverage-ci-lint).
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["**/dist/**", "**/*.d.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
      },
    },
  },
});
