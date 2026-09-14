# Design: zcode-gemini-adapters

## Context

Formato de ZCode **verificado contra datos reales** (2026-09-13, `~/.zcode/cli/rollout/`): cada línea es un evento `model_io` con `completedAt` (ISO), `sessionId` (`sess_<uuid>`, coincide con el filename `model-io-sess_<uuid>.jsonl`), `requestId`, `model.modelId`, y `response.usage = {inputTokens, outputTokens, totalTokens, cacheReadTokens, cacheWriteTokens}`. Invariante observado: `totalTokens = inputTokens + outputTokens` exacto → `cacheReadTokens` va **aparte** del input (convención Anthropic; el backend de ZCode usa cache_control ephemeral). Existe `model-io-no-session.jsonl` con usage pero `sessionId: null`. Gemini CLI: **sin datos locales** en esta máquina — formato según el research del plan (fixtures sintéticos). Ver proposal.md.

## Goals / Non-Goals

**Goals:**

- Ambos adapters dentro del contract `IngestAdapter` (`discover`/`deriveIds`/`parseLines`/`parseSkills`), whitelist estricta de discovery, dedup estable.
- ZCode visible en el dashboard del usuario real tras rebuild (GLM-5.3-Flash aparecerá como unknown-model: costo 0 + badge, nunca estimado).

**Non-Goals:**

- SQLite de ZCode (`db.sqlite`): es A2 (generic SQLite engine) — el JSONL basta para A1.
- Prompts de ZCode/Gemini: los rollouts `model_io` no tienen mensajes de usuario extraíbles limpios; `getSessionTurns` devolverá `[]` (transcript sin prompts de usuario). Prompt extraction es un follow-up si el formato lo permite.
- Legacy `session-*.json` de Gemini (formato legacy sin muestra real): fuera de alcance; solo `session-*.jsonl`.
- Env overrides (`GEMINI_DATA_DIR` etc.): ningún adapter existente los usa; se mantiene la consistencia (defaults + roots inyectables).

## Decisions

1. **ZCode: convención Anthropic para el input.** `totalTokens = inputTokens + outputTokens` exacto en datos reales demuestra que `cacheReadTokens` no está dentro de `inputTokens` reportado → `input = inputTokens`, `cacheRead = cacheReadTokens` (idéntico al treatment de Claude Code). Si un futuro backend cambiara la convención, el test de invariant lo detectaría.
2. **Identidad de sesión: línea primero, filename como fallback.** `sessionId` de la línea (`sess_<uuid>`); si falta, se deriva del filename (strip `model-io-` + extensión). Líneas sin ninguno → `skipped` (el archivo `no-session` entero cae aquí). Discovery: solo `model-io-sess_*.jsonl`.
3. **Gemini: `cached ⊆ input` y reasoning→output.** `input = tokens.input − (tokens.cached ?? 0)`, `output = tokens.output + (tokens.thoughts ?? 0)` — mismas convenciones que el adapter de Qwen (donde `inputTokens − cachedTokens` y thoughts pliegan a output). `timestamp` requerido por mensaje: sin él no hay día (`day`) posible → línea saltada y contada.
4. **Dedup estable sin identidad global:** ZCode `zcode::<requestId>` (presente en datos reales); Gemini `gemini::<basename>::<lineIndex>` (los chats son append-only y los offsets por archivo evitan re-leer).
5. **Registry: misma regla de aislamiento.** `zcodeRoot`/`geminiRoot` se auto-incluyen solo cuando NO hay override de `claudeRoot` (o se pasan explícitos) — los 4 tests de ingesta existentes siguen herméticos sin tocarlos.
6. **Fixtures de ZCode sanitizados:** sintéticos con la forma real (raíz mínima: `completedAt`, `requestId`, `sessionId`, `model.modelId`, `response.usage`) — nunca el `request.body` completo (contiene el system prompt y contexto del usuario).

## Risks / Trade-offs

- [El formato de Gemini CLI real difiere del research] → El adapter es fixture-driven y el parser tolera `thoughts`/`tool`/`cached` ausentes; cuando existan datos reales, el fixture se regenera de ellos (el test es la especificación ejecutable).
- [`GLM-5.3-Flash` queda como unknown-model] → Comportamiento seguro existente (costo 0 + badge); el override en `pricing-overrides.json` lo resuelve para el usuario sin código.
- [`model-io-no-session` contiene usage real no contabilizado] → Aceptado: sin identidad de sesión no cumple el modelo de datos; documentado en el adapter.

## Migration Plan

Sin migración: la primera ingesta descubre los rollouts nuevos (offsets por archivo desde cero). Rollback = revertir (adapters nuevos + 2 líneas de registry).

## Open Questions

Ninguna que bloquee implementación.
