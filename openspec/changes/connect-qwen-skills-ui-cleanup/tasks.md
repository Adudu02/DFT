# Tasks: connect-qwen-skills-ui-cleanup

## 1. Conectar skills de Qwen (bug de datos)

- [x] 1.1 En `packages/core/src/adapters/registry.ts`, reemplazar el stub `parseSkills: () => []` del adapter Qwen por el wiring real a `parseQwenSkills` (importado de `./qwen.js`), siguiendo el estilo wrapper de Claude/Codex. Verificar: `grep -n "parseSkills" packages/core/src/adapters/registry.ts` ya no muestra el stub vacío para Qwen.

- [x] 1.2 Agregar test a nivel registry que afirme que el adapter Qwen expone el parser real y extrae un skill desde un fixture mínimo (no el stub vacío). Verificar: `pnpm test` en `packages/core` pasa con el test nuevo.

## 2. Limpieza de código muerto en la web

- [x] 2.1 Eliminar `INLINE_STYLES` de `web/src/constants.ts` y su import + inyección `<style>{INLINE_STYLES}</style>` en `web/src/App.tsx`. Verificar: `grep -rn "INLINE_STYLES" web/src` no devuelve resultados.

## 3. Separar color de error del acento

- [x] 3.1 En `web/tailwind.config.js`, cambiar `term.red` a `#ef4444` con comentario de propósito. Verificar: `grep -n "red:" web/tailwind.config.js` muestra el valor nuevo distinto de `#e56b83`.

## 4. Verificación integral

- [x] 4.1 Ejecutar `pnpm typecheck && pnpm lint && pnpm test` y confirmar que todo pasa (101 tests previos + el test nuevo del registry).
