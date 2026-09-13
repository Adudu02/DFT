# Proposal: connect-qwen-skills-ui-cleanup

## Why

La auditoría de `MEJORAS.md` (2026-08-27) dejó tres quick wins verificados y sin ejecutar. El más importante es un bug real de datos: el adapter de Qwen implementa `parseQwenSkills()` (testeado en `qwen.test.ts`), pero el registry devuelve `parseSkills: () => []`, así que la ingesta descarta silenciosamente los usos de skills de Qwen — la página Skills y `/api/skills` subreportan. Se aprovecha el mismo cambio para dos limpiezas de riesgo cero: código muerto (`INLINE_STYLES`) y un color de error indistinguible del acento decorativo (`term-red` ≡ `term-amber` = `#e56b83`).

## What Changes

- Conectar `parseQwenSkills` en el adapter Qwen del registry (`packages/core/src/adapters/registry.ts`), de modo que los comandos `/skill` en transcripts de Qwen entren a la ingesta real.
- Eliminar el export muerto `INLINE_STYLES` (`web/src/constants.ts`) y su inyección `<style>{INLINE_STYLES}</style>` en `web/src/App.tsx`.
- Asignar a `term.red` un rojo distintivo (`#ef4444`) en `web/tailwind.config.js`, separándolo del acento carmesí `term.amber` (`#e56b83`), para que los errores sean reconocibles por color.

## Capabilities

### New Capabilities

- `skills-ingestion`: detección e ingesta de usos de skills (`/skill`) desde los transcripts de cada agente vía el registry de adapters — incluye el requisito de que ningún adapter descarte skills de forma silenciosa.

### Modified Capabilities

<!-- Ninguna: openspec/specs/ está vacío; no hay requisitos previos que modificar. -->

## Impact

- **Código**: `packages/core/src/adapters/registry.ts` (wiring Qwen), `web/src/constants.ts` + `web/src/App.tsx` (código muerto), `web/tailwind.config.js` (color).
- **Datos**: `getSkills()` y la página Skills pasarán a incluir usos de skills de Qwen en la siguiente ingesta; sin cambios de schema de DB (las skills ya se persisten por la vía existente).
- **API**: sin cambios de contratos; `/api/skills` devuelve más datos para usuarios de Qwen.
- **Tests**: `qwen.test.ts` existente debe seguir pasando; se agrega verificación de que el registry expone el parser real de Qwen.
- **Riesgo**: bajo — el parser ya existe y está testeado; los otros dos ítems son cosméticos/muertos.
