# Design: english-docs

## Context

Tres documentos en español con datos congelados en 2026-08: el README describe una app de 2 agentes y 101 tests; `SECURITY.md` lista avisos de audit de dev que desaparecieron con la migración de toolchain (vite 8 + vitest 4 + plugin-react 6, ya en main). Ver proposal.md.

## Goals / Non-Goals

**Goals:**

- Los tres documentos públicos en inglés y verificables contra el repo actual.
- Conservar la voz y los argumentos (el case study y SECURITY tienen propuestas fuertes que valen la pena mantener).

**Non-Goals:**

- No se traduce `docs-onboarding.md` (533 líneas, documento de trabajo interno en español; el usuario puede pedirlo aparte).
- No se reescriben las guías HTML (`docs-onboarding.html`, `guia-qwen.html`).
- No se tocan screenshots — los actuales sirven; renovarlos es otra tarea.

## Decisions

1. **Traducción fiel + actualización de cifras, no reescritura.** La estructura argumental de cada doc se conserva; solo cambian idioma, números y secciones vencidas.
2. **README: el log histórico (F1–F6) se condensa en "Milestones".** Las entradas F* eran un changelog de desarrollo; en inglés se mantienen como hitos de una línea para no perder la historia sin 40 líneas de log.
3. **SECURITY: la sección de dependencias describe el presente** (0 vulnerabilidades totales, toolchain ya migrada) y conserva el comando de verificación. La "upgrade path" vieja se elimina porque ya se ejecutó.
4. **Node en quick start: "22+"** — es lo que exige la toolchain (pnpm 11) y lo que testea el CI; el `engines: >=20` del paquete publicado se documenta como runtime mínimo del CLI sin pnpm.

## Risks / Trade-offs

- [`docs-onboarding.md` queda en español] → Explícito como non-goal; mezclar su traducción con esta ronda agrandaría el PR sin beneficio.

## Migration Plan

Sin migración. Rollback = revertir.

## Open Questions

Ninguna que bloquee implementación.
