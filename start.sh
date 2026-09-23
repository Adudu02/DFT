#!/usr/bin/env bash
# Lanzador de Motor Agéntico (entrada del .desktop): delega en la única
# implementación del arranque — scripts/start.mjs (Node, cross-platform).
# Uso: ./start.sh [--update] (o -u) para reinstalar, recompilar y reiniciar.
set -e
cd "$(dirname "$0")"
exec node scripts/start.mjs "$@"
