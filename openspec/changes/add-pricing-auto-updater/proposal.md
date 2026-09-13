## Why

`data/pricing.json` is maintained by hand (last manual edit 2026-08-19, commit `6466773`). Any new model that shows up in Claude Code / Codex / Qwen / upcoming adapters' transcripts ends up without a rate: the engine logs it in `UnknownModels` and its costs disappear from the dashboard and the Waste page. There is already a real case (`claude-haiku-4-5-20251001` with a date suffix doesn't match `claude-haiku-4-5`) and the user has models from a provider ("Astra") not yet identified that would have no price today. The manual solution (editing JSON by hand on every model release) doesn't scale with the planned multi-agent adapter additions.

## What Changes

- New CLI command `pricing:update` that downloads LiteLLM's curated DB (`model_prices_and_context_window.json`), maps its fields to the engine's `Rate` and updates `data/pricing.json` (merging manual overrides and never touching rates LiteLLM doesn't know).
- New file `data/pricing-overrides.json` (hand-editable, with the same validation as `pricing.json`) for models LiteLLM doesn't cover or with a different local price; it wins over LiteLLM.
- Model-match normalization: aliases/date suffixes (e.g. `claude-haiku-4-5-20251001` → `claude-haiku-4-5`) before declaring a model "unknown".
- Price freshness badge in UI and CLI: `pricing.json` records `verified_at` + `source_url`; if the age exceeds a configurable TTL (default 7 days, calibrated against LiteLLM's real update cadence), UI and CLI show a notice with the manual command instruction. No automatic network calls from the UI.
- Optional auto-check on ingest: when ingest starts, if pricing is expired, the update runs in the background once per session; any network failure degrades silently (ingest and dashboard keep working offline as today).
- Traceability: the updated `pricing.json` records `source_url`, `verified_at`, and per-model origin (`litellm` / `override`).

## Capabilities

### New Capabilities

- `pricing-refresh`: automatic rate updates from a curated source (LiteLLM) with manual overrides, model-name normalization, a freshness badge and offline degradation.

### Modified Capabilities

(none — `config-json-validation` validates `config.json`, not `pricing.json`; the existing pricing validation in `lib/pricing.ts` is reused without changing its observable requirements)

## Impact

- `packages/core/src/lib/pricing.ts`: new override merge + alias/normalization match in `getRate` (compat: the current signature stays, the new behavior only adds matches).
- New `packages/core/src/lib/pricing-update.ts` (LiteLLM fetch, field mapping, merge, atomic write) + its CLI in `packages/core`/`server`.
- Ingest (`packages/core/src/ingest.ts`): optional post-pricing-load hook (non-blocking, best-effort).
- `web/`: freshness badge (Settings and/or Home) reading `verified_at` via the existing `/api/*`.
- `data/pricing-overrides.json`: new file (gitignored, like `pricing.json`).
- No new runtime dependencies: Node's native `fetch`; validation reuses `validatePricing`.
- Network: the engine's only new outbound call; only under an explicit command or an expired auto-check; everything else stays network-free.
