# Design — add-pricing-auto-updater

## Context

`packages/core/src/lib/pricing.ts` defines `Pricing { models: Record<string, Rate>, verified_at?, source_url?, note? }` with `Rate { input, output }` in **USD per million tokens** (strict validation via `validatePricing`, writes use a non-atomic `writeFile`). `costForEvent` (`lib/cost.ts`) applies a fixed heuristic: `cache_write = 1.25×input`, `cache_read = 0.10×input`. Models without a rate → `UnknownModels` (never silently estimated, PLAN §2). `pricing.json` and pricing-adjacent files live in `data/` (gitignored, local state). Today nothing updates that file automatically.

Chosen source: LiteLLM's curated DB — `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json` (~2.3 MB, ~3,900 models, measured cadence: ~84 commits/week, several per day). Format verified 2026-09: a flat object keyed by name; fields `input_cost_per_token` / `output_cost_per_token` / `cache_read_input_token_cost` / `cache_creation_input_token_cost` (**per token, not per million**), `litellm_provider`, `mode` (mostly `chat`), suffixed variants (`*_batches`, `*_priority`, `*_flex`, `*_above_272k_tokens`).

The "Astra" case is solved: it's `gpt-6-astra` (OpenAI, 2026-09-03; $10/$50 per 1M standard). It's already in LiteLLM's DB — the updater picks it up with no special code. No override needed unless the user wants a different rate.

## Goals / Non-Goals

**Goals:**
- Update `pricing.json` with one command, and optionally in the background at ingest time when pricing is expired.
- Clear precedence: manual override > LiteLLM > preserved local rate.
- Robust name matching (date suffixes, provider prefixes) without relabeling already-ingested data.
- Visible freshness (badge) computed locally, no network.
- Total offline degradation: everything keeps working without network, as today.

**Non-Goals:**
- `Rate` is not extended to 4 fields (real per-model cache read/write) — `costForEvent`'s 1.25×/0.10× heuristic stays; LiteLLM's cache fields are ignored for now (separate decision, see Open Questions).
- No scraping of providers' official pages.
- No retroactive recompute of costs for already-ingested events (left for a manual re-ingest).
- No CI/scheduled jobs: the TTL only governs when it *suggests* or runs the check locally.

## Decisions

1. **LiteLLM raw JSON as the single source, native fetch.** Alternatives: official scraping (fragile, one parser per provider, decided against with the user), mirror npm packages (`llmcalc`, `tokenworth` — no guaranteed maintenance, add a dependency). Node 18+ native `fetch`; URL configurable in `config.json` to point at your own mirror if ever needed.
2. **Per-token → per-million conversion in the mapper** (`×1_000_000`, rounding to 6 decimals to avoid float noise). Entries without both `input_cost_per_token` and `output_cost_per_token` are filtered out, and `mode === 'chat'` / `'responses'` is prioritized (drops embeddings, images, audio). The `_batches`/`_flex`/`_priority`/`_above_272k` variants are NOT imported (the engine doesn't distinguish tiers; importing the cheap variant would underestimate costs — the standard rate is always taken).
3. **Merge with 3 recorded origins:** new optional per-model `sources` field (`"litellm" | "override" | "local"`) written by the updater; `getRate` ignores it (reporting only). Overrides win; local models LiteLLM doesn't know are preserved. Rejected alternative: keeping two separate files consulted at runtime — it would duplicate resolution logic in every reader.
4. **Match normalization in `getRate` (resolution layer, not data layer):** order — (a) exact match; (b) strip the 8-digit date suffix (`-20251001`) if the prefix exists as a key; (c) match a LiteLLM key with provider prefix (`openai/gpt-6-astra` → `gpt-6-astra`). Deterministic, no fuzzy matching or embeddings. Events in the DB keep the original model name; normalization happens only at rate lookup.
5. **Atomic write:** write to `pricing.json.tmp` + `rename` (same dir, atomic on POSIX). Replaces `savePricing`'s direct `writeFile`.
6. **Default TTL 7 days, configurable** (`config.json` → `pricing.maxAgeDays`). Justified by the measured cadence: the source changes several times a day, but the relevant models (top providers) change weekly at most; daily checks add no value and multiply 2.3 MB downloads. The TTL governs: (a) the badge's `stale` state, (b) whether ingest triggers the auto-check. At most one auto-check per ingest session (in-memory flag).
7. **Best-effort auto-check off the critical path:** in `ingest.ts`, after loading pricing, if `stale` and enabled (`config.json` → `pricing.autoUpdate`, default `true`), fire the update without a blocking `await`; every exception is logged and ignored. Ingest never fails or slows down because of the network.
8. **CLI `pricing:update` in `packages/core`** (the CLI's existing binary), with a `--json` mode for tests/scripting. The UI badge reads `verified_at` via an existing `/api/*` config/state endpoint (a field is added, not a new endpoint, unless no suitable one exists — verify at implementation; otherwise `GET /api/pricing-status`).

## Risks / Trade-offs

- [LiteLLM renames fields or changes format] → strict `validatePricing` validation + source schema validation before the merge; on an invalid source, `pricing.json` stays intact with a clear error. The mapper concentrates the coupling in a single testable module with a local fixture.
- [False positive in suffix normalization (two real models differing only by an 8-digit suffix)] → rule (b) only applies if the prefix exists as an exact key in the final pricing; with no candidate prefix, it stays `unknown` (current, safe behavior).
- [Standard rate vs the long-context tier (>272K) of `gpt-6-astra` underestimates costs of huge prompts] → accepted: the engine doesn't model tiers; documented in the generated pricing's `note`.
- [2.3 MB download on every auto-check] → bounded by the TTL + once per session; the manual command is explicit.
- [`sources` adds a new field to `pricing.json`] → `validatePricing` treats it as optional (`Record<string, string>`), fully backwards compatible with existing files lacking the field.

## Migration Plan

1. Deploy the code; the current `pricing.json` keeps working unchanged (new fields are optional).
2. The user runs `pnpm pricing:update` once: the migrated file gains `verified_at`/`source_url`/`sources` and the new models (including `gpt-6-astra`).
3. Rollback: delete `data/pricing.json.tmp` if left over and restore the previous `pricing.json` (or let the badge mark `stale` — the system degrades the same). No DB migration.

## Open Questions

- Does an `/api/*` endpoint already expose pricing metadata, or should `GET /api/pricing-status` be created? Resolved at implementation (doesn't change specs: the requirement is "the API exposes pricing age").
- Extending `Rate` with LiteLLM's real `cacheRead`/`cacheWrite` (removes the 1.25×/0.10× heuristic): a separate decision with impact on `costForEvent` and historical data; documented but not included in this change.
