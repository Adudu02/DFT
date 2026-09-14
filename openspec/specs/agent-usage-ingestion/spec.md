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

### Requirement: Cobertura del registry de agentes

El registry SHALL incluir los adapters de archivo (Claude Code, Codex, Qwen, ZCode, Gemini CLI) y los adapters de sincronización (OpenCode, grok-cli, Goose, Amp, Crush) con sus raíces por defecto bajo la misma regla de aislamiento de tests, y `rootsFromConfig` SHALL exponer las claves de todos los agentes soportados para que personalizar la ruta de uno nunca excluya a los demás en producción.

#### Scenario: Ingesta cubre todos los agentes soportados

- **WHEN** `ingestAll` corre sin overrides de raíces
- **THEN** descubre y procesa fuentes de Claude Code, Codex, Qwen, ZCode, Gemini CLI, OpenCode, grok-cli, Goose, Amp y Crush

#### Scenario: Aislamiento de tests preservado

- **WHEN** un test sobreescribe `projectsRoot` sin pasar las raíces de los adapters de sincronización
- **THEN** esos adapters no se incluyen (sin lecturas fuera del fixture)

#### Scenario: Ruta de Claude personalizada no excluye a los demás

- **WHEN** `rootsFromConfig` recibe un `agentPaths` con solo la ruta de Claude personalizada
- **THEN** las raíces de los demás agentes se resuelven a sus defaults y siguen incluidas en la ingesta

### Requirement: Fuentes SQLite con snapshot read-only

El sistema SHALL soportar agentes cuyo uso persiste en SQLite local mediante un snapshot read-only: la fuente se abre en modo solo-lectura, se copia a un archivo temporal vía el mecanismo de backup de SQLite (consistente con WAL) y toda consulta corre sobre la copia. Un fallo del snapshot SHALL degradar sin abortar la ingesta de los demás agentes.

#### Scenario: DB viva con WAL

- **WHEN** la ingesta corre mientras la DB fuente tiene datos pendientes en su WAL
- **THEN** el snapshot captura el estado consistente completo y la fuente no es modificada

#### Scenario: Fuente ilegible

- **WHEN** la DB fuente no existe o no es un archivo SQLite válido
- **THEN** la ingesta continúa con los demás agentes y el fallo queda contado, sin eventos inventados

### Requirement: Semántica acumulativa para filas de sesión

Para agentes cuyas filas son agregados acumulativos por sesión (OpenCode), el sistema SHALL reemplazar la métrica previa de la sesión (nunca acumular duplicados) y SHALL considerar la reingesta idempotente cuando los valores no cambiaron. El timestamp SHALL derivarse de los tiempos de la fila fuente (`time_updated` como fin de sesión).

#### Scenario: Sesión que crece entre ingestas

- **WHEN** una sesión acumulativa aumenta sus tokens y se re-ingesta
- **THEN** la métrica de la sesión refleja el valor nuevo sin duplicar el anterior

#### Scenario: Sesión sin cambios

- **WHEN** una sesión acumulativa no cambió entre ingestas
- **THEN** la reingesta no escribe filas nuevas de usage_events

### Requirement: Fuentes append-only con insert-or-ignore

Para agentes cuyas filas son eventos por request (grok-cli), el sistema SHALL usar claves de dedup estables por fila (session + rowid) con insert-or-ignore, de modo que la reingesta sea incremental. Los costos provistos por el proveedor SHALL ignorarse cuando existan tokens de donde derivar el costo equiv-API (grok-cli, Amp, Goose); para fuentes sin tokens mantenibles (Crush), el costo del proveedor SHALL registrarse directamente y documentarse como excepción.

#### Scenario: Reingesta incremental

- **WHEN** la fuente agrega filas nuevas y se re-ingesta
- **THEN** solo las filas nuevas generan eventos y el conteo de insertados refleja el delta

#### Scenario: Costo del proveedor ignorado

- **WHEN** una fila trae costo propio del proveedor y existen tokens para derivar el costo equiv-API
- **THEN** el evento se cuesta vía pricing.json (0 + aviso si el modelo es desconocido), nunca con el costo del proveedor

#### Scenario: Fuente cost-only (Crush)

- **WHEN** una sesión de Crush solo persiste costo en USD sin tokens mantenibles
- **THEN** se registra un evento con el costo directo del proveedor y tokens en cero, contribuyendo al gasto pero no a las métricas de tokens

