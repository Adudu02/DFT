# agent-usage-ingestion Specification

## Purpose

Define la ingesta de uso de tokens desde los rollouts y chats locales de agentes soportados más allá de Claude Code/Codex/Qwen: listas blancas de lectura estrictas, normalización al `UsageEvent` del motor con las convenciones de cada familia (cache aparte estilo Anthropic; `cached ⊆ input` estilo Gemini con reasoning plegado a output), dedup estable e identidad de sesión por línea o filename.

## Requirements

### Requirement: Ingesta de rollouts de ZCode

El sistema SHALL ingerir los archivos `model-io-sess_*.jsonl` de `~/.zcode/cli/rollout/` produciendo un evento por línea `model_io` con `response.usage`: `input = inputTokens` (cache read aparte, convención Anthropic), `output = outputTokens`, cache read/write directos, `ts = completedAt` y `model = model.modelId`. Las líneas sin `sessionId` (propia o derivable del filename) SHALL contarse como saltadas. Los archivos distintos del patrón `model-io-sess_*.jsonl` SHALL ser ignorados por el discovery.

#### Scenario: Rollout real se ingiere

- **WHEN** la ingesta procesa `model-io-sess_<uuid>.jsonl` con 3 líneas válidas de `model_io`
- **THEN** se registran 3 eventos con `sessionId = sess_<uuid>`, dedup por `requestId` y cache read/write separados del input

#### Scenario: Línea sin sesión se salta

- **WHEN** una línea no tiene `sessionId` y el filename no deriva uno
- **THEN** la línea se cuenta como skipped y no produce evento

### Requirement: Ingesta de chats de Gemini CLI

El sistema SHALL ingerir `~/.gemini/tmp/<hash>/chats/session-*.jsonl` produciendo un evento por mensaje `type: 'gemini'` con bloque `tokens` y `timestamp`: `input = tokens.input − tokens.cached` (cached ⊆ input), `output = tokens.output + tokens.thoughts` (reasoning plegado a output). Los mensajes sin `timestamp` SHALL contarse como saltados. El discovery SHALL limitarse a `session-*.jsonl` bajo `*/chats/`.

#### Scenario: Mensaje con cache y thoughts

- **WHEN** un mensaje `gemini` reporta `{input: 1000, output: 200, cached: 600, thoughts: 50}` y `timestamp`
- **THEN** el evento registra `input = 400`, `output = 250` con el timestamp del mensaje

#### Scenario: Mensaje sin timestamp se salta

- **WHEN** un mensaje `gemini` con tokens no trae `timestamp`
- **THEN** se cuenta como skipped y no produce evento

### Requirement: Cobertura de agentes en el registry

Los adapters ZCode y Gemini SHALL integrarse al registry de ingesta con sus raíces por defecto (`~/.zcode/cli/rollout`, `~/.gemini/tmp`) y ser descubiertos por la ingesta estándar y `rootsFromConfig`, manteniendo la regla de aislamiento de tests (raíces explícitas cuando se sobreescribe la de Claude).

#### Scenario: Ingesta cubre los cinco agentes

- **WHEN** `ingestAll` corre sin overrides de raíces
- **THEN** descubre y procesa fuentes de Claude Code, Codex, Qwen, ZCode y Gemini

#### Scenario: Aislamiento de tests preservado

- **WHEN** un test sobreescribe `projectsRoot` sin pasar `zcodeRoot`/`geminiRoot`
- **THEN** los adapters ZCode y Gemini no se incluyen (sin lecturas fuera del fixture)
