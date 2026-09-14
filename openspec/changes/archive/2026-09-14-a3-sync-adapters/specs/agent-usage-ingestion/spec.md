## REMOVED Requirements

### Requirement: Cobertura del registry extendida a fuentes SQLite

**Reason:** El título y escenario embebían el conteo de agentes ("siete"), que queda obsoleto al crecer el registry a diez. Se reemplaza por un requisito equivalente con título neutro en conteo.
**Migration:** El nuevo requisito "Cobertura del registry de agentes" conserva la semántica completa (raíces por defecto, regla de aislamiento, rootsFromConfig) y añade el escenario de ruta-personalizada, además de cubrir Goose, Amp y Crush.

## ADDED Requirements

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

## MODIFIED Requirements

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
