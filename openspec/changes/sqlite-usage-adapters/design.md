# Design: sqlite-usage-adapters

## Context

Schema de OpenCode **verificado contra la DB real** (2026-09-14): tabla `session` con `id (ses_...)`, `directory` (path del proyecto), `tokens_input/output/reasoning/cache_read/cache_write`, `model` como JSON string (`{"id":"glm-5.3","providerID":"zai",...}`), `agent` ("build"), `time_created/time_updated` (epoch-ms), `cost` (USD del proveedor). Filas **acumulativas** (los tokens crecen con la sesión). grok-cli: sin DB local ni schema verificable upstream (el README no documenta la DB) → fixture-driven según el plan: `usage_events(session_id, model, input_tokens, output_tokens, total_tokens, cost_micros)`, tratadas como filas append-only. Las DBs fuente están vivas (WAL). Ver proposal.md.

## Goals / Non-Goals

**Goals:**

- Snapshot read-only y consistente de DBs SQLite vivas, reutilizable por futuros adapters (Goose/Crush en A3).
- Semántica correcta por tipo de fila: acumulativa (upsert con reemplazo) vs append-only (insert-or-ignore).
- 7 agentes cubiertos en una sola `ingestAll`.

**Non-Goals:**

- No se eliminan sesiones que desaparecen de la fuente (edge case: la DB es caché, rebuild la regenera).
- No se usa el `cost` de OpenCode ni los `cost_micros` de grok — equiv-API de pricing.json, consistente con todo el motor.
- No se toca `sessions.turns` para fuentes acumulativas (sin datos de turnos; 0 es honesto).
- No hay env overrides (`GOOSE_PATH_ROOT` etc.) — consistente con los adapters existentes.

## Decisions

1. **Snapshot vía la API de backup de better-sqlite3** (`src {readonly: true}` → `src.backup(tmp)`): copia consistente con WAL sin tocar los sidecars a mano, y el origen nunca se abre en modo escritura. `withSqliteSnapshot(src, fn)` crea mkdtemp, respalda, ejecuta `fn(tmpDb)` y limpia en `finally`.
2. **`DbSyncAdapter` como contract hermano (no subtipo) de `IngestAdapter`.** El pipeline de archivos (offsets por size/mtime, `readFileRO`) no aplica a SQLite; forzarlo rompería el modelo. `ingestAll` corre primero los file-adapters y luego los db-sync (cada uno en try/catch: un fallo degrada sin abortar la ingesta). Mismo criterio de aislamiento de tests que los file-adapters.
3. **OpenCode acumulativo: reemplazo comparativo.** Clave fija `opencode::<sessionId>`; en cada sync se lee la fila existente: si tokens/ts idénticos → `skipped` (reingesta incremental honesta, 0 escrituras); si cambiaron → DELETE + INSERT en transacción (nunca doble conteo). `sessions` se upsertea siempre (idempotente): `started_at = time_created`, `ended_at = time_updated`, `turns = 0`.
4. **grok append-only: `INSERT OR IGNORE` con dedup `grok::<session_id>::<rowid>`** — los rowids son estables en la fuente. `cost_micros` ignorado deliberadamente (equiv-API), razonamiento documentado en el adapter.
5. **Timestamp de grok: supuesto explícito.** El plan no lista columna temporal; el adapter lee la primera disponible de (`created_at`, `timestamp`, `time_created`) aceptando epoch-s, epoch-ms o ISO, y las filas sin timestamp utilizable se saltan. **A verificar contra una DB real antes de confiar en las fechas** (fixture = spec ejecutable, precedentes Gemini).
6. **Model de OpenCode:** `JSON.parse(session.model).id` con fallback tolerante al string crudo. `directory` → `basename` = project real (mejor que un project fijo).
7. **Reasoning plegado a output** en OpenCode (`tokens_output + tokens_reasoning`) — misma convención que Qwen/Gemini/ZCode.

## Risks / Trade-offs

- [`ingestAll` crece en complejidad] → Los dos flujos quedan claramente separados (file loop vs db-sync loop) y los 197 tests existentes + los nuevos cubren ambos.
- [El supuesto de `created_at` de grok es incorrecto] → El adapter es latente (grok no está instalado aquí); el fixture documenta el supuesto y corregirlo es tocar un mapper testado, no el pipeline.
- [Backup de DBs grandes] → OpenCode/grok son KBs–MBs; el tmp se limpia en `finally`. Si algún día crece, el patrón ya limita la vida del archivo al sync.

## Migration Plan

Sin migración: `usage_events` reutiliza el schema actual (claves de dedup nuevas). Rollback = revertir.

## Open Questions

Ninguna que bloquee implementación.
