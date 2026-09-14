# Proposal: sqlite-usage-adapters

## Why

Workstream **A2** de `docs/implementation-plan.md`: dos agentes populares persisten su uso en **SQLite local** (OpenCode: `~/.local/share/opencode/opencode.db`; grok-cli: `~/.grok/grok.db`) y el motor solo ingiere archivos de texto. Las DBs fuente están **vivas** (WAL): abrirlas directo arriesga lecturas inconsistentes. Se necesita un motor genérico de snapshot read-only + dos adapters que lo consuman.

## What Changes

- **`lib/sqlite-snapshot.ts`**: `withSqliteSnapshot(src, fn)` — abre la fuente en `readonly`, la copia vía la API de backup de better-sqlite3 (maneja WAL correctamente) a un dir temporal y ejecuta `fn` sobre la copia; limpieza garantizada.
- **Contract de adapters extendido**: `DbSyncAdapter` (id + sourcePath + `sync(target, snapshotPath)`) — a diferencia del contract de archivos, la sincronización escribe ella misma (upsert semántico) porque las filas de sesión son **agregados acumulativos**, no eventos append-only.
- **Adapter OpenCode** (schema verificado contra la DB real 2026-09-14): tabla `session` con `tokens_input/output/reasoning/cache_read/cache_write`, `model` JSON (`{"id":...}`), `directory` (proyecto real), `time_created/time_updated` epoch-ms. Filas acumulativas → re-sync con reemplazo por clave `opencode::<sessionId>` (sin doble conteo; reingesta idempotente); reasoning se pliega a output.
- **Adapter grok-cli** (fixture-driven, sin datos locales): tabla `usage_events(session_id, model, input_tokens, output_tokens, total_tokens, cost_micros)` — append-only con `INSERT OR IGNORE` (dedup `grok::<session>::<rowid>`), micros ignorados (equiv-API de pricing.json), timestamp vía columna `created_at` (supuesto documentado a verificar contra DB real).
- **Registry**: `getDbSyncAdapters(roots)` con defaults (`opencodeRoot`, `grokRoot`), misma regla de aislamiento de tests; `ingestAll` corre los db-sync después de los de archivo; `rootsFromConfig` suma las claves.

Sin cambio de producto: el dashboard funciona idéntico; las nuevas fuentes aparecen al reconstruir.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `agent-usage-ingestion`: se añaden requisitos para fuentes SQLite (snapshot read-only, semántica acumulativa vs append-only) y la cobertura del registry crece a 7 agentes.

## Impact

- **Core**: `lib/sqlite-snapshot.ts` (nuevo), `adapters/opencode.ts` + `adapters/grok.ts` (nuevos), `registry.ts`/`ingest.ts` (extensión del contract).
- **Ninguna dependencia nueva** — better-sqlite3 ya está en core.
- **Riesgo**: medio — tocar `ingestAll` (el corazón de la ingesta); mitigado con 197 tests existentes + tests nuevos de snapshot/sync con DBs reales sintetizadas.
