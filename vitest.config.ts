import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests de la capa app (test/). Los del motor viven en packages/core y corren
// con `pnpm --filter motor-agentico-core test` (su cwd tiene el pricing.json
// por defecto). El alias resuelve el paquete a su source, sin build previo.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "motor-agentico-core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
});
