/**
 * API pública de how-much-did-u-waste-insights — Tier 2: dominio del dashboard.
 *
 * Este paquete consume la medición genérica de `how-much-did-u-waste-core` (Tier 1)
 * y agrega las opiniones de este producto: umbrales y hallazgos de fuga
 * (waste), catálogo y uso de skills, grafo de memoria de Claude Code y el
 * `config.json` del usuario, más el orquestador `rebuild` que combina ingesta
 * + insights. Un consumidor que solo quiera MEDIR tokens no necesita este
 * paquete: le basta `how-much-did-u-waste-core`.
 */
export * from "./config.js";
export * from "./waste.js";
export * from "./skills.js";
export * from "./memory.js";
export * from "./memory_sync.js";
export * from "./rebuild.js";
export * from "./pricing-auto.js";
