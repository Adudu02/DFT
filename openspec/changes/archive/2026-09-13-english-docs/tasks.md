# Tasks: english-docs

## 1. Documentos en inglés

- [x] 1.1 Reescribir `README.md` en inglés: Node 22+, Qwen en el arranque, highlights actuales (128 tests, CI matrix + audit, router + code-splitting, a11y, schema versioning), API completa con `/api/refresh`, comandos con `test:coverage`. Verificar: los números citados coinciden con `pnpm test` y el CI real.

- [x] 1.2 Traducir `case-study.md` a inglés manteniendo el argumento y cifras. Verificar: mismo número de secciones que el original.

- [x] 1.3 Traducir `SECURITY.md` a inglés y reescribir la sección de dependencias con el estado real (`pnpm audit` = 0 vulnerabilidades post-migración de toolchain). Verificar: sin referencias a "upgrade path pendiente".

## 2. Verificación

- [x] 2.1 `pnpm test && pnpm run build` — todo en verde (los docs no afectan código, pero se confirma que el árbol queda sano). Verificar: salida limpia.
