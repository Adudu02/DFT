# Proposal: search-prompts-streaming

## Why

`searchPrompts()` carga cada transcript **completo en memoria** (`readFileRO`) solo para buscar prompts línea a línea — con sesiones grandes o muchas sesiones candidatas (hasta 200 por búsqueda), el pico de memoria y el costo de I/O son innecesarios (ítem ⑳ de `MEJORAS.md`).

## What Changes

- El parsing de prompts se factoriza a una función por-línea (`promptFromLine`); `extractPrompts` pasa a componerla (mismo resultado).
- `searchPrompts` itera los transcripts con `readline` sobre un `createReadStream` (flag `'r'`, solo lectura) — nunca carga el archivo completo; corta la lectura al alcanzar el límite de resultados.
- Sin cambio de resultados: mismo orden, misma semántica de múltiples coincidencias por sesión, mismo trato de archivos ilegibles.

## Capabilities

<!-- skip_specs: true — optimización interna; el comportamiento observable no cambia. -->

## Impact

- **Código**: `packages/core/src/lib/activity.ts` (único archivo).
- **Riesgo**: bajo — los tests existentes de `searchPrompts` (más uno nuevo de semántica multi-match) cubren la equivalencia.
