# Design: add-missing-tests

## Context

Cuatro zonas sin cobertura (ver proposal.md). Los tests existentes ya fijan el estilo: fixtures en `packages/core/test/fixtures/`, `mkdtempSync` + `rmSync` para aislamiento, `app.inject()` para HTTP, SQL directo para sembrar datos. La única pieza de código productivo implicada es `parseArgs`, definida en `packages/reporter/src/index.ts`, que **no puede importarse desde un test** porque ejecuta `main()` al importar.

## Goals / Non-Goals

**Goals:**

- Cubrir los contratos que UI y CI consumen: export CSV, ingesta Qwen end-to-end, output del reporter, endpoints HTTP.
- Tests herméticos: ningún test lee transcripts reales de `~/.claude`/`~/.codex`/`~/.qwen` ni escribe fuera de `tmp`.

**Non-Goals:**

- No se configura cobertura (`@vitest/coverage-v8`, ítem ⑯) ni se suben umbrales de CI.
- No se añaden tests de UI/web (no hay entorno de componentes en el repo).
- No se cambia ningún comportamiento observable (flags de CLI, respuestas HTTP, SQL).

## Decisions

1. **`parseArgs` se muda a `report.ts` y se exporta.** `report.ts` ya es el módulo puro del reporter; `index.ts` la importa. Misma lógica exacta (flags `--data`, `--json`, `--ingest`, `--threshold`). Alternativa descartada: testear `index.ts` por subprocess — lento y frágil para cubrir 4 casos triviales.
2. **Qwen end-to-end con fixtures de archivo, no mocks.** Se monta un `qwenRoot` de tmp con `usage/token-usage-2026-08.jsonl` (fixture existente), un segundo usage file con una sola línea de mensaje de usuario `/review` (para `skillsInserted` vía el wiring real del registry) y `usage_record.jsonl` con un mapeo sesión→proyecto (el otro cae a `"qwen"`). `projectsRoot`/`codexRoot` apuntan a rutas inexistentes de tmp: los adapters devuelven `[]` con ENOENT (comportamiento ya testeado).
3. **`refresh`/`rebuild` herméticos vía `config.agentPaths`.** Esos endpoints resuelven raíces con `rootsFromConfig(config.agentPaths)` ignorando `catalogRoots`; el test escribe una config cuyo `agentPaths` apunta a dirs de tmp (claude con el fixture `deterministic.jsonl`; codex/qwen vacíos). Sin esto, un test tocaría transcripts reales de la máquina.
4. **Turns con transcript real del fixture.** `getSessionTurns` lee `source_path` de la DB y el transcript en read-only: la sesión ingerida del fixture (`sesion1`) da 4 turnos; la sesión sembrada a mano (`s1`, sin `source_path`) da `[]` — se cubren ambos contratos, más el 404.
5. **CSV: assert del escapado literal.** Proyecto `proy, "grande"` debe salir como `"proy, ""grande"""` y un `model` con salto de línea debe quedar dentro de una celda citada; nulls → celda vacía. Además, cabeceras exactas y salida vacía = solo cabecera + `\n`.

## Risks / Trade-offs

- [`scanMemory` del endpoint `/api/memory` usa la raíz real (read-only)] → Solo lectura de directorios que el motor ya lee; la aserción es de forma (`nodes`/`links`/`counts`), no de contenido, así que es estable en cualquier máquina.
- [El fixture de skills de Qwen mete una línea no-usage en un usage file] → Es exactamente lo que ocurre con transcripts reales; el parser de eventos la salta y `parseSkills` la captura — se documenta en el test.

## Migration Plan

Sin migración (testing puro + reubicación interna). Rollback = revertir.

## Open Questions

Ninguna que bloquee implementación.
