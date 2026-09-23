import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Alias a source de core: los tests corren sin build previo (igual que el root).
const core = fileURLToPath(new URL("../core/src/index.ts", import.meta.url));

// Cobertura de la capa de dominio (insights). Umbrales = baseline medido.
export default defineConfig({
  resolve: {
    alias: { "how-much-did-u-waste-core": core },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
