# agent-usage-ingestion — Delta Spec

## ADDED Requirements

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

Para agentes cuyas filas son eventos por request (grok-cli), el sistema SHALL usar claves de dedup estables por fila (session + rowid) con insert-or-ignore, de modo que la reingesta sea incremental. Los costos provistos por el proveedor SHALL ignorarse: el costo es equiv-API de pricing.json, con modelos desconocidos a costo 0 + aviso.

#### Scenario: Reingesta incremental

- **WHEN** la fuente agrega filas nuevas y se re-ingesta
- **THEN** solo las filas nuevas generan eventos y el conteo de insertados refleja el delta

#### Scenario: Costo del proveedor ignorado

- **WHEN** una fila trae costo propio del proveedor
- **THEN** el evento se cuesta vía pricing.json (0 + aviso si el modelo es desconocido), nunca con el costo del proveedor

### Requirement: Cobertura del registry extendida a fuentes SQLite

El registry SHALL incluir los adapters SQLite (OpenCode, grok-cli) con sus raíces por defecto (`~/.local/share/opencode/opencode.db`, `~/.grok/grok.db`) bajo la misma regla de aislamiento de tests de los adapters de archivo, y `rootsFromConfig` SHALL exponer sus claves.

#### Scenario: Ingesta cubre siete agentes

- **WHEN** `ingestAll` corre sin overrides de raíces
- **THEN** descubre y procesa fuentes de Claude Code, Codex, Qwen, ZCode, Gemini, OpenCode y grok-cli

#### Scenario: Aislamiento de tests preservado

- **WHEN** un test sobreescribe `projectsRoot` sin pasar `opencodeRoot`/`grokRoot`
- **THEN** los adapters SQLite no se incluyen
