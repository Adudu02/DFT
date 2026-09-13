# Proposal: core-insights-split

## Why

`motor-agentico-core` se anuncia como motor reutilizable ("un consumidor —el dashboard, un check de CI, otra app— importa TODO desde aquí"), pero su interior mezcla dos capas: la medición genérica de tokens (adapters → ingesta → DB → costos) con las opiniones de dominio de este dashboard (detección de fugas `waste` con sus umbrales, catálogo de skills, grafo de memoria de Claude Code, y el `config.json` con tarifa/hora). Quien quiera reutilizar el motor "para medir tokens con sus respectivas herramientas" hereda opiniones que no pidió. Es la continuación natural de la rama `feat/extract-core`, ya al día con main.

## What Changes

- **Nuevo paquete `packages/insights` (`motor-agentico-insights`)**: recibe `config.ts`, `waste.ts`, `skills.ts`, `memory.ts`, el orquestador `rebuild()` (es el que conoce la config) y la sincronización de `memory_nodes` (sale de `ingest.ts` como `syncMemoryNodes` exportada). Depende de `motor-agentico-core`.
- **`motor-agentico-core` queda con la medición pura**: paths, fs-readonly, adapters, registry, `ingestAll` (sin config ni memoria), db, pricing, cost, aggregate, summary, activity, export, report, time. `IngestSummary.memories` pasa a opcional (la cuenta la produce insights al sincronizar).
- **La tabla `memory_nodes` sale del schema de core** y la crea insights (`CREATE TABLE IF NOT EXISTS` idempotente en `syncMemoryNodes`); `skills_usage` queda en core (la escribe la ingesta).
- **Consumidores actualizados**: app (`server`/`cli`/`rebuild`) y `motor-agentico-report` importan lo de dominio desde insights.
- **Barril de core documentado en dos tiers** y nueva sección "Embedding the engine" en el README (EN).

Sin cambio de producto: el dashboard y el CLI se comportan idénticos; solo cambia el empaquetado interno y las rutas de import.

## Capabilities

<!-- skip_specs: true — refactor de empaquetado interno; el comportamiento observable del producto no cambia. -->

## Impact

- **Paquetes**: `packages/insights` (nuevo), `packages/core` (achica), `packages/reporter` (+dep insights), app (+dep insights).
- **API de core**: `loadConfig/saveConfig/Config/DEFAULT_CONFIG`, `getWaste`, `getSkills/discoverCatalog`, `scanMemory`, `rebuild` **ya no se exportan desde `motor-agentico-core`** — viven en `motor-agentico-insights`. `IngestSummary.memories` opcional.
- **CI/build/test**: `pnpm test` encadena insights; cobertura de core se re-mide (los umbrales 85 se recalibran al nuevo scope); insights con su propio config de vitest.
- **Riesgo**: medio — es el refactor más intrusivo de la sesión; mitigado por 128 tests existentes (movidos donde corresponde), re-medición de cobertura y verificación integral completa.
