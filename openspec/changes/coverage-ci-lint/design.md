# Design: coverage-ci-lint

## Context

Lint actual: `recommended: false` + `noUnusedVariables`. Dry-run con `recommended: true` arroja 39 errores / 57 warnings / 26 infos — los FIXABLE (`style/useTemplate`, `complexity/useLiteralKeys`) son mayoría de los errores; `suspicious/noExplicitAny` domina los warnings, concentrado en fixtures de tests donde `any` es deliberado (transcripts con formas variadas). El CI actual corre un solo job en Node 22; `engines` declara `>= 20`. La cobertura no está configurada en ningún workspace. Ver proposal.md.

## Goals / Non-Goals

**Goals:**

- Visibilidad de cobertura local con un comando (`pnpm test:coverage`) y baseline registrado vía umbrales.
- CI que testee las 2 versiones de Node soportadas y gatee vulnerabilidades conocidas.
- `recommended: true` con lint en verde, sin cambios de lógica.

**Non-Goals:**

- No se gatea CI con umbrales de cobertura (primero establecer baseline; gatear es una decisión posterior).
- No se resuelven los 26 infos (nivel informativo; no afectan el exit code).
- No se actualizan dependencias ni se toca código de producto más allá de lo que exija el linter.

## Decisions

1. **Cobertura en raíz y core, no en reporter/server aparte.** El core es el motor (donde importa la cobertura); la raíz cubre la capa app. El reporter (3→10 tests) sigue sin cobertura explícita — visible en el futuro. `@vitest/coverage-v8` como devDep en ambos workspaces; scripts `test:coverage` en raíz y core.
2. **Umbrales = baseline medido, no aspiracional.** Se corre la cobertura una vez, se leen los porcentajes reales y se fijan `lines`/`functions` 2-3 puntos por debajo del baseline actual. Así el umbral previene regresiones sin romper CI por metas no alcanzadas aún.
3. **`noExplicitAny` en `warn`, no `error`.** Los fixtures de tests (transcripts reales recortados) usan `any` con intención: tiparlos todos es ruido sin valor de bug-catching. Warnings no fallan `biome lint`; quedan visibles. Alternativa descartada: `error` + tipar 20+ fixtures ahora.
4. **Auto-fixes primero, manual solo lo behavior-neutral.** `biome lint --write` aplica `useTemplate`/`useLiteralKeys` (equivalentes garantizados). Los errores restantes se corrigen a mano solo si son anotaciones/imports/estructura — si alguno exigiera cambiar lógica, la regla se baja de nivel con comentario y queda anotado para revisión.
5. **Matrix CI `[20, 22]` + audit moderate.** `setup-node` con `node-version` del matrix; Vite 8 requiere Node ≥ 20.19 (CI instala el latest 20.x, cumplido). `pnpm audit --audit-level=moderate` como paso independiente — hoy el árbol está en 0 vulnerabilidades; si aparece una, el CI avisa en el PR.

## Risks / Trade-offs

- [Node 20 en CI falla por una dependencia que asume 22] → Se descubriría exactamente para eso está el matrix; hoy todas las deps declaran soporte 20 (mejor-sqlite3 trae prebuilds para 20/22/24).
- [`pnpm audit` rompe CI por una advisoria futura no relacionada] → Es el gate pedido; se puede afinar con excepciones puntuales si diera un falso positivo.
- [Los auto-fixes tocan más archivos de los esperados] → Son transformaciones equivalence-preserving documentadas por Biome; el typecheck y los 122 tests cubren la regresión.

## Migration Plan

Sin migración. El CI nuevo corre desde el merge de este PR. Rollback = revertir (config + fixes).

## Open Questions

Ninguna que bloquee implementación.
