## 1. Quota probes core

- [ ] 1.1 Create `packages/core/src/quota/types.ts` with `QuotaSnapshot {provider, model?, window, usedPercent?, limit?, remaining?, resetsAt?, plan?, fetchedAt, origin: 'live'|'offline-stale'}` and `QuotaStatus = 'live'|'stale'|'error'|'no-credential'|'disabled'`; a types/contract test. Verify: compiles and the test passes.
- [ ] 1.2 Implement the `data/quota-cache.json` cache with atomic writes (tmp+rename), configurable TTL and offline reads; round-trip tests: write→read→expired. Verify: `pnpm test -- quota`.
- [ ] 1.3 Implement the prober registry (`quota/probers.ts`) with contracts matching the ingest adapters (id, `probe(ctx): Promise<QuotaSnapshot[]>`), isolated parallel execution (an individual failure doesn't affect the rest) with a 15 s timeout per prober. Verify: test with one prober that throws and another that hangs — correct partial result.

## 2. Phase 1 probers

- [ ] 2.1 Claude prober: read `~/.claude/.credentials.json` ('r' flag, field `claudeAiOauth.accessToken`, detect an expired `expiresAt` → error "token expired"), `GET /api/oauth/usage` with `anthropic-beta: oauth-2025-04-20`; parser tolerant to both flat buckets and `limits[]`; test with fixtures of both forms. Verify: fixture tests green without network.
- [ ] 2.2 Codex prober: read `~/.codex/auth.json` (`tokens.access_token`, `tokens.account_id`), `GET chatgpt.com/backend-api/wham/usage` with header `chatgpt-account-id`; map `primary_window`/`secondary_window` (window duration → five_hour/weekly; verify the unit first — local artifacts use minutes: 300 = 5h, 10080 = weekly); test with a fixture + fake fetch. Verify: fixture test green.
- [ ] 2.3 Codex offline fallback: extract `rate_limits` from the last `token_count` event in the rollouts already discovered by the codex adapter, mark `origin: 'offline-stale'`; live takes precedence over stale; test with a rollout fixture. Verify: test green.
- [ ] 2.4 Z.ai prober: key from `config.quota.providers.zaiApiKey` or env `ZAI_API_KEY`; no key → `no-credential`; parser tolerant to form A (`data.limits[]`, unit 3/4/5/6 → window, `nextResetTime` ms) and form B (`data.total_usage`); tests with fixtures of both forms + a no-credential test. Verify: tests green.
- [ ] 2.5 Sanitization: a test guaranteeing that neither credentials nor auth headers appear in snapshots, cache, logs or errors (a fixture with a fake-real token in a file and assertions of absence across all outputs). Verify: test green.

## 3. Config and server

- [ ] 3.1 Add and validate in `config.json`: `quota.providers.{claude,codex,zai}` (default true), `zaiApiKey?`, `refreshTtlMinutes` (default 5), `autoRefresh` (default false); validation tests (defaults, invalid type rejected, disabled provider excluded from refresh). Verify: config tests green.
- [ ] 3.2 `GET /api/quota` (from cache, no network, with states + age) and `POST /api/quota/refresh` (runs enabled probers in parallel, 30 s debounce, per-provider result); tests with a fake fetch: partial response, debounce, no network → stale. Verify: server tests green.
- [ ] 3.3 Opt-in auto-refresh in the server (timer subject to the TTL) per the implementation decision; a test that with `autoRefresh: false` there are never background network calls. Verify: test green.

## 4. UI + CLI

- [ ] 4.1 CLI `quota`: table per provider/model/window with % used, relative reset, plan, status badge and age if stale; `--refresh` forces a probe; `--json`. Verify: manual run with real Claude/Codex credentials and Z.ai without a key (no-credential visible).
- [ ] 4.2 "Quota" section on Home: rows per provider/model/window, % used bar with threshold colors (warn ≥70%, critical ≥90%), relative reset, status badge; credential instruction only on no-credential; no aggregation across models or windows. Verify: manual screenshot with real data and with an expired cache (stale visible).
- [ ] 4.3 Error handling in the UI: a prober in error shows a sanitized cause and a retry button (refresh); the disabled state hidden or marked per spec (pick one and test it). Verify: manual + endpoint test.

## 5. Full verification

- [ ] 5.1 `pnpm lint && pnpm typecheck && pnpm test && pnpm run build` green (baseline 101 + pricing-updater + new ones).
- [ ] 5.2 Manual E2E documented in the PR: with network and real credentials, `quota --refresh` populates the Claude/Codex bars; kill the network → the UI serves stale with age; Z.ai without a key shows the instruction; confirm no credential appears in `data/` or logs.
