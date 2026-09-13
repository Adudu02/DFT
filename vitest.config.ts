import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests de la capa app (test/). Los del motor viven en packages/core y corren
// con `pnpm --filter motor-agentico-core test` (su cwd tiene el pricing.json
// por defecto). El alias resuelve el paquete a su source, sin build previo.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Cobertura de la capa app (⑯): solo src/ — el motor (packages/core) se
    // mide en su propio workspace. Umbrales = baseline medido menos margen.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["packages/**", "**/node_modules/**"],
      thresholds: {
        lines: 30,
        functions: 30,
      },
    },
  },
  resolve: {
    alias: {
      "motor-agentico-core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
});
