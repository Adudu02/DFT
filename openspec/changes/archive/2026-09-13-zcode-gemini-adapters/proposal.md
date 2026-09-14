# Proposal: zcode-gemini-adapters

## Why

Workstream **A1** de `docs/implementation-plan.md`: el dashboard solo mide Claude Code, Codex y Qwen, pero el usuario también corre **ZCode** (cuyos rollouts JSONL existen en `~/.zcode/cli/rollout/` con usage real) y Gemini CLI es el siguiente agente popular del ecosistema. Cada agente sin adapter es gasto invisible.

## What Changes

- **Adapter ZCode** (`packages/core/src/adapters/zcode.ts`): lee `~/.zcode/cli/rollout/model-io-sess_*.jsonl` (lista blanca estricta; el archivo `model-io-no-session.jsonl` se excluye del discovery y sus líneas sin `sessionId` se saltan). Cada línea `model_io` con `response.usage` → un `UsageEvent`: `input = inputTokens` (convención Anthropic: cache read va aparte — `totalTokens = inputTokens + outputTokens` exacto en los datos reales), `output = outputTokens`, `cacheRead/cacheWrite` directos; `ts = completedAt`; `model = model.modelId`; dedup por `requestId`.
- **Adapter Gemini CLI** (`packages/core/src/adapters/gemini.ts`): lee `~/.gemini/tmp/<hash>/chats/session-*.jsonl`. Mensajes `type: 'gemini'` con `tokens` → un evento: `input = input - cached` (cached ⊆ input), `output = output + thoughts` (reasoning se pliega a output, como Qwen); requiere `timestamp` por mensaje (líneas sin él se saltan); dedup por `basename::lineIndex`. **Fixture-driven**: no hay datos locales de Gemini en esta máquina — el formato viene del research del plan y queda fijado por fixtures.
- **Registry + config**: ambos se registran en `getIngestAdapters` (misma regla de aislamiento de tests que Codex/Qwen), `rootsFromConfig`/`ingestAll` gain `zcodeRoot`/`geminiRoot`, y `/api/refresh` los descubre automáticamente.
- Pricing: `GLM-5.3-Flash` no matchea LiteLLM por casing → costo 0 + badge (comportamiento seguro existente); el usuario puede agregar un override.

## Capabilities

### New Capabilities

- `agent-usage-ingestion`: ingesta de uso de tokens desde los rollouts/chats locales de agentes soportados — lectura de solo listas blancas, normalización al `UsageEvent` del motor, dedup estable e identidad de sesión por archivo/línea.

### Modified Capabilities

(ninguna — los requisitos existentes de otros adapters no cambian)

## Impact

- **Core**: `adapters/zcode.ts` + `adapters/gemini.ts` (nuevos), `registry.ts` (+2 adapters, +2 roots), `ingest.ts` (opts `zcodeRoot`/`geminiRoot`).
- **Insights**: `rootsFromConfig` devuelve `zcodeRoot`/`geminiRoot` (defaults siempre, como Codex/Qwen) → `/api/refresh` y `rebuild` los incluyen solos.
- **Tests**: fixtures sanitizados del rollout real de ZCode (sin `request.body`); fixtures sintéticos de Gemini según el formato documentado; integración e2e vía `ingestAll` (patrón `qwen-integration.test`).
- **Riesgo**: bajo-bajo — adapters nuevos, cero cambio en los existentes; el whitelist de discovery evita leer archivos ajenos (misma política de seguridad que Codex/Qwen).
