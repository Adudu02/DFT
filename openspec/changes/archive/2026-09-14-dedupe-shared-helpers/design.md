# Design: dedupe-shared-helpers

## Context
Ver proposal.md. El campo `day` de `UsageEvent` (computado distinto por adapter) NO se toca: aunque `ingestAll` recalcula vía `dayInTz` al insertar, el campo es parte del tipo exportado y quitarlo es un cambio de API sin ganancia clara — queda documentado como decisión.

## Decisions
1. `ParsedLine` en `types.ts` junto a `UsageEvent` (donde vive el contract de datos).
2. `homePath` en `lib/paths.ts` (dueño de las rutas canónicas del motor).
3. `toIsoTimestamp` en `lib/time.ts` (dueño del tiempo), con la heurística epoch-s/ms del adapter grok (el más tolerante).

## Risks
Ninguno: sustitución mecánica verificada por la suite completa.
