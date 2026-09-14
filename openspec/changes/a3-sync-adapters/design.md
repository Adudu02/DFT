# Design: a3-sync-adapters

## Context
Goose (`sessions.db`, columnas `input_tokens/output_tokens/total_tokens/accumulated_*`, sin cache/reasoning), Amp (`threads/T-<uuid>.json` con `usage` camelCase por thread), Crush (`crush.db` con `sessions.cost` USD, columnas de tokens sin mantener) — los tres del plan, sin datos locales (fixture-driven). Gap A2: rootsFromConfig sin opencode/grok. Ver proposal.md.

## Decisions
1. **`SyncAdapter.sync(target)` encapsula su fuente.** El snapshot SQLite pasa adentro de las fábricas opencode/grok/goose/crush (withSqliteSnapshot ya es su helper); Amp lee su directorio directamente. El loop de ingest pierde la dependencia de SQLite y el contract admite cualquier fuente acumulativa. Costo del refactor: firma de 2 adapters + tests (mecánico).
2. **Goose reusa el patrón acumulativo de OpenCode** (reemplazo comparativo, clave `goose::<id>`): columna tolerante (prefiere `input_tokens/output_tokens`, cae a `accumulated_input_tokens/accumulated_output_tokens` si las primeras no existen), id de `id`/`session_id`, timestamp tolerante vía toIsoTimestamp. La advertencia del plan sobre contadores acumulativos se satisface por diseño: reemplazo, nunca suma.
3. **Amp: agregado por thread con reemplazo** `amp::T-<uuid>` — el usage del archivo ES el total del thread; cacheRead/cacheCreation mapean directo; `credits` ignorado (equiv-API). Timestamp: acepta `updatedAt`/`createdAt`/`timestamp` del JSON.
4. **Crush: costo directo documentado como excepción.** Sin tokens mantenibles no hay equiv-API posible; el evento lleva `cost_usd = sessions.cost` con tokens 0/0. Aparece en vistas de gasto, no en métricas de tokens — honesto y explícito en spec.
5. **rootsFromConfig con las 10 claves** — corrige el gap A2 (personalizar claude excluía opencode/grok) y previene el mismo bug para los nuevos.

## Risks
[Schemas fixture-driven sin datos reales] → mismo patrón probado (Gemini/grok): parsers aislados, corrección = tocar un mapper testado.
