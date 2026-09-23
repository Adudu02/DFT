# Motor Agéntico — Implementation Plan (consolidated)

> ✅ **COMPLETADO — 2026-09-16.** Los tres workstreams de este plan fueron implementados y
> archivados en OpenSpec: **A** (10/10 adapters: Claude Code, Codex, Qwen, ZCode, Gemini CLI,
> OpenCode, grok-cli, Goose, Amp, Crush — `zcode-gemini-adapters`, `sqlite-usage-adapters`,
> `a3-sync-adapters`), **B** (pricing auto-updater — `add-pricing-auto-updater`, CLI
> `pricing:update`, `pricing.json` con `verified_at`/`source_url`), **C** (quota probes fase 1+2,
> los 6 providers planeados — `add-quota-probes`, `quota-probes-phase2`). Pendiente solo lo
> marcado como no-goal en el propio plan (Copilot OTel, Cursor dashboard API, Aider, Qwen quota,
> OpenAI paygo balance). Este documento queda como registro histórico; los requisitos vivos viven
> en `openspec/specs/`.
>
> Consolidated 2026-09-13 from three research/Planning briefs into a single implementation plan. Research dates: 2026-09-12/13; formats verified against local machine state and upstream sources at those dates. Re-verify field names before implementing each adapter. Detailed OpenSpec artifacts live in `openspec/changes/` (`add-pricing-auto-updater`, `add-quota-probes`); this document is the standalone context + roadmap.

## What this plan delivers

Three workstreams that turn the local token-accounting dashboard into a complete observability tool for AI coding agents:

- **A. Multi-agent ingestion** — read token usage from every major AI agent's local files (today: Claude Code, Codex, Qwen).
- **B. Pricing auto-updater** — keep `data/pricing.json` current from LiteLLM's curated DB with manual overrides; never lose a model's cost to a missing rate again.
- **C. Quota probes (per model)** — show REMAINING limits (5h / weekly / monthly) for each provider **and each model** (e.g. Claude's `seven_day_opus` vs `seven_day_sonnet` are separate bars; never averaged or merged).

Invariants that apply to all three: local sources are read-only (`'r'` flag); own state lives in `data/`; network is explicit and optional (update command, quota refresh) with silent visible degradation offline; nothing sensitive is persisted or logged; unknowns are shown as unknown (never estimated silently).

---

## Workstream A — Multi-agent usage ingestion

### The three persistence methods (ecosystem-wide)

1. **Local session transcripts** (JSONL/JSON): Claude Code, Codex, Gemini CLI, Qwen, ZCode rollout logs, Grok Build, Amp, Copilot session events.
2. **Local SQLite**: OpenCode, ZCode (`db.sqlite`), grok-cli, Goose, Crush, Cursor, Copilot session-store.
3. **Telemetry/provider-API only**: Copilot CLI tokens (OTel opt-in), Cursor full usage (dashboard API), Aider (nothing persisted), Jules (cloud-only).

Two generic engines (JSONL event parser, SQLite query parser) + a field-name mapping table cover everything with local data. Each adapter = path detection + field mapper into the engine's normalized `UsageEvent {sessionId, ts, day, model, input, output, cacheWrite, cacheRead}` (reasoning tokens fold into `output`; cost is materialized at ingest as `cost_usd`, not an event field; there is no `projectId`/`total` dimension today).

### Field-name families

| Family | Shape | Used by |
|---|---|---|
| Anthropic snake | `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` | Claude Code, Codex, ZCode (JSONL + SQLite) |
| camelCase vendor | `inputTokens`, `cacheReadTokens` | Amp, Qwen, Cursor, Grok Build |
| OpenAI/litellm | `prompt_tokens`, `completion_tokens` | Aider (UI only), OpenHands, Grok Build unified |
| Gemini summary | `input`, `output`, `cached`, `thoughts`, `tool`, `total` | Gemini CLI chat records |
| OTel GenAI | `gen_ai.usage.input_tokens`, `.cache_read.input_tokens`, … | Copilot CLI (opt-in), Gemini telemetry |

### Source reference (paths + token fields, verified)

| Agent | Source | Format | Token fields |
|---|---|---|---|
| Claude Code | `~/.claude/projects/<path>/<uuid>.jsonl` | JSONL | `message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, server_tool_use}` |
| Codex CLI ✅ | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` + `~/.codex/archived_sessions/` | JSONL | `token_count` events: `total_token_usage` (CUMULATIVE) + `last_token_usage` (per-call): `{input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_output_tokens, total_tokens}` |
| Qwen Code ✅ | `~/.qwen/usage/token-usage-YYYY-MM.jsonl` (primary token source) + `usage_record.jsonl` (sessionId→project map only) + `projects/<hash>/chats/*.jsonl` (prompts only) | JSONL | per-request flat `{inputTokens, outputTokens, cachedTokens, thoughtsTokens, totalTokens}` (`usage_record.jsonl` also carries a per-session `models` map, but with session totals — not what the adapter ingests) |
| ZCode | `~/.zcode/cli/rollout/model-io-sess_*.jsonl` and/or `~/.zcode/cli/db/db.sqlite` | JSONL + SQLite | JSONL: Anthropic-style usage per request + normalized. SQLite tables `turn_usage`/`model_usage`: `input_tokens, output_tokens, reasoning_tokens, cache_creation_input_tokens, cache_read_input_tokens, computed_total_tokens, model_id, raw_usage_json` |
| Gemini CLI | `~/.gemini/tmp/<id>/chats/session-*.jsonl` (legacy: single `session-*.json`) | JSONL | `tokens: {input, output, cached, thoughts?, tool?, total}` per `type:'gemini'` message |
| OpenCode | `~/.local/share/opencode/opencode.db` | SQLite | `session.{tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, cost, model, agent}` |
| grok-cli (superagent) | `~/.grok/grok.db` | SQLite | `usage_events(session_id, model, input_tokens, output_tokens, total_tokens, cost_micros)` — no cache fields |
| Grok Build (xAI) | `~/.grok/sessions/<ws>/<id>/updates.jsonl`, `~/.grok/logs/unified.jsonl` | JSONL | unstable multi-family: `inputTokens/input_tokens/promptTokens`, cache read/write variants, `reasoningTokens/thoughtTokens/thinkingTokens`, `modelUsage` map — parse defensively |
| Amp | `~/.local/share/amp/threads/T-<uuid>.json` | JSON | `usage.{inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, credits}` |
| Goose | `~/.local/share/goose/sessions/sessions.db` | SQLite | `sessions.{input_tokens, output_tokens, total_tokens, accumulated_*}` — no cache/reasoning |
| Crush | `~/.local/share/crush/crush.db` | SQLite | `sessions.cost` (USD REAL) only; token columns unmaintained |
| Copilot CLI | `~/.copilot/session-state/`, `session-store.db` | JSONL+SQLite | no local tokens; OTel export only (`COPILOT_OTEL_FILE_EXPORTER_PATH`) |
| Aider | `.aider.chat.history.md` | Markdown | nothing persisted — infeasible without a proxy |

✅ = already integrated in DFT.

### Adapter roadmap (quality ÷ effort)

| Phase | Agent | Engine | Notes |
|---|---|---|---|
| 1 | ZCode | JSONL events | fits existing `parseLines` pattern; sessionId in filename |
| 1 | Gemini CLI | JSONL events | subtract `cached` from `input`; tolerate legacy `.json` |
| 2 | OpenCode | SQLite | usage columns directly on `session`; needs generic SQLite engine (copy DB to temp, query) |
| 2 | grok-cli | SQLite | `usage_events`; cost in **micros**; no cache |
| 3 | Goose / Amp / Crush | SQLite / JSON / SQLite | trivial once engines exist; Crush = cost only |

### Gotchas (workstream A)

1. Cumulative vs per-call counters: Codex `total_token_usage` and Goose `accumulated_*` — delta or use per-call fields.
2. `cached ⊆ input` in Codex and Gemini → `input_real = input - cached` before counting/pricing.
3. Claude Code 2026 builds reported undercounting `usage.input_tokens` (up to 100×; anthropics/claude-code#28197) — cross-check with sources that have independent totals.
4. Missing dimensions tolerated as null: no cache (grok-cli, Goose), no reasoning (Goose, Crush), nothing (Copilot local, Aider).
5. Cost units: grok-cli micros; Crush USD; everyone else — DFT equiv-API pricing.
6. `~/.grok` hosts two different products — detect by `grok.db` vs `sessions/`.
7. Env path overrides to respect: `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GEMINI_DATA_DIR`, `QWEN_DATA_DIR`, `GOOSE_PATH_ROOT`, `COPILOT_HOME`.
8. SQLite sources are live WAL DBs — copy to temp before querying.

---

## Workstream B — Pricing auto-updater

OpenSpec: `add-pricing-auto-updater` (validated; 15 tasks).

### State of the world (verified 2026-09-12)

- `data/pricing.json`: 19 hand-curated models, USD per **million** tokens (`Rate {input, output}`); `Rate` cache costs are a fixed heuristic in `costForEvent` (`cacheWrite = 1.25×input`, `cacheRead = 0.10×input`). Unknown model → rate `null` → cost 0 + `UnknownModels` badge (never estimated silently).
- Codex/ChatGPT models (`gpt-5.4`, `gpt-5.5`, `gpt-5.6-{sol,terra,luna}`) were covered. Real gap found: `claude-haiku-4-5-20251001` (date suffix) didn't match `claude-haiku-4-5`. "Astra" = **`gpt-6-astra`** (OpenAI flagship, 2026-09-03; $10/$50 per 1M standard tier) — already in LiteLLM's DB, so the updater covers it automatically.

### Source (verified)

`https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json` — stable raw URL, ~2.3 MB, ~3,900 entries, ~84 commits/week. Flat object keyed by model name; fields **per token** (×1_000_000 → per million): `input_cost_per_token`, `output_cost_per_token`, `cache_read_input_token_cost`, `cache_creation_input_token_cost`; `litellm_provider`; `mode` (import only `chat`/`responses`); tier variants (`*_batches/_priority/_flex/_above_272k_tokens`) are **never imported** (importing the cheap tier would undercount).

### Requirements (condensed)

1. CLI `pricing:update`: fetch LiteLLM + merge overrides → rewrite `data/pricing.json` atomically with `verified_at`, `source_url`, per-model `sources` (`litellm|override|local`); report updated/added/unchanged/missing-rate/errors; non-zero exit on failure, file untouched on network/parse failure.
2. `data/pricing-overrides.json` (same format/validation) wins over LiteLLM; local-only models never dropped.
3. Model-name resolution in `getRate` (resolution layer only, stored data never relabeled): exact → strip 8-digit date suffix if prefix is an existing key → strip provider prefix (`openai/gpt-6-astra`). No fuzzy matching; no candidate → unknown.
4. Freshness: `pricingAgeStatus` → `fresh | stale | unknown` (missing `verified_at` = unknown); TTL default **7 days** (`config.json` → `pricing.maxAgeDays`), calibrated against measured cadence; badge in UI + CLI warning line, computed locally without network.
5. Optional background check during ingestion when stale — once per session, non-blocking, silent on failure; `pricing.autoUpdate` (default true) disables.
6. All external rates pass `validatePricing`; writes atomic (tmp + rename).

### Gotchas (workstream B)

- LiteLLM format drift → mapper isolated, fixture-tested (include a `gpt-6-astra` entry), invalid source never touches the file.
- Suffix-stripping false positives → rule applies only when the prefix exists as an exact key.
- `gpt-6-astra` >272K tier (2× input, 1.5× output) not modeled → accepted, document in generated `note`.
- Extending `Rate` with real per-model cache costs (removing the 1.25×/0.10× heuristic) is a deliberate non-goal for now — separate change touching `costForEvent` and historical costs.

---

## Workstream C — Quota probes (per model, remaining limits)

OpenSpec: `add-quota-probes` (validated; 16 tasks). **Granularity is per provider AND per model**: a row/bar per `(provider, model, window)` combination; models the provider distinguishes get their own rows (Claude `seven_day_opus` vs `seven_day_sonnet`; Gemini buckets per `modelId`); plan-wide windows (5h common pool, monthly credit) go without a model. Nothing is ever averaged into a global number.

### Verdict matrix (all verified 2026-09-12; field names verbatim in the OpenSpec design (`openspec/changes/add-quota-probes/design.md`))

| Provider | Readable w/o inference? | Endpoint | Credential source | Per-model data? |
|---|---|---|---|---|
| Claude Pro/Max | YES | `GET https://api.anthropic.com/api/oauth/usage` (+ `/api/oauth/profile` for plan) | `~/.claude/.credentials.json` → `claudeAiOauth.accessToken` (macOS keychain `Claude Code-credentials`); header `anthropic-beta: oauth-2025-04-20` | YES: buckets `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`; newer schema adds `limits[]` with `kind: session|weekly_all|weekly_scoped` — parse both shapes |
| Codex (ChatGPT plan) | YES (×2) | Live: `GET https://chatgpt.com/backend-api/wham/usage` (`Authorization: Bearer` + `chatgpt-account-id` from `~/.codex/auth.json`). Offline: `rate_limits` embedded in rollout `token_count` events (stale, free) | `~/.codex/auth.json` → `tokens.{access_token, account_id}` | Windows are plan-wide (`primary_window`/`secondary_window`: `used_percent`, window duration, `reset_at`; local Codex artifacts express windows in **minutes** — `window_minutes: 10080` = weekly, 300 = 5h — re-verify the live endpoint's exact field name/unit before implementing: 300 *seconds* would be 5 minutes, not 5 hours); `additional_rate_limits[]` may carry per-limit names |
| Z.ai GLM Coding Plan | YES (undocumented) | `GET https://api.z.ai/api/monitor/usage/quota/limit` (mirror hosts: `api.chatglm.site`, `open.bigmodel.cn`) | **ZCode's stored key is encrypted (`enc:v1:`) — not readable externally.** User provides plan key (`id.secret`) via `config.json` or `ZAI_API_KEY` | `data.limits[]: {type: CREDIT_LIMIT, percentage, unit (3=h, 6=weeks, 4=days, 5=months), number, nextResetTime epoch-ms}` — per window, not per model; alternate shape B: `data.total_usage {used, limit, remaining}` (epoch-s) — support both. Plan name: `GET /api/biz/subscription/list`. `/api/coding/pcts` does NOT exist |
| Copilot (F2) | YES | `GET https://api.github.com/copilot_internal/user` | OAuth-flow GitHub token (`~/.config/github-copilot/apps.json`); plain PATs don't work | `quota_snapshots.{chat, completions, premium_interactions}.{percent_remaining, remaining, entitlement, unlimited}`, `quota_reset_date` (monthly) |
| Gemini (F2) | YES | `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota` body `{project}` | `~/.gemini/oauth_creds.json` (needs projectId; auto-provisioned via `onboardUser`/`loadCodeAssist`) | YES: `buckets[]: {modelId, remainingAmount, remainingFraction, resetTime}`; `limit ≈ remainingAmount / remainingFraction` |
| OpenRouter (F2) | YES | `GET https://openrouter.ai/api/v1/key` | Bearer inference API key | Key-level (`data.{usage, limit, limit_remaining, is_free_tier}`), not per model; `/api/v1/credits` needs a provisioning key |
| Qwen | NO | — | — | console-only (OAuth free tier discontinued 2026-04-15) |
| OpenAI paygo | Spend only | `/v1/organization/usage/*` + `/v1/organization/costs` (admin key) | admin key | no remaining-balance endpoint (legacy `credit_grants` unsupported) |
| Cursor | Dashboard API only | team auth | — | nothing local |

### Requirements (condensed)

1. Probes are status-only HTTP calls — zero inference; results normalize to `QuotaSnapshot {provider, model?, window, usedPercent?, limit?, remaining?, resetsAt?, plan?, fetchedAt, origin: 'live'|'offline-stale'}` with per-probe status `live | stale(age) | error | no-credential | disabled`.
2. Credentials: read `'r'`-only, in memory only, never persisted/logged/emitted; probes speak only to official hosts; OAuth-expired tokens report "open <agent> to re-login" instead of attempting refresh flows.
3. Cache `data/quota-cache.json`, atomic writes, TTL default 5 min (≤12 probes/h/provider); UI/CLI always answer from cache (offline-first); auto-refresh opt-in (`quota.autoRefresh`, default false); manual refresh debounced ≥30 s, per-provider timeout 15 s, failures isolated.
4. Codex offline fallback: last-turn `rate_limits` from already-ingested rollouts, marked `offline-stale` with age; live data wins.
5. UI (Home section) + CLI `quota [--refresh] [--json]`: one bar per `(provider, model, window)` with % used (warn ≥70%, critical ≥90%), relative reset, plan, state badge; `no-credential` shows setup instruction (exact key/env to set). API: `GET /api/quota` (cache-only) + `POST /api/quota/refresh`.
6. Config (`config.json`, validated): `quota.providers.{claude,codex,zai}` (default true), `zaiApiKey?`, `refreshTtlMinutes` (default 5), `autoRefresh` (default false).
7. Non-goals: no passive header capture (DFT is not a proxy — `anthropic-ratelimit-unified-*`/`x-codex-*` headers need an inference request or MITM); no depletion forecasting; no persistent daemon.

---

## Integrated roadmap

Order chosen so each workstream's infrastructure serves the next (pricing updater's atomic-write + freshness-badge + config patterns are reused by quota probes).

1. **B1. Pricing updater** (self-contained; immediate dashboard value — cost accuracy). Core: `sources` validation, atomic `savePricing`, normalized `getRate`, LiteLLM mapper + merge, CLI, config keys, freshness badge, ingestion hook.
2. **A1. ZCode + Gemini CLI adapters** (pure JSONL, fits existing adapter registry; expands coverage to the agents the user actually runs).
3. **C1. Quota probes Phase 1** (Claude + Codex live/offline + Z.ai; needs SQLite-free infrastructure only). UI bars per model/window + CLI.
4. **A2. Generic SQLite engine** → OpenCode, grok-cli adapters.
5. **C2. Quota probes Fase 2** (Gemini, Copilot, OpenRouter probers plug into the registry).
6. **A3. Goose, Amp, Crush adapters** (cheap once engines exist).
7. **Later / opt-in:** Copilot OTel parsing, Cursor dashboard API (auth required), Aider (proxy only — likely never).

Shared verification gate at the end of every step: `pnpm lint && pnpm typecheck && pnpm test && pnpm run build` (baseline 128 tests: core 83 + insights 24 + reporter 10 + server 11; grows per workstream), plus a manual E2E documented in each PR (real-credential run + offline degradation + credential-absence states).

## Cross-cutting gotchas (read before implementing anything)

- Counters: identify cumulative vs per-call before summing (Codex, Goose).
- `cached ⊆ input` in Codex/Gemini — subtract before pricing.
- Undercount bugs exist in the wild (Claude Code `usage.input_tokens`, 2026) — prefer sources with independent totals.
- Cache cost heuristics vs real per-model cache prices: current engine uses 1.25×/0.10×; changing that is its own decision.
- Units: per-token (LiteLLM) vs per-million (DFT `Rate`); cost micros (grok-cli); USD REAL (Crush).
- Env overrides everywhere: `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GEMINI_DATA_DIR`, `QWEN_DATA_DIR`, `GOOSE_PATH_ROOT`, `COPILOT_HOME`, `ZAI_API_KEY`.
- Undocumented endpoints (Anthropic oauth/usage, chatgpt wham, GitHub copilot_internal, z.ai monitor) are stable in practice but parser-isolated with fixtures; any failure degrades to a visible per-provider state, never corrupts data or blocks other providers.
- No provider caches quota locally (only Codex rollouts embed last-turn snapshots) — always show data age.

## Sources (primary)

- Local machine inspection: `~/.codex`, `~/.qwen`, `~/.zcode`, `~/.local/share/opencode`, `~/.grok` (2026-09-12).
- gemini-cli, qwen-code, codex (openai), superagent-ai/grok-cli, microsoft/vscode source files as cited per workstream.
- ccusage/ccstatusline/claude-powerline (Claude quota precedent), openusage, openclaw (z.ai), opencode-quota/raycast agent-usage (OpenRouter), tokscale (multi-agent field maps).
- LiteLLM `model_prices_and_context_window.json` commit history + raw file structure (2026-09-13).
- Issue trackers: anthropics/claude-code#28197 (undercount), openai/codex#20311, openusage#394.
