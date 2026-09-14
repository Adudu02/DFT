# Tasks: sqlite-usage-adapters

## 1. Motor genérico SQLite

- [x] 1.1 Crear `packages/core/src/lib/sqlite-snapshot.ts`: `withSqliteSnapshot(src, fn)` — readonly + backup API de better-sqlite3 a mkdtemp, `fn(tmpDb)`, limpieza en `finally`. Test: DB con datos en WAL se copia completa; fuente inexistente rechaza. Verificar: tests verdes.

## 2. Contract y registry

- [x] 2.1 `DbSyncAdapter` en registry + `getDbSyncAdapters(roots)` con defaults (`opencode.db`, `grok.db`) y regla de aislamiento; `ingestAll` corre los db-sync tras los file-adapters (try/catch por adapter); opts `opencodeRoot`/`grokRoot`. Verificar: suite core en verde.

## 3. Adapters

- [x] 3.1 `packages/core/src/adapters/opencode.ts`: sync acumulativo (reemplazo comparativo por `opencode::<sessionId>`, project = basename(directory), model JSON parseado, reasoning→output, ts de time_updated). Tests con DB sintetizada del schema real: primera sync inserta, re-sync sin cambios = 0 escrituras, sesión que crece reemplaza sin duplicar. Verificar: tests verdes.

- [x] 3.2 `packages/core/src/adapters/grok.ts`: sync append-only (dedup `grok::<session>::<rowid>`, insert-or-ignore, micros ignorados, timestamp tolerante created_at/timestamp/time_created en epoch-s/ms/ISO, filas sin timestamp => skipped). Tests con DB sintetizada del schema del plan. Verificar: tests verdes.

- [x] 3.3 Extender `agent-coverage.test.ts` a 7 agentes (añade opencode.db + grok.db al fixture-tree, reingesta incremental incluida). Verificar: los 7 agentes en DB.

## 4. Verificación integral

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm run build` — todo en verde. Verificar: salida limpia.
