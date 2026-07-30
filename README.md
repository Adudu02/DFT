# Motor Agéntico

Dashboard local de costos/actividad de agentes. Lee transcripts de Claude Code
(`~/.claude/projects`) en **solo lectura** y calcula el gasto "equivalente API".

## Principio

`~/.claude` y otras fuentes = **SOLO LECTURA** (se abren con flag `'r'`, ver
`src/lib/fs-readonly.ts`). Todo estado propio (DB, reportes) vive en `./data/`.

## Comandos

```bash
npm install
npm run cli        # F1: imprime tabla gasto/modelo/día desde ~/.claude/projects
npm run rebuild    # borra ./data/motor.db y reingesta todo (cache reconstruible)
npm run improve    # lee el último ./data/reports y lanza Claude Code para corregir (--dry: solo imprime)
npm run serve      # API + UI en http://127.0.0.1:8081 (ingesta incremental al arrancar)
npm run dev        # serve + Vite dev (frontend con HMR en :5173, proxy /api → :8081)
npm run build:web  # build de producción del frontend a web/dist (lo sirve `serve`)
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

## Estado

- **F1** — adapter Claude Code + motor de costos + CLI. Dedup por `message.id:requestId`,
  skip `<synthetic>`, modelo sin tarifa = costo 0 + badge.
- **F2** — SQLite (`node:sqlite`, sin deps nativas) + ingesta incremental (offset por
  archivo) + servidor Fastify (bind solo `127.0.0.1`) + página Inicio (Vite/React/
  Tailwind/Recharts, tema terminal ámbar/negro): gasto 28d + sparkline, actividad,
  racha, participación por modelo (donut), toggle Suscripción↔Tokens.
- **F3** — Skills + Configuración. Detección de uso (`<command-name>/x</command-name>`
  en eventos user + `Skill` tool_use), catálogo `~/.claude/skills`/`commands` (frontmatter),
  `./data/config.json` (tarifa/hora, min/uso, umbral obsolescencia). Página Skills (grid,
  filtro por categoría, uso por categoría, $ ahorrado) y Configuración (parámetros +
  editor `pricing.json`). `$ ahorrado = usos·min·tarifa/60`, recalculado en vivo.
- **F4** — Memoria + Actividad. `scanMemory` lee `~/.claude/projects/*/memory/*.md` (RO):
  nodos memoria/índice/sesión/proyecto, aristas por `[[wikilink]]`/link md (referencia),
  `originSessionId` (origen) e índice (contiene). Página Memoria = grafo force-directed
  (SVG, simulación propia, brillo=recencia, amarillo=obsoleto, contador N·M). Página
  Actividad = timeline de sesiones por día con drill-down (desglose por modelo).

- **F6** — auto-mejora + integridad. Test de humo (`test/integrity.test.ts`):
  hashea el árbol de fuentes (path·size·mtime) antes/después de un ciclo de
  ingesta y exige hash idéntico (criterio §7: fuentes intactas). Cada ingesta
  real (rebuild/serve) escribe `./data/reports/run-<ts>.json` con líneas no
  parseables, modelos sin tarifa, adapters sin datos y tiempos. `npm run improve`
  lee el último reporte y lanza Claude Code **sobre este repo** (nunca sobre las
  fuentes) para corregir parsers/heurísticas y añadir tests; `--dry` solo imprime
  el prompt.

Pendiente: F5 adapters Codex/Hermes.

## API

`GET /api/summary` · `GET /api/skills` · `GET /api/memory` · `GET /api/activity` ·
`GET /api/session/:id` · `GET|PUT /api/config` · `GET|PUT /api/pricing` ·
`POST /api/rebuild` · `GET /api/health`. Editar pricing → correr `rebuild` para
recalcular costos ya materializados.

## Costos

`data/pricing.json` (editable). Fórmula por evento:

```
cost = in·rate_in + out·rate_out + cache_write·rate_in·1.25 + cache_read·rate_in·0.10
```

Etiquetado como **equivalente API**: lo que habría costado a tarifa medida (el usuario
paga suscripción). Modelo desconocido → costo 0 + aviso, nunca se estima en silencio.
