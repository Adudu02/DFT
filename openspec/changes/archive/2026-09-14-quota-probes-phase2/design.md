# Design: quota-probes-phase2

## Context
Matriz verificada 2026-09-12 (docs/implementation-plan.md workstream C): Gemini necesita projectId además del OAuth; Copilot reporta percent_remaining (RESTANTE, no usado) y entradas unlimited; OpenRouter es key-level (crédito), no per-model. Ver proposal.md.

## Decisions
1. **Parsers puros por proveedor** (mismo patrón Fase 1): fixture = spec ejecutable; tolerantes a campos ausentes.
2. **percent_remaining (Copilot) se invierte** a usedPercent = 100 − percent; `unlimited: true` se omite (barra sin sentido).
3. **Gemini per-model**: un snapshot por bucket `modelId` (window "model" del crédito compartido del plan) — nunca agregado, consistente con la spec.
4. **Registry unificado `ALL_PROBERS`**: la distinción Fase1/Fase2 era solo de despliegue; config.providers gobierna qué corre.
5. **Credenciales**: `~/.gemini/oauth_creds.json` y `~/.config/github-copilot/apps.json` leídas RO (flag 'r', readFileRO); `GEMINI_PROJECT_ID`/`OPENROUTER_API_KEY` por env además de config.

## Risks
[Formats no documentados] → parsers aislados con fixtures; fallo = estado error con causa sanitizada (patrón Fase 1 probado).
