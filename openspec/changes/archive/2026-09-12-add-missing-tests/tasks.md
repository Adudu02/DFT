# Tasks: add-missing-tests

## 1. Tests de export (⑫)

- [x] 1.1 Crear `packages/core/test/export.test.ts`: DB en tmp con sesión (proyecto con coma y comillas, `ended_at` null) y evento (model con salto de línea); `exportCsv` escapa `"proy, ""grande"""`, celda citada para el salto de línea, null → vacío, cabeceras exactas; DB vacía → solo cabecera + `\n`; `getExportData` ordena por recientes y no expone prompts. Verificar: `pnpm vitest run test/export.test.ts` en `packages/core` pasa.

## 2. Test de integración Qwen (⑬)

- [x] 2.1 Crear `packages/core/test/qwen-integration.test.ts`: `ingestAll()` con `qwenRoot` de tmp (fixture `qwen-usage.jsonl` + `usage_record.jsonl` + usage file con `/review`), `projectsRoot`/`codexRoot` inexistentes en tmp. Verificar: `pnpm vitest run test/qwen-integration.test.ts` pasa — 2 sesiones en DB (proyecto mapeado y `"qwen"`), 3 eventos del fixture con `agent='qwen'`, `summary.skillsInserted >= 1` y fila en `skills_usage`.

## 3. Reporter: toText y parseArgs (⑭)

- [x] 3.1 En `packages/reporter/src/report.ts`, mover y exportar `parseArgs` (misma lógica) e importarla en `src/index.ts` (borrarla de allí). Verificar: `pnpm typecheck` pasa y el bin mantiene los mismos flags.

- [x] 3.2 Extender `packages/reporter/test/report.test.ts`: `toText` — línea de resumen con total a 2 decimales, fila por hallazgo con `~$` solo si hay estimado, trunca a 20 con «… y N más», línea de umbral solo si se supera; `parseArgs` — defaults (`threshold` null), `--json`/`--ingest` como booleanos, `--data <v>` y `--threshold <n>` con valor. Verificar: `pnpm vitest run` en `packages/reporter` pasa.

## 4. Endpoints del server (⑮)

- [x] 4.1 Extender `test/server.test.ts`: config de `beforeEach` con `agentPaths` herméticos (claude con fixture `deterministic.jsonl`, codex/qwen vacíos). Tests nuevos: `GET /api/health`, `POST /api/refresh` (200, `eventsInserted >= 1`, campos `durationMs`/`at`), `GET /api/session/s1` (200) y `/api/session/missing` (404), `GET /api/session/:id/turns` (4 turnos para `sesion1`, `[]` para `s1` sin transcript, 404 para missing), `GET /api/memory` (200 con `nodes`/`links`/`counts`), `GET /api/skills` (200 con `skills`/`categories`), `POST /api/rebuild` (200 con contadores). Verificar: `pnpm vitest run` en la raíz pasa.

## 5. Verificación integral

- [x] 5.1 Ejecutar `pnpm typecheck && pnpm lint && pnpm test && pnpm run build` y confirmar que todo pasa con los tests nuevos. Verificar: salida limpia en los cuatro comandos.
