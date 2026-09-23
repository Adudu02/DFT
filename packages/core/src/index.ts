/**
 * API pública del paquete how-much-did-u-waste-core. Un consumidor —el dashboard de
 * este repo, un check de CI, otra app— importa TODO desde aquí, no de rutas
 * internas. El motor no conoce Fastify, React ni el CLI; solo lee fuentes
 * (solo-lectura), calcula costos equiv-API, detecta fugas y persiste métricas.
 *
 * Uso como librería:
 *   import { setDataDir, rebuild, getWaste, openDb, defaultDbPath } from "how-much-did-u-waste-core";
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

// Tarifas del usuario + actualizador desde fuente curada (LiteLLM).
export * from "./lib/pricing.js";
export * from "./lib/pricing-update.js";

// Quota probes (add-quota-probes): estado RESTANTE por proveedor/ventana,
// vía endpoints de solo-consulta con credenciales locales. Sin inferencia.
export * from "./quota/types.js";
export * from "./quota/cache.js";
export * from "./quota/probers.js";
export * from "./quota/refresh.js";

// IO de solo lectura: política de seguridad del motor, reutilizable por los
// consumidores y por la capa de dominio (how-much-did-u-waste-insights).
export * from "./lib/fs-readonly.js";
export * from "./lib/sqlite-snapshot.js";

// Motor de costos y vistas derivadas.
export * from "./lib/cost.js";
export * from "./lib/aggregate.js";
export * from "./lib/summary.js";
export * from "./lib/activity.js";
export * from "./lib/export.js";
export * from "./lib/report.js";

/**
 * TIER 2 — dominio del dashboard (NO vive en este paquete):
 *   config (tarifa/hora, agentPaths), waste (hallazgos de fuga), skills
 *   (catálogo) y memory (grafo de Claude Code) viven en
 *   `how-much-did-u-waste-insights`, junto con el orquestador `rebuild` que combina
 *   ingesta + memoria. Este paquete es la medición genérica; si solo querés
 *   medir tokens, no necesitás insights.
 */
