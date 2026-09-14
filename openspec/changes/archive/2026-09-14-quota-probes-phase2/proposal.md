# Proposal: quota-probes-phase2

## Why

C2 del implementation plan: la spec `quota-probes` ya define la Fase 2 ("extensible registry: Gemini, Copilot, OpenRouter") pero solo Fase 1 está implementada. Los tres proveedores son fixture-driven (sin credenciales locales en la máquina de desarrollo).

## What Changes

- Tres probers nuevos (parsers puros testeados + probe con credencial inyectable):
  - **Gemini**: POST `retrieveUserQuota` con OAuth de `~/.gemini/oauth_creds.json` + `projectId` (config/env `GEMINI_PROJECT_ID`); `buckets[]` por `modelId` con `usedPercent = (1 − remainingFraction)·100` y `limit ≈ remainingAmount / remainingFraction`.
  - **Copilot**: GET `copilot_internal/user` con `oauth_token` de `~/.config/github-copilot/apps.json`; `quota_snapshots.*.percent_remaining` (restante) → `usedPercent = 100 − percent`; entradas `unlimited` se omiten; ventana mensual con `quota_reset_date`.
  - **OpenRouter**: GET `/api/v1/key` con `OPENROUTER_API_KEY`; `data.{usage, limit}` → porcentaje de crédito usado.
- `ProberContext` gana las rutas/keys de los tres; registry `PHASE1_PROBERS` → `ALL_PROBERS` (6 proveedores); config `quota.providers` valida `gemini|copilot|openrouter` (default true) + `geminiProjectId?`.
- UI: labels de los tres proveedores nuevos.

## Capabilities

<!-- skip_specs: true — la spec quota-probes YA define la Fase 2 (requirement "Probes de cuota por proveedor": "Fase 2 (registry extensible): Gemini, Copilot, OpenRouter"). Esto es implementación de lo especificado. -->

## Impact

Solo core + insights(config) + labels UI. Sin cambios de endpoints ni caché.
