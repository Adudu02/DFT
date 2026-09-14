# Tasks: zcode-gemini-adapters

## 1. Adapter ZCode

- [x] 1.1 Crear `packages/core/src/adapters/zcode.ts`: `defaultZcodeRoot`, `discoverZcodeRollouts` (whitelist `model-io-sess_*.jsonl`), `deriveIds` (sessionId de línea, fallback filename), `parseZcodeLines` (evento por `model_io` con usage; líneas sin sesión/corruptas → skipped; dedup `zcode::<requestId>`) y `zcodeAdapter()` con `parseSkills: () => []`. Verificar: `tsc --noEmit` en core pasa.

- [x] 1.2 Test `zcode.test.ts` con fixture sanitizado (3 líneas válidas + 1 sin sessionId + 1 corrupta): eventos, campos (input sin cache read incluido), dedup, whitelist de discovery, skips. Verificar: tests verdes.

## 2. Adapter Gemini CLI

- [x] 2.1 Crear `packages/core/src/adapters/gemini.ts`: `defaultGeminiRoot`, `discoverGeminiChats` (`*/chats/session-*.jsonl`), `deriveIds` (sessionId del filename, project `gemini`), `parseGeminiLines` (cached ⊆ input, thoughts→output, `timestamp` requerido, dedup `gemini::<basename>::<i>`). Verificar: `tsc --noEmit` pasa.

- [x] 2.2 Test `gemini.test.ts` con fixtures sintéticos: cached restado, thoughts plegado, sin timestamp → skipped, discovery por whitelist. Verificar: tests verdes.

## 3. Registry y consumidores

- [x] 3.1 Registrar ambos en `getIngestAdapters` (params `zcodeRoot`/`geminiRoot`, misma regla de aislamiento), ampliar `ingestAll` opts y `rootsFromConfig` (defaults siempre). Verificar: `pnpm --filter motor-agentico-core test` pasa (aislamiento intacto).

- [x] 3.2 Test de integración `agent-coverage.test.ts`: fixture-tree con las 5 fuentes (claude/codex/qwen/zcode/gemini) ingerido vía `ingestAll` con roots explícitos → eventos de todos los agentes en DB. Verificar: test verde.

## 4. Verificación integral

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm run build` — todo en verde. Verificar: salida limpia; la suite server/insights sin cambios de comportamiento (los fixtures herméticos no incluyen zcode/gemini salvo en su test propio).
