# Design — add-quota-probes

## Context

Research from 2026-09-12 (sources and fields verbatim in `docs/quota-probes-context.md`): every active provider exposes remaining quota without inference. What follows is the operational summary that fixes the design:

| Provider | Endpoint | Auth / local credential | Response fields (verbatim) |
|---|---|---|---|
| Claude | `GET https://api.anthropic.com/api/oauth/usage` (+ `GET /api/oauth/profile` for plan) | `Authorization: Bearer <accessToken>` from `~/.claude/.credentials.json` → `claudeAiOauth` (macOS: keychain `Claude Code-credentials`); header `anthropic-beta: oauth-2025-04-20` | Buckets `five_hour`, `seven_day`, `seven_day_opus/sonnet`, `extra_usage`; each `{utilization: 0–100, resets_at: ISO}`; the new schema adds `limits[]` with `kind: session|weekly_all|weekly_scoped` — parse both forms tolerantly |
| Codex | `GET https://chatgpt.com/backend-api/wham/usage` | `Authorization: Bearer <tokens.access_token>` + header `chatgpt-account-id` from `~/.codex/auth.json` | `{plan_type, rate_limit: {allowed, limit_reached, primary_window: {used_percent, limit_window_seconds, reset_after_seconds, reset_at}, secondary_window: {...}}}` (window durations: local Codex artifacts express them in **minutes** — 300 = 5h, 10080 = weekly; 300 *seconds* would be 5 minutes, so re-verify the live endpoint's unit before implementing) |
| Z.ai GLM | `GET https://api.z.ai/api/monitor/usage/quota/limit` (undocumented; stable in practice) | Bearer with the plan's API key in `id.secret` format — ZCode's credential (`~/.zcode/v2/credentials.json`) is encrypted (`enc:v1:`, not readable externally) → key via `config.json`/`ZAI_API_KEY` | Form A: `data.limits[] {type: CREDIT_LIMIT, percentage 0–100, unit (3=h, 6=weeks, 4=days, 5=months), number, nextResetTime epoch-ms}`; form B (ZCode's zod schema): `data.total_usage {used, limit, remaining}` with epoch-seconds — the prober accepts both |
| Copilot (P2) | `GET https://api.github.com/copilot_internal/user` | GitHub OAuth with Copilot (`~/.config/github-copilot/apps.json` → `oauth_token`; a bare PAT does NOT work) | `quota_snapshots.premium_interactions.percent_remaining` (0–100 remaining), `quota_reset_date`, `copilot_plan` |
| Gemini (P2) | `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota` | Google OAuth from `~/.gemini/oauth_creds.json`; requires projectId | `buckets[] {modelId, remainingAmount, remainingFraction, resetTime}`; `limit ≈ remainingAmount / remainingFraction` |
| OpenRouter (P2) | `GET https://openrouter.ai/api/v1/key` | Bearer `OPENROUTER_API_KEY` | `data.{usage, limit, limit_remaining, is_free_tier, rate_limit}` |

Codex offline fallback: the already-ingested rollout JSONL files carry `rate_limits` inside the `token_count` events (`info.rate_limits.primary/secondary {used_percent, window_minutes, resets_at}`) — a snapshot of the last turn, free and without credentials.

## Goals / Non-Goals

**Goals:**
- Normalized snapshot per provider/model/window with states `live | stale | error | no-credential | disabled`.
- Cheap, isolated probes (one per provider, in parallel, tolerant to individual failure).
- Offline-first reads: UI/CLI always answer from cache; network only on refresh.
- Extensible base: registry-style registered probers, same contracts as the ingest adapters.

**Non-Goals:**
- No passive header capture (`anthropic-ratelimit-unified-*`, `x-codex-*`): DFT is not a proxy — out of scope.
- No exhaustion prediction or projections (possible future phase over the already-ingested data + quota).
- Phase 1 doesn't include Gemini/Copilot/OpenRouter (registered as the next step, not implemented).
- No persistent background refresh (daemon): auto-refresh happens in the active server/ingest process.

## Decisions

1. **Active probes, not passive.** Passively reading headers requires intercepting traffic (proxy) or triggering inference — violates the engine's principles. Status endpoints are query-only GET/POSTs, zero token cost.
2. **Common snapshot + explicit states.** `{provider, model?, window, usedPercent, limit?, remaining?, resetsAt, plan, fetchedAt, origin: live|offline-stale}`. Windows are normalized by name (`five_hour`, `weekly`, `monthly`, `model:<id>`); the `model` field carries the specific model when the provider distinguishes them (Claude: `seven_day_opus`/`seven_day_sonnet` buckets and `limits[]` with `kind: weekly_scoped` + `scope.model`; Gemini: buckets per `modelId`) and is absent on plan-wide windows (shared 5h, monthly credit, Copilot). Whatever the provider doesn't give stays `undefined` (never 0). One row per (provider, model, window) combination — never aggregated.
3. **Plain JSON cache, not SQLite** (`data/quota-cache.json`): minimal volume (a few snapshots), atomic tmp+rename write (same pattern as the pricing updater). Default TTL 5 min; `stale` shows age instead of blocking.
4. **Credentials: RO read, memory only.** `~/.claude/.credentials.json` and `~/.codex/auth.json` are read with the existing `'r'` flag. Z.ai needs its own key (ZCode's is encrypted with a machine-derived key) — documented in the UI with the exact instruction. Never in logs: errors log the HTTP status and a sanitized cause.
5. **Tolerant dual response forms (Claude `limits[]` vs flat buckets; Z.ai form A vs B):** one parser per provider with tolerant validation (accept both, fail with a clear cause if neither matches). Z.ai's and Codex's endpoints are undocumented — the parser is the coupling point and is protected with fixtures.
6. **UI: a "Quota" section on Home** (not a new page in Phase 1): rows per provider/model/window, % used bar, relative reset, status badge. The CLI `quota` prints the same table. No combined global bars — different windows are not averaged.
7. **`POST /api/quota/refresh` with a short timeout (10–15 s) per provider**, response with per-provider results (partial ok). Opt-in auto-refresh in the server with a timer subject to the TTL.
8. **Validated config:** `quota.providers.{claude,codex,zai}: boolean` (default true), `zaiApiKey?: string` (or env `ZAI_API_KEY` with config precedence), `refreshTtlMinutes: number` (default 5), `autoRefresh: boolean` (default false). Reuses `config-json-validation`.

## Risks / Trade-offs

- [Undocumented endpoints (Z.ai, Copilot internal, wham) change without notice] → parsers isolated per provider with frozen fixtures; a parse failure = `error` state with cause, never corruption; the other providers are unaffected.
- [Credentials on disk = abuse surface] → RO read, never persisted/logged; probes only talk to each provider's official host; what is read and why is documented (help page).
- [Codex `offline-stale` can mislead (hours old)] → the `offline-stale` badge is always visible with age; never shown as live.
- [Rate limits on the status endpoints themselves] → default 5 min TTL means ≤12 probes/hour/provider; manual refresh bounded by a server-side debounce (ignores refreshes <30 s after the previous one).
- [Claude's OAuth token expires (expiresAt)] → if expired, `error` state with cause "token expired — open Claude Code to renew"; no token refresh attempted (unnecessary complexity for Phase 1; ccstatusline doesn't do it either).

## Migration Plan

1. Deploy: no data migration. `data/quota-cache.json` is born on the first probe.
2. Without a Z.ai credential, its row shows the instruction — the user decides whether to configure it.
3. Rollback: disable `quota.providers.*` or ignore the module — nothing in the existing pipeline depends on it.

## Open Questions

- Does the quota section live on Home or its own page? Decided when seeing Home's density with the bars (doesn't change specs).
- Auto-refresh in the server process with a timer, or only on receiving any UI request (lazy + TTL)? Both satisfy the spec; chosen at implementation based on the server's lifecycle.
