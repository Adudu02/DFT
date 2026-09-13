# pricing-refresh Specification

## Purpose

Keep `data/pricing.json` up to date without manual editing: download rates from LiteLLM's curated DB, apply local overrides, normalize model names with suffixes/aliases, and make price freshness visible without compromising the engine's offline operation.

## Requirements

### Requirement: Manual update command

The system SHALL expose a CLI command `pricing:update` that updates `data/pricing.json` from LiteLLM's curated DB (`model_prices_and_context_window.json`) merged with `data/pricing-overrides.json`. The command MUST complete without extra arguments and MUST report to the terminal: models updated, added, unchanged, without a rate in the source, and network errors.

#### Scenario: Successful update

- **WHEN** `pricing:update` runs with network available and LiteLLM responds with a valid file
- **THEN** `data/pricing.json` is rewritten with the mapped rates, `verified_at` is set to the execution date, `source_url` points to the downloaded URL, and the terminal report lists the updated/added/unchanged models

#### Scenario: Network failure

- **WHEN** `pricing:update` runs without network or the source doesn't respond
- **THEN** `data/pricing.json` stays intact (not rewritten), the command exits with a non-zero error code and shows an actionable message, without corrupting the previous file

### Requirement: Manual overrides with precedence

The system SHALL support `data/pricing-overrides.json` with the same format and validation as `pricing.json`. Override rates MUST take precedence over LiteLLM's. Existing rates in `pricing.json` for models LiteLLM doesn't know MUST be preserved (the update never removes a locally known model).

#### Scenario: Override wins over LiteLLM

- **WHEN** a model has a rate both in LiteLLM and in `pricing-overrides.json`
- **THEN** the resulting `pricing.json` contains the override's rate and its recorded origin is `override`

#### Scenario: Local-only model

- **WHEN** `pricing.json` has a model that doesn't exist in LiteLLM or overrides
- **THEN** the model is preserved with its current rate and origin `local` (or whatever origin it already had)

### Requirement: Model name normalization

The system SHALL resolve an ingested model's rate even when its identifier differs from the pricing key by date suffixes, provider prefixes, or a known alias (e.g. `claude-haiku-4-5-20251001` resolves to `claude-haiku-4-5`). Resolution MUST be deterministic and MUST prefer exact match over normalized. Already-ingested events are NOT relabeled: normalization operates only at rate lookup (`getRate`), not on stored data.

#### Scenario: Date suffix

- **WHEN** ingest encounters the model `claude-haiku-4-5-20251001` and `pricing.json` contains `claude-haiku-4-5`
- **THEN** the event gets `claude-haiku-4-5`'s rate and is NOT recorded in `UnknownModels`

#### Scenario: Exact match prevails

- **WHEN** both `foo-2` and `foo-2-20260101` exist in pricing and `foo-2-20260101` is ingested
- **THEN** the exact match `foo-2-20260101`'s rate is used

### Requirement: Price freshness badge

The system SHALL record `verified_at` and `source_url` in `pricing.json` on every update, and SHALL expose pricing age via the existing API. The UI and CLI MUST show an expired-prices notice when the age exceeds a configurable TTL (default 7 days). The notice MUST include the manual command instruction. Freshness verification MUST be local (no network).

#### Scenario: Expired pricing

- **WHEN** `verified_at` is older than the TTL days and the API is queried or the report CLI runs
- **THEN** the response includes the `stale` state with the age and the suggested command, and the UI shows the visible badge

#### Scenario: Fresh pricing

- **WHEN** `verified_at` is within the TTL
- **THEN** no notice is shown and the reported state is `fresh`

### Requirement: Ingest auto-check with offline degradation

Ingest MAY run the pricing update in the background when pricing is expired, at most once per ingest session, without blocking ingest. Any failure (network, invalid source) MUST degrade silently: ingest and the dashboard continue with the current pricing. Automatic updating MUST be disableable via `config.json`.

#### Scenario: Ingest without network

- **WHEN** ingest starts with expired pricing and no network
- **THEN** ingest completes normally with the existing pricing and no error is shown to the user (silent log record)

#### Scenario: Auto-check disabled

- **WHEN** `config.json` has automatic updating disabled
- **THEN** ingest never starts network updates and only the manual command updates

### Requirement: Validation before persisting

Every external rate (LiteLLM or overrides) MUST pass the existing validation (`validatePricing`) before being written. If the downloaded source is invalid or incomplete, `pricing.json` MUST remain intact. The write MUST be atomic (no partially written file left on a mid-write failure).

#### Scenario: Corrupt source

- **WHEN** LiteLLM's response doesn't parse as JSON or fails validation
- **THEN** `pricing.json` keeps its previous content and the failure is recorded

#### Scenario: Atomic write

- **WHEN** the process dies during the `pricing.json` rewrite
- **THEN** the file is either the previous or the complete new one, never partial
