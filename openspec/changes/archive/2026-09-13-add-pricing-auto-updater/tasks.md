## 1. Pricing foundations (core)

- [x] 1.1 Extend `validatePricing` to accept an optional `sources` field (`Record<string, string>` with values `litellm|override|local`) and a validation test with/without the field in `packages/core/src/lib/pricing.test.ts`. Verify: `pnpm test -- pricing`.
- [x] 1.2 Make `savePricing` atomic: write to `<path>.tmp` + `rename`, and a test simulating a mid-write failure (previous file intact, no partial `.tmp` after rename). Verify: the new test passes.
- [x] 1.3 Implement normalized resolution in `getRate`: exact match → strip 8-digit date suffix if the prefix is a key → strip provider prefix (`provider/model`). Deterministic and tested. Verify: unit tests with `claude-haiku-4-5-20251001`→`claude-haiku-4-5`, `openai/gpt-6-astra`→`gpt-6-astra`, and an ambiguity case that stays `unknown`.

## 2. Updater (LiteLLM fetch + merge)

- [x] 2.1 Create `packages/core/src/lib/pricing-update.ts`: mapper for LiteLLM's DB (fields `input_cost_per_token`/`output_cost_per_token` ×1_000_000, filter `mode` chat/responses, no `_batches`/`_flex`/`_priority`/`_above_272k` variants) over a trimmed local fixture of the real file. Verify: mapper test with fixture (includes a `gpt-6-astra` entry).
- [x] 2.2 Implement the merge with precedence override > litellm > local-preserved and recording in `sources`; overrides read from `data/pricing-overrides.json` (validated with `validatePricing`). Verify: precedence tests and local-only model preservation tests.
- [x] 2.3 Implement an injectable `runPricingUpdate({ fetchImpl, url, now })`: download, validate source, merge, atomic write, return `{ updated, added, unchanged, missingRate, error? }`; on an invalid source or network down it doesn't touch the file. Verify: tests with a fake fetch (success, 404, corrupt JSON, timeout).
- [x] 2.4 Expose the CLI command `pricing:update` (readable report; `--json` for scripting; non-zero exit code on failure). Add a documented `data/pricing-overrides.json.example`. Verify: `pnpm pricing:update` against the real network updates `data/pricing.json` with `verified_at`/`source_url`/`sources` and reports `gpt-6-astra` among the additions.

## 3. Ingest with auto-check

- [x] 3.1 Add to `config.json` (existing config validation): `pricing.maxAgeDays` (default 7) and `pricing.autoUpdate` (default true). Verify: config validation test with defaults and with an invalid type rejected.
- [x] 3.2 Implement the freshness helper `pricingAgeStatus(pricing, maxAgeDays)` → `{ status: 'fresh'|'stale'|'unknown', ageDays }` (no `verified_at` = `unknown`). Verify: unit tests.
- [x] 3.3 Best-effort hook — ADAPTED to the core/insights split (this change predates it): the hook lives in `insights/pricing-auto.ts` (`autoPricingCheck`, config-aware, once per process) and is wired by `rebuild()` and `buildServer()` (only with default paths, keeping tests hermetic). Same observable behavior: fires `runPricingUpdate` without blocking, max once per session, errors only to log. Test with a fake fetch that ingest completes and pricing updates; test with no network that ingest doesn't notice. Verify: both tests pass and full `pnpm test` green.

## 4. Freshness badge (API + UI + CLI)

- [x] 4.1 Expose freshness status via API (a field on an existing endpoint or `GET /api/pricing-status` depending on what the server code dictates). Verify: curl of the endpoint returns `{status, ageDays, maxAgeDays, verifiedAt}`.
- [x] 4.2 Badge in the UI (Home/Settings): a visible notice only on `stale`/`unknown`, with the suggested command `pnpm pricing:update`; hidden on `fresh`. Verify: screenshot/manual with `verified_at` edited to an old date.
- [x] 4.3 The report CLI (`--waste` or another summary) prints a warning line when pricing is expired. Verify: a run with an old date shows the warning; with a fresh date it doesn't.

## 5. Full verification

- [x] 5.1 `pnpm lint && pnpm typecheck && pnpm test && pnpm run build` green — baseline was 128, now **165 tests** (core 112 + insights 31 + reporter 10 + server 12).
- [x] 5.2 Manual E2E documented in the PR: real `pnpm pricing:update` run against LiteLLM — updated `qwen3.7-plus`/`qwen3-max`, added 1,763 curated models (incl. `gpt-6-astra` $10/$50), preserved the 2 local-only models (`qwen3-plus`, `qwen3-turbo`), set `verified_at`/`source_url`/`sources`; second run idempotent (0 added/updated). Offline/failure paths covered by unit tests with fake fetch (404, corrupt JSON, network down — file intact). `claude-haiku-4-5-20251001` → prefix resolution unit-tested in `getRate`; full re-ingest of live transcripts left to the user (touches the live DB).
