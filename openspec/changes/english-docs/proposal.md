# Proposal: english-docs

## Why

Los tres documentos públicos (README, case study, security policy) estaban en español y desactualizados tras el sprint de mejoras: seguían diciendo "Node ≥ 20" (la toolchain real exige 22.13+), omitían Qwen en el arranque, y `SECURITY.md` describía como "pendiente" una migración de toolchain que ya se ejecutó — con sus avisos de audit de dev ya resueltos (verificado: `pnpm audit` = 0 vulnerabilidades).

## What Changes

- **README.md** → inglés, actualizado: Node 22+, Qwen como fuente de primera clase, comandos nuevos (`test:coverage`), API completa (`/api/refresh`), deep links por SPA fallback, y una sección "Highlights" que reemplaza el log histórico con el estado real (128 tests, CI matrix Node 22/24 + audit, router + code-splitting, a11y, schema versioning).
- **case-study.md** → inglés, mismo contenido argumental, cifras vigentes.
- **SECURITY.md** → inglés; la sección de dependencias reescrita: la migración vite 8 + vitest 4 ya ocurrió y `pnpm audit` hoy reporta **0 vulnerabilidades en runtime y dev**.

## Capabilities

<!-- skip_specs: true — documentación; ningún requisito cambia. -->

## Impact

- **Archivos**: `README.md`, `case-study.md`, `SECURITY.md`. Cero código.
- **Verificación**: los checks de CI no cambian (markdown no pasa por lint/typecheck); los números citados se verifican contra el estado real del repo (128 tests, audit limpio).
- **Riesgo**: nulo para el producto; riesgo de documentación = citar cifras equivocadas, mitigado verificando contra `pnpm test`/`pnpm audit`.
