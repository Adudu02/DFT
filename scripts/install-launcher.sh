#!/usr/bin/env bash
# Instala un lanzador de escritorio para no tener que tipear comandos.
#   bash scripts/install-launcher.sh              # ícono en el menú de apps
#   bash scripts/install-launcher.sh --autostart  # además, arranca al iniciar sesión
# La ruta se calcula sola, así que no se rompe si movés el repo (solo reinstalá).
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
APPS="$HOME/.local/share/applications"
FILE="$APPS/motor-agentico.desktop"
mkdir -p "$APPS"

cat > "$FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Motor Agéntico
Comment=Dashboard local de costos y actividad de agentes
Exec=$REPO/start.sh
Path=$REPO
Icon=utilities-system-monitor
Terminal=false
Categories=Development;Utility;
EOF
chmod +x "$FILE"
echo "✓ Lanzador instalado: $FILE"

if [ "$1" = "--autostart" ]; then
  mkdir -p "$HOME/.config/autostart"
  cp "$FILE" "$HOME/.config/autostart/motor-agentico.desktop"
  echo "✓ Autoarranque activado (quitalo con: rm ~/.config/autostart/motor-agentico.desktop)"
fi
