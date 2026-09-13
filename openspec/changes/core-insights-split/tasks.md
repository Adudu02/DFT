# Tasks: core-insights-split

## 1. Paquete insights

- [x] 1.1 Crear `packages/insights/`: `package.json` (`motor-agentico-insights`, dep workspace de core), `tsconfig.json`, mover `config.ts`/`waste.ts`/`skills.ts`/`memory.ts` (imports ajustados a `motor-agentico-core`), añadir `syncMemoryNodes` (ex `refreshMemoryNodes` de ingest.ts, con CREATE TABLE idempotente de `memory_nodes`) y `rebuild` (orquestador con config), y barrel `src/index.ts`. Verificar: `tsc -p packages/insights/tsconfig.json --noEmit` pasa.

- [x] 1.2 Mover `skills.test.ts` y `memory.test.ts` a `packages/insights/test/` (ajustando imports) + vitest config de insights con cobertura (umbrales al baseline). Verificar: `pnpm --filter motor-agentico-insights test` pasa.

## 2. Core achicado

- [x] 2.1 En core: quitar `config.ts`/`waste.ts`/`skills.ts`/`memory.ts`, `refreshMemoryNodes` y sus imports de `ingest.ts`; `IngestSummary.memories` opcional; sacar `memory_nodes` del SCHEMA; barrel reescrito con tiers documentados. Verificar: `pnpm --filter motor-agentico-core test` pasa y `grep waste\\|skills\\|memory\\|config packages/core/src/index.ts` no muestra exports de dominio.

- [x] 2.2 Ajustar `codex.test.ts` (imports desde insights; test de reparseSkills vía `ingestAll`) e `integrity.test.ts` (sin aserto de `memories`). Verificar: suite core en verde.

## 3. Consumidores

- [x] 3.1 App: `package.json` (+dep insights), `src/server.ts`, `src/cli.ts`, `src/rebuild.ts` importan dominio desde `motor-agentico-insights`; `/api/refresh` y `main()` agregan `syncMemoryNodes` para conservar `memories`. Reporter: `package.json` + imports. `package.json` raíz: script `test` encadena insights. `biome.json` incluye `packages/insights/**`. Verificar: `pnpm typecheck && pnpm lint` en verde.

- [x] 3.2 README: sección "Embedding the engine" (EN) con los dos paquetes y ejemplo de librería. Verificar: grep muestra la sección.

## 4. Verificación integral

- [x] 4.1 `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm run build` — todo en verde con los tres workspaces de tests (core, insights, reporter, app). Verificar: salida limpia; cobertura de core recalibrada si los umbrales 85 ya no aplican.
