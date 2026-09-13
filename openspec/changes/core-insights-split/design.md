# Design: core-insights-split

## Context

Grafo de dependencias actual: `waste` depende de core puro (db/cost/pricing/types); `config` depende de `waste` (DEFAULT_WASTE); `skills` usa el tipo `Config`; `memory` usa `defaultProjectsRoot` de adapters. El único punto donde core-importa-dominio es `ingest.ts`: `loadConfig()` (fallback de `rebuild`) y `scanMemory()` vía `refreshMemoryNodes`, cuyo resultado alimenta `IngestSummary.memories`. Consumidores del dominio: app (server/cli/rebuild), reporter y los tests `skills`/`memory`/`codex`/`integrity`. Ver proposal.md.

## Goals / Non-Goals

**Goals:**

- Dos paquetes con dependencia unidireccional: `insights → core` (nunca al revés).
- `ingestAll` libre de config/memoria: la primitiva pura de medición.
- Dashboard, CLI y reporter funcionando idéntico tras el corte.

**Non-Goals:**

- No se renombra el paquete ni se publica `insights` a npm en este cambio (empaquetado local workspace).
- No se tocan los requisitos observables: mismos endpoints, mismas respuestas, mismos CLI flags.
- No se migran más tablas: `skills_usage` queda en core (la escribe la ingesta); solo `memory_nodes` se mueve.

## Decisions

1. **`rebuild()` se muda a insights.** Es el orquestador consciente de config (`agentPaths`/`staleDays`/`timeZone`) y desde allí combina `ingestAll` (core) + `syncMemoryNodes` (insights) devolviendo el summary con `memories`. `server.main()` y `src/rebuild.ts` lo consumen de insights; la variante con `opts.projectsRoot` forzado (tests) se mantiene en su firma.
2. **`syncMemoryNodes(db, projectsRoot, staleDays?)` exportada por insights**, con la lógica de upsert que hoy vive privada en `ingest.ts` (`refreshMemoryNodes`). Crea `memory_nodes` si falta (idempotente). El server la invoca tras la ingesta incremental (`/api/refresh` usa `ingestAll` + sync) para conservar el contrato de `memories`.
3. **`IngestSummary.memories?: number`.** Core ya no la produce (quita `refreshMemoryNodes`); quienes necesiten el número lo agregan. `writeReport` persiste el summary tal cual — los reportes viejos siguen leyéndose.
4. **`memory_nodes` sale del SCHEMA de core.** `SCHEMA_VERSION` se mantiene en 2: la tabla es reconstruible y la crea insights on-demand; no hay migración de datos. `skills_usage` permanece en core: la escritura es parte de la ingesta (insertSkill), solo el catálogo/consulta se mueve.
5. **Tests siguen a su código.** `skills.test.ts` y `memory.test.ts` → `packages/insights/test/`; `codex.test.ts` ajusta sus usos de `getSkills`/`DEFAULT_CONFIG` (imports desde insights) y su test de `reparseSkills` pasa a `ingestAll` directo (la primitiva); `integrity.test.ts` (core) deja de asertar `summary.memories` — la sincronización de memoria tiene su propio test en insights.
6. **Barriles con tiers (opción 1 de la conversación).** El index de core documenta "Tier 1 — medición" y señala que el dominio vive en insights; el index de insights documenta "Tier 2 — dominio del dashboard". README gana sección "Embedding the engine" (EN) con el ejemplo de librería actualizado.

## Risks / Trade-offs

- [Import rotos en consumidores no detectados] → `tsc --noEmit` + 128 tests + build cubren app, reporter y paquetes; no queda ruta de import sin typecheck.
- [Cobertura de core baja al salir módulos con tests propios] → Los umbrales se recalibran contra el nuevo baseline (mismo criterio: baseline medido − margen); insights estrena el suyo.
- [`pnpm-workspace` ya incluye `packages/*`] → Sin cambio de workspace; solo `package.json` de raíz/app/reporter suman la dependencia.

## Migration Plan

Automática: `pnpm install` enlaza el workspace; la DB existente no cambia (memoria se re-sincroniza al primer refresh). Rollback = revertir el PR.

## Open Questions

Ninguna que bloquee implementación.
