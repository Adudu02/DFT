# Design: consolidate-start-scripts

## Context

`start.sh` (66 líneas bash): cd al repo, si `/api/health` responde → abrir navegador y salir; si no, install/build condicional, `pnpm run serve &` con `trap kill EXIT`, polling de salud (60 × 0.5 s), abrir navegador y `wait`. `scripts/start.mjs` (30 líneas node): install/build condicional y `spawnSync("pnpm", ["run", "serve"])` en primer plano — sin chequeo de ya-corriendo, sin navegador. El `.desktop` apunta a `start.sh`. Ver proposal.md.

## Goals / Non-Goals

**Goals:**

- Una sola implementación del arranque (Node, cross-platform).
- `start.sh` y `pnpm start` con comportamiento equivalente al `start.sh` actual.
- El `.desktop` / autostart existentes no se rompen.

**Non-Goals:**

- No se cambia el puerto, los comandos `serve`/`build:web` ni el flujo del servidor.
- No se añade test automatizado de arranque (requeriría un runner de integración de procesos — fuera de alcance).
- No se toca `install-launcher.sh`: el `.desktop` sigue apuntando a `start.sh`, que sigue existiendo.

## Decisions

1. **`start.mjs` es la única implementación; `start.sh` delega.** El wrapper es `exec node scripts/start.mjs` — un solo proceso, sin shell extra tras el exec. Alternativa descartada: eliminar `start.sh` — obligaría a editar el `.desktop` generado en máquinas de usuario ya instaladas (el autostart copia el archivo).
2. **Servidor asíncrono + polling + `wait`, replicando el flujo bash.** `spawn` (no `spawnSync`) del `pnpm run serve`; poll a `/api/health` con `fetch` (Node ≥ 20, global) cada 500 ms hasta 60 intentos; abrir navegador y luego `await` del hijo. `SIGINT`/`SIGTERM` matan al hijo — equivalente al `trap` de bash.
3. **Chequeo de ya-corriendo al inicio.** `fetch` a health con timeout corto; si responde, abrir navegador y `exit 0` — doble-clic doble no levanta un segundo servidor (comportamiento de `start.sh` que `pnpm start` gana).
4. **Abrir navegador por plataforma.** `xdg-open` (Linux), `open` (macOS), `start` via `cmd` (Windows), todos `detached` + `unref` con fallo silencioso — hoy solo Linux lo hacía; ganan mac/win.

## Risks / Trade-offs

- [`fetch` a health sin servidor escuchando tarda el timeout] → Se usa `AbortSignal.timeout(1000)`; el polling total sigue acotado (≤ 30 s) antes de abrir el navegador de todos modos.
- [`start.sh` pierde usuarios sin `node` en PATH] → Imposible: el flujo anterior ya requería `pnpm`, que requiere Node.
- [Comportamiento de segundo plano difiere sutilmente de bash] → Los tests de server y el build cubren el producto; el script se verifica con chequeo de sintaxis + inspección del flujo (sin runner de integración, asumido en Non-Goals).

## Migration Plan

Sin migración. Rollback = revertir (dos archivos).

## Open Questions

Ninguna que bloquee implementación.
