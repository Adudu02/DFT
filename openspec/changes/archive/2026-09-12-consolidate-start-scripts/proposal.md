# Proposal: consolidate-start-scripts

## Why

Hay dos implementaciones del arranque que ya divergieron (ítem ⑲ de `MEJORAS.md`): `start.sh` (usado por el launcher `.desktop`) sabe detectar que el dashboard ya corre, abrir el navegador y limpiar el proceso hijo con trap; `scripts/start.mjs` (usado por `pnpm start`) es cross-platform pero no sabe nada de eso. Duplicar lógica de arranque garantiza que sigan divergiendo.

## What Changes

- `scripts/start.mjs` absorbe la lógica completa: chequeo de ya-corriendo (`/api/health`), instalación/build condicional, servidor en segundo plano con polling de salud, apertura del navegador (xdg-open/open/start según plataforma) y limpieza del proceso.
- `start.sh` queda como wrapper fino (`exec node scripts/start.mjs`) — el `.desktop` y `install-launcher.sh` siguen funcionando sin cambios.
- `pnpm start` (que ya invoca `start.mjs`) gana las mismas funciones.

## Capabilities

<!-- skip_specs: true — tooling de arranque; ningún requisito observable del producto cambia. -->

## Impact

- **Archivos**: `scripts/start.mjs` (lógica completa), `start.sh` (wrapper), ningún cambio en `scripts/install-launcher.sh` ni en el `package.json`.
- **Plataformas**: mejor que hoy — el launcher `.desktop` hereda cross-platform por delegación en Node; el chequeo de ya-corriendo llega también a `pnpm start`.
- **Riesgo**: bajo — `start.sh` conservará la misma interfaz (mismo path, mismo comportamiento observable); se verifica con chequeos de sintaxis de ambos.
