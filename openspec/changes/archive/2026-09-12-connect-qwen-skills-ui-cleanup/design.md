# Design: connect-qwen-skills-ui-cleanup

## Context

El registry de adapters (`packages/core/src/adapters/registry.ts`) define el contrato `parseSkills(raw, fromLine): SkillUsage[]` que cada agente implementa. Claude Code y Codex delegan en sus parsers (`parseSkillUsages`, `parseCodexSkills`); Qwen devuelve `() => []` con el comentario "Qwen no expone skills en el formato que detectamos" — obsoleto, porque `parseQwenSkills(raw, fromLine = 0): SkillUsage[]` existe en `qwen.ts` (línea 251) con la misma firma y está testeado en `qwen.test.ts`. En la web, `INLINE_STYLES` es un export vacío inyectado sin efecto en `App.tsx`, y `term.red` comparte `#e56b83` con `term.amber`, haciendo los errores indistinguibles del acento. Ver proposal.md para la motivación completa.

## Goals / Non-Goals

**Goals:**

- Que la ingesta real registre skills de Qwen con el mismo camino que Claude Code y Codex.
- Eliminar el código muerto de estilos inline sin cambio visual.
- Un rojo de error distinguible del acento carmesí, legible sobre el fondo `#121110`.

**Non-Goals:**

- No se toca el formato de detección de `parseQwenSkills` ni el schema de DB.
- No se abordan los demás ítems de `MEJORAS.md` (router, a11y, tests de endpoints, etc.).
- No se rediseña la paleta Nocturne; solo se separa el color de error.

## Decisions

1. **Wiring directo en el registry, siguiendo el idioma existente.** El bloque Qwen pasará a `parseSkills: (raw, fromLine) => parseQwenSkills(raw, fromLine)`, igual que los wrappers de Claude/Codex (en vez de pasar la referencia cruda). Alternativa descartada: mantenerlo desactivado hasta "verificar formato" — el parser ya está testeado contra fixtures reales.
2. **Rojo de error `#ef4444`** (Tailwind red-500) para `term.red`. Alternativas consideradas: `#f87171` (red-400, más suave) y `#fb7185` (rose-400, más cercano al acento — justamente lo que queremos evitar). `#ef4444` maximiza el contraste con `#e56b83` y mantiene legibilidad sobre `#121110`.
3. **Verificación a nivel registry, no solo unitaria.** Además de mantener `qwen.test.ts` en verde, se agrega un test que afirme que el adapter Qwen resuelto por `getAdapters()`/registry expone `parseSkills` distinto del stub vacío (y que extrae un skill de un fixture). Así la regresión original no puede reaparecer silenciosamente.
4. **`INLINE_STYLES` se elimina, no se completa.** Alternativa descartada: poblarlo con estilos reales — no hay necesidad actual y reintroduciría un canal de CSS paralelo a Tailwind.

## Risks / Trade-offs

- [Skills de Qwen falsos positivos en producción] → El parser ya filtra por estructura (`type === "user"`, `message.parts[].text`) y está testeado; la ingesta es incremental y un rebuild (`POST /api/rebuild`) re-deriva todo desde transcripts inmutables.
- [`#ef4444` no agrada visualmente junto a Nocturne] → Cambio de una línea en `tailwind.config.js`, trivialmente reversible; se elige legibilidad funcional (error ≠ decoración) sobre armonía cromática.
- [Volumen de skills crece en la página Skills] → El agregado existente ya pagina/agrupa por skill; Qwen añade datos, no un formato nuevo.

## Migration Plan

Sin migración: la ingesta es incremental sobre transcripts de solo lectura y la DB acepta los usos de skills con el schema actual. Rollback = revertir el commit (ningún estado persistido queda inválido).

## Open Questions

Ninguna que bloquee implementación.
