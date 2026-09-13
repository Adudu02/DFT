#!/usr/bin/env bash
# Lanzador de Motor Agéntico (entrada del .desktop): delega en la única
# implementación del arranque — scripts/start.mjs (Node, cross-platform).
# Uso: doble clic en Motor-Agentico.desktop, o ./start.sh desde la terminal.
set -e
cd "$(dirname "$0")"
exec node scripts/start.mjs
