#!/usr/bin/env bash
# Lanzador de Motor Agéntico: instala deps y construye la UI si falta, arranca el
# servidor (ingesta + API + UI en 127.0.0.1:8081) y abre el navegador.
# Uso: doble clic en Motor-Agentico.desktop, o ./start.sh desde la terminal.
set -e
cd "$(dirname "$0")"

URL="http://127.0.0.1:8081"

# Ya está corriendo (p.ej. doble clic dos veces): solo abrir el navegador.
if curl -sf "$URL/api/health" >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
  exit 0
fi

[ -d node_modules ] || pnpm install
[ -d web/dist ] || pnpm run build:web

pnpm run serve &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT

# Espera a que el servidor responda antes de abrir el navegador.
for _ in $(seq 1 60); do
  curl -sf "$URL/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done
xdg-open "$URL" >/dev/null 2>&1 || true

wait "$SERVER_PID"
