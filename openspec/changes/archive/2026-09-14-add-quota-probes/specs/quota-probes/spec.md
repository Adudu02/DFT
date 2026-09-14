# quota-probes — Delta Spec

## Purpose

Show how much remaining quota the user has on each provider/window (5h, weekly, monthly), reading query-only status endpoints with local credentials, without running inference and degrading visibly when there is no credential, network, or fresh data.

## ADDED Requirements

### Requirement: Per-provider quota probes without inference

The system SHALL obtain each enabled provider's remaining quota through query-only HTTP requests authenticated with local credentials, without issuing any inference request. Results SHALL be normalized to the common snapshot `{provider, model?, window, usedPercent, limit?, remaining?, resetsAt, plan, fetchedAt}`, where `model` identifies the specific model when the provider reports per-model limits (e.g. `seven_day_opus`, buckets per `modelId`) and is omitted on plan-wide windows (5h, monthly credit). Phase 1: Claude, Codex, Z.ai GLM. Phase 2 (extensible registry): Gemini, Copilot, OpenRouter.

#### Scenario: Successful Claude probe

- **WHEN** the Claude prober queries `GET api.anthropic.com/api/oauth/usage` with the OAuth token from `~/.claude/.credentials.json`
- **THEN** snapshots are produced for the `five_hour` and `seven_day` windows with `usedPercent` (0–100), `resetsAt` and plan, and `fetchedAt` set to the probe time

#### Scenario: Probes isolated by failure

- **WHEN** one provider's prober fails (network, invalid credential, endpoint down)
- **THEN** the other providers' snapshots are unaffected and the failed provider reports an error state with cause

### Requirement: Read-only credentials, in memory, never persisted

The probers SHALL read credentials with the read-only flag from their known files, MUST use them in memory only and MUST NOT persist them, log them, or include them in reports. If a provider requires a credential not available locally in cleartext (Z.ai), the prober SHALL take it from `config.json`/environment variable and, if absent, report a `no-credential` state with a visible instruction instead of failing silently.

#### Scenario: Z.ai without a configured credential

- **WHEN** there is no Z.ai API key in config/env
- **THEN** Z.ai's snapshot is `no-credential`, the UI shows the setup instruction, and the other providers work normally

#### Scenario: Credential read

- **WHEN** any prober uses a credential
- **THEN** the credential does not appear in logs, reports, cache or API responses (only metadata: plan, window, percentages)

### Requirement: TTL cache with offline degradation

Snapshots SHALL be cached in `data/` with a configurable TTL (default 5 minutes). UI/CLI reads MUST be served from cache without network. Automatic refresh SHALL be opt-in (`quota.autoRefresh`); without it, the snapshot only updates under explicit action. If the snapshot is expired and can't be refreshed, the UI/CLI MUST show the data's age (`stale` state) alongside the last known value.

#### Scenario: Read without network

- **WHEN** `GET /api/quota` or the `quota` CLI is consulted without connectivity and the cache is expired
- **THEN** the last known snapshots are served marked `stale` with their age; no probe blocks the response

#### Scenario: Manual refresh

- **WHEN** the user forces `POST /api/quota/refresh` or `quota --refresh`
- **THEN** the enabled providers' probes run in parallel and the cache is updated with the successful results

### Requirement: Codex offline fallback

The Codex prober SHALL incorporate, when available, the `rate_limits` snapshots embedded in the `token_count` events of the already-ingested rollouts, marked with origin `offline-stale` (5h and weekly windows with `used_percent` and `resets_at` from the last recorded turn). The network data (`GET wham/usage`) MUST take precedence and be marked origin `live`.

#### Scenario: Codex without a credential but with rollouts

- **WHEN** `~/.codex/auth.json` is unusable but there are rollouts with `rate_limits`
- **THEN** Codex's bars are shown with origin `offline-stale` and the age of the last turn, without calling the network

### Requirement: Presentation by real model and window, no aggregation

The UI and CLI SHALL show one bar per provider/model/window with its real window (5h, weekly, monthly, per model), `usedPercent`, reset time and plan. When the provider distinguishes models (Claude: `seven_day_opus` vs `seven_day_sonnet`; Gemini: buckets per `modelId`), each model SHALL have its own row. It MUST NOT aggregate or average different models or windows into a single number. Each bar SHALL indicate the data's state: `live` (fresh), `stale` (with age), `error`, `no-credential`.

#### Scenario: Bars per model

- **WHEN** Claude reports 23% on the 5h window, 81% weekly for Opus and 40% weekly for Sonnet
- **THEN** separate bars are shown for each model/window with their resets, with no combined average across models

#### Scenario: Mixed bars

- **WHEN** Codex reports 40% (5h) from the network and Z.ai has no credential
- **THEN** Codex's bar is marked `live`, and Z.ai shows its credential instruction — with no combined average

### Requirement: Configuration and privacy

Probe availability SHALL be configurable per provider (`quota.providers`), with TTL (`quota.refreshTtlMinutes`) and auto-refresh (`quota.autoRefresh`) in `config.json`, validated by the existing validation. The new API endpoints MUST NOT expose credentials or sensitive data, only normalized snapshots and states.

#### Scenario: Disabled provider

- **WHEN** `quota.providers.copilot` is `false`
- **THEN** no Copilot probes run and it doesn't appear in the quota response (or appears as `disabled`, per the chosen design, unambiguous in tests)
