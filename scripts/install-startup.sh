#!/usr/bin/env bash
# Linux: install MaowCore as a systemd user service that starts at login.
# Usage:  ./scripts/install-startup.sh
#
# Uninstall: ./scripts/uninstall-startup.sh

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "✕  Node.js not found in PATH. Install Node 22+ first." >&2
  exit 1
fi

SERVICE_DIR="$HOME/.config/systemd/user"
mkdir -p "$SERVICE_DIR"

cat > "$SERVICE_DIR/maowcore.service" <<EOF
[Unit]
Description=MaowCore Discord music bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$NODE_BIN index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable maowcore.service
systemctl --user start maowcore.service

echo "✦  Installed and started maowcore.service"
echo "   Check status: systemctl --user status maowcore"
echo "   View logs:    journalctl --user -u maowcore -f"
echo "   Enable on boot without login:  loginctl enable-linger \$USER"
