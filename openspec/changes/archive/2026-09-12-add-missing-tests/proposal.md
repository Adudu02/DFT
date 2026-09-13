# Proposal: add-missing-tests

## Why

`MEJORAS.md` (ítems ⑫–⑮) identifica cuatro zonas sin cobertura: `export.ts` (el CSV que escapa comas/comillas/saltos de línea nunca se testeó), la ingesta end-to-end de Qwen (los adapters Claude/Codex tienen integración; Qwen no), el reporter (`toText` y `parseArgs` sin tests) y 7 endpoints del server (`health`, `refresh`, `session/:id`, `session/:id/turns`, `memory`, `skills`, `rebuild`). Son contratos que la UI y el CI consumen a diario; una regresión pasaría desapercibida.

## What Changes

- Nuevo `packages/core/test/export.test.ts`: escapado CSV (coma, comilla, salto de línea), nulls, DB vacía, cabeceras exactas y contrato de privacidad (sin columna de prompts).
- Nuevo `packages/core/test/qwen-integration.test.ts`: `ingestAll()` end-to-end con fixtures de Qwen — sesiones, eventos, mapa sesión→proyecto y skills en DB (cierra el circuito del wiring del registry).
- `packages/reporter`: `parseArgs` se mueve de `src/index.ts` a `src/report.ts` (módulo puro, sin IO) y se exporta, para poder testearlo sin ejecutar `main()`; tests nuevos para `toText` y `parseArgs`.
- `test/server.test.ts`: tests para los 7 endpoints faltantes, con raíces herméticas vía `agentPaths` para que `refresh`/`rebuild` no toquen los transcripts reales.

**Sin cambio de comportamiento**: es testing puro + una reubicación interna de `parseArgs`.

## Capabilities

<!-- skip_specs: true — testing y reubicación interna; ningún requisito observable cambia. -->

## Impact

- **Archivos nuevos**: `packages/core/test/export.test.ts`, `packages/core/test/qwen-integration.test.ts`.
- **Archivos modificados**: `packages/reporter/src/report.ts` + `src/index.ts` (mover/exportar `parseArgs`), `packages/reporter/test/report.test.ts`, `test/server.test.ts`.
- **Riesgo**: bajo — los tests son nuevos; la única tocada a código productivo es mover `parseArgs` (misma lógica, importada por `index.ts`).
- **Compatibilidad**: la CLI conserva exactamente los mismos flags; nada externo cambia.
