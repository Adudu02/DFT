# Tasks: search-prompts-streaming

## 1. Streaming de búsqueda

- [x] 1.1 Factorizar `promptFromLine()` y reescribir `searchPrompts` con `readline` + `createReadStream` (solo lectura), con corte temprano al máximo y `continue` por sesión ilegible. Verificar: `pnpm --filter motor-agentico-core test` pasa (tests de searchPrompts incluidos).

- [x] 1.2 Test de semántica multi-match: una sesión con 2 prompts que coinciden aporta 2 resultados (guardia de equivalencia). Verificar: el test nuevo pasa.

## 2. Verificación integral

- [x] 2.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm run build` — todo en verde. Verificar: salida limpia en los cuatro comandos.
