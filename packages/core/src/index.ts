/**
 * API pública del paquete motor-agentico-core. Un consumidor —el dashboard de
 * este repo, un check de CI, otra app— importa TODO desde aquí, no de rutas
 * internas. El motor no conoce Fastify, React ni el CLI; solo lee fuentes
 * (solo-lectura), calcula costos equiv-API, detecta fugas y persiste métricas.
 *
 * Uso como librería:
 *   import { setDataDir, rebuild, getWaste, openDb, defaultDbPath } from "motor-agentico-core";
 *   setDataDir("/ruta/estado");          // dónde vive la DB/reportes (default: <cwd>/data)
 *   await rebuild();                      // ingiere todas las fuentes
 *   const { findings } = getWaste(openDb(defaultDbPath()), ...);
 */

// Configuración de rutas de estado + preparación del directorio (setup del motor,
// compartido por todos los consumidores: app, reporter de CI, etc.).
export { dataDir, setDataDir, packagedPricingPath, ensureUserData } from "./lib/paths.js";

// Fuentes: adapters (clases + parsers) + registro + ingesta.
export * from "./adapters/types.js";
export * from "./adapters/claude-code.js";
export * from "./adapters/codex.js";
export * from "./adapters/qwen.js";
export * from "./adapters/registry.js";
export * from "./ingest.js";

// Persistencia (métricas, nunca prompts).
export * from "./lib/db.js";

// Tarifas y config del usuario.
export * from "./lib/pricing.js";
export * from "./lib/config.js";

// Motor de costos y vistas derivadas.
export * from "./lib/cost.js";
export * from "./lib/aggregate.js";
export * from "./lib/summary.js";
export * from "./lib/activity.js";
export * from "./lib/waste.js";
export * from "./lib/skills.js";
export * from "./lib/memory.js";
export * from "./lib/export.js";
export * from "./lib/report.js";
