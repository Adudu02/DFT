# Proposal: coverage-ci-lint

## Why

Tres ítems de infraestructura de calidad de `MEJORAS.md` pendientes: ⑯ no hay visibilidad de cobertura (`@vitest/coverage-v8` sin configurar), ⑰ el CI solo corre Node 22 aunque `engines` declara `>= 20` (Node 20 nunca se testea) y no hay `pnpm audit` en CI, y ⑱ Biome corre con `recommended: false` (solo `noUnusedVariables`), dejando pasar reglas útiles.

## What Changes

- **⑯ Cobertura**: `@vitest/coverage-v8` como devDependency (raíz + core), configuración `coverage` en los dos `vitest.config.ts`, scripts `test:coverage` en raíz y core. Umbrales fijados al baseline medido (con margen), **sin** gatear CI con cobertura todavía.
- **⑰ CI**: matrix de Node `[20, 22]` y paso nuevo `pnpm audit --audit-level=moderate`.
- **⑱ Biome**: `recommended: true` en `biome.json`, auto-fixes seguros aplicados y correcciones manuales behavior-neutral; `noExplicitAny` queda en `warn` (los fixtures de tests lo usan legítimamente). `pnpm lint` debe quedar en verde.

## Capabilities

<!-- skip_specs: true — tooling/infra; ningún requisito observable del producto cambia. -->

## Impact

- **Archivos**: `biome.json`, `.github/workflows/ci.yml`, `vitest.config.ts` (raíz), `packages/core/vitest.config.ts`, `package.json` (raíz + core), y los archivos fuente con auto-fixes/correcciones de lint.
- **Dependencias**: `@vitest/coverage-v8` (devDependency, raíz + core).
- **CI**: ahora corre en 2 versiones de Node y falla con vulnerabilidades ≥ moderate. La cobertura es visibilidad local, no gate.
- **Riesgo**: bajo — auto-fixes de estilo (comillas de propiedad, template literals) son behavior-neutral; las correcciones manuales se limitan a tipado/anotaciones, nunca lógica.
