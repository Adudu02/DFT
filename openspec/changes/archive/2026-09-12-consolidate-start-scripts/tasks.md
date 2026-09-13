# Tasks: consolidate-start-scripts

## 1. Implementación única en Node

- [x] 1.1 Reescribir `scripts/start.mjs` con el flujo completo: chequeo de ya-corriendo (fetch a `/api/health` con timeout), install/build condicional, `spawn` asíncrono de `pnpm run serve`, polling de salud, apertura de navegador por plataforma (xdg-open/open/cmd start) y limpieza del hijo en SIGINT/SIGTERM. Verificar: `node --check scripts/start.mjs` pasa.

- [x] 1.2 Reducir `start.sh` a wrapper fino: `exec node scripts/start.mjs` desde el directorio del script. Verificar: `bash -n start.sh` pasa y el archivo conserva el shebang ejecutable.

## 2. Verificación

- [x] 2.1 Ejecutar `pnpm typecheck && pnpm lint && pnpm test && pnpm run build` — todo en verde (sin tocar producto). Verificar: salida limpia en los cuatro comandos.
