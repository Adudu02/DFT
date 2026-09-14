# Proposal: a3-sync-adapters

## Why

Workstream **A3** del implementation plan: Goose, Amp y Crush — "trivial una vez que los engines existen". Además se detectó y corrige un **gap de A2**: `rootsFromConfig` no incluía opencode/grok, así que personalizar la ruta de Claude excluía silenciosamente esos adapters en producción (la regla de aislamiento de tests disparaba fuera de contexto).

## What Changes

- **Refactor del contract**: `DbSyncAdapter` (sync(target, snapshotDb) + snapshot en el ingest) → **`SyncAdapter`** (sync(target) con acceso a su fuente encapsulado). Cada adapter es dueño de cómo lee (snapshot SQLite, directorio JSON). El loop de ingest se simplifica y Amp (fuente JSON acumulativa) encaja sin un tercer contract.
- **Goose** (SQLite, fixture-driven): filas acumulativas tipo OpenCode — lectura tolerante (`input_tokens/output_tokens` o `accumulated_*`; id de `id`/`session_id`; timestamp tolerante), reemplazo comparativo `goose::<sessionId>`, sin cache/reasoning (0 tolerado).
- **Amp** (JSON, fixture-driven): `~/.local/share/amp/threads/T-<uuid>.json` con `usage.{inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, credits}` — agregado por thread → reemplazo comparativo `amp::T-<uuid>`; `credits` ignorado (equiv-API).
- **Crush** (SQLite, fixture-driven): `sessions.cost` USD es lo único mantenible — un evento por sesión con **costo directo del proveedor** (tokens 0/0, model tolerante). Documentado: Crush contribuye al gasto pero no a las métricas de tokens; es la única fuente donde el costo no es equiv-API (no hay tokens de donde derivarlo).
- **rootsFromConfig completo**: las 10 claves de agentes (corrige el gap A2 para opencode/grok).

## Capabilities

### Modified Capabilities

- `agent-usage-ingestion`: el requisito de cobertura del registry pasa de 7 a 10 agentes.

## Impact

- Core: refactor del contract + 3 adapters + registry. Tests de sqlite-adapters ajustados a la firma nueva; agent-coverage a 10 agentes.
- Riesgo: medio-bajo — refactor de firma mecánico verificado por suite; los 3 adapters son fixture-driven sin datos locales.
