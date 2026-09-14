## Why

The dashboard says how much was spent, but not how much is left. Agents run on windowed plans (Claude Pro/Max: 5h + weekly; Codex/ChatGPT: 5h + weekly; Z.ai GLM Coding Plan: 5h + weekly; Copilot: monthly; OpenRouter: credit), and running out of quota mid-session is the user's real pain. Today there's no way to know what's left without opening each provider's console. The research (2026-09-12, detailed in `docs/quota-probes-context.md`) confirms that every active provider of the user exposes remaining quota via HTTP endpoints with no inference cost, authenticating with credentials that already live on disk.

## What Changes

- New "quota probes": one prober per provider that queries the quota endpoint with the local credential and normalizes the result to a common snapshot `{provider, model?, window, usedPercent, limit?, remaining?, resetsAt, plan, fetchedAt}`. Visibility is **per model**: when the provider reports separate limits per model (Claude: `seven_day_opus`, `seven_day_sonnet`; Gemini: buckets per `modelId`), each model gets its own row; plan-wide windows (5h, monthly credit) carry no model. Models and windows are never aggregated or averaged.
- Phase 1 (the user's active providers): **Claude** (`GET api.anthropic.com/api/oauth/usage` with OAuth from `~/.claude/.credentials.json`), **Codex** (`GET chatgpt.com/backend-api/wham/usage` with the token from `~/.codex/auth.json`; offline fallback: `rate_limits` snapshots embedded in the rollout JSONL already ingested), **Z.ai GLM** (`GET api.z.ai/api/monitor/usage/quota/limit` with the plan's API key — ZCode's encrypted credential is not readable, so its own key is requested via `config.json`/env).
- Phase 2 (extensible via registry): Gemini (retrieveUserQuota), Copilot (copilot_internal/user), OpenRouter (/api/v1/key).
- Snapshot cache in `data/` with a refresh TTL (default 5 min); bar UI per provider/model/window (a section on Home); CLI command `quota`.
- The local read-only principle is explicitly extended: probes issue query-only GET/POSTs to status endpoints — never inference, never writes — and only under user action (manual refresh) or configurable opt-in auto-refresh.
- Security: credentials are read read-only, used in memory, never persisted or logged; probes fail by degrading to "no data" with a visible cause.

## Capabilities

### New Capabilities

- `quota-probes`: reading remaining quota per provider/window via status endpoints, normalization to a common snapshot, TTL cache, bar UI and CLI, visible offline/no-credential degradation.

### Modified Capabilities

(none — the existing ingest doesn't change; Codex's offline fallback reads rollout files already discovered by the existing adapter)

## Impact

- New module `packages/core/src/quota/` (per-provider probers + normalizer + cache) and its registry-style registration.
- `server`: endpoints `GET /api/quota` (cached snapshot) and `POST /api/quota/refresh` (forces a probe).
- `web`: quota bars per provider/window (Home or its own page), loading/stale/error/no-credential states.
- CLI: `quota` (prints a bar table + resets).
- `config.json`: `quota.providers` (per-provider enablement, keys for Z.ai), `quota.refreshTtlMinutes`, `quota.autoRefresh`.
- No new dependencies (native fetch); `data/quota-cache.json` new local file.
