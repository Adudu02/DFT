# Proposal: dedupe-shared-helpers

## Why

Tras A1/A2/C1 se acumularon tres duplicaciones reales: `ParsedLine` definido 6 veces (5 internas + 1 export del registry), `joinHome()` copiado en 3 módulos, y dos helpers de timestamp casi idénticos (`epochMsToIso` en opencode, `normalizeTimestamp` en grok). Cada adapter nuevo copiaba el patrón en vez de importarlo.

## What Changes

- `ParsedLine` vive una sola vez en `adapters/types.ts`; los 6 adapters lo importan; registry re-exporta para compat.
- `homePath(...)` exportada de `lib/paths.ts` reemplaza las 3 copias de `joinHome`.
- `toIsoTimestamp(value)` en `lib/time.ts` (epoch-s/ms/ISO, heurística >1e12) unifica la normalización de opencode y grok.

## Capabilities

<!-- skip_specs: true — refactor puro; sin cambio observable. -->

## Impact

Solo core; 205 tests existentes pasan sin cambios (verificación de equivalencia).
