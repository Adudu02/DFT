# Tasks: dedupe-shared-helpers

- [x] 1.1 `ParsedLine` única en `adapters/types.ts` (6 copias → 1 + re-export). Verificar: `pnpm test` verde.
- [x] 1.2 `homePath` en `lib/paths.ts` (3 copias de `joinHome` fuera). Verificar: `pnpm test` verde.
- [x] 1.3 `toIsoTimestamp` en `lib/time.ts` (opencode + grok). Verificar: `pnpm test` verde (incluye casos epoch-s/ms/sin-timestamp de grok).
- [x] 1.4 `pnpm typecheck && pnpm lint && pnpm test && pnpm run build` en verde.
