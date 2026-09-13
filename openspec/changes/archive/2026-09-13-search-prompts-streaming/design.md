# Design: search-prompts-streaming

## Context

`extractPrompts(raw)` ya es line-oriented (`raw.split("\n")` + parse por línea), así que la versión streaming es una factorización natural: la lógica por línea sale a `promptFromLine()` y ambos consumidores la reutilizan. `searchPrompts` hoy hace `readFileRO(session.path)` por sesión candidata. Ver proposal.md.

## Goals / Non-Goals

**Goals:**

- Memoria O(1) por transcript (una línea en memoria a la vez), I/O en streaming.
- Resultados bit a bit idénticos a la implementación actual.

**Non-Goals:**

- No se migra `getSessionTurns` a streaming (mismo patrón aplicable; queda como mejora posterior para acotar este change).
- No se indexan prompts en SQLite ni se cachean — sigue siendo búsqueda bajo demanda sobre los transcripts (contrato de privacidad intacto).

## Decisions

1. **`readline` + `createReadStream(path, { encoding: "utf8" })`.** Flag `'r'` por defecto = solo lectura, coherente con la política `fs-readonly` del proyecto. `crlfDelay: Infinity` para tolerar CRLF.
2. **Corte temprano al llegar al máximo.** El `for await` hace `break` cuando `results.length >= max` (además del corte entre sesiones); romper el iterador cierra el readline y destruye el stream.
3. **Errores por sesión, no fatales.** Un transcript ausente/corrupto produce `ENOENT`/error de parseo del stream → `continue` con la siguiente sesión (idéntico al `catch` actual).
4. **`getSessionTurns` conserva `extractPrompts`** — la misma función refactoreada, así que no hay duplicación.

## Risks / Trade-offs

- [El streaming cambia sutilmente el manejo de líneas sin `\n` final] → `readline` emite la última línea parcial igual que `split("\n")`; cubierto por los tests existentes con fixtures reales.

## Migration Plan

Sin migración. Rollback = revertir.

## Open Questions

Ninguna que bloquee implementación.
