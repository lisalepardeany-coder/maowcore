#!/usr/bin/env bash
set -euo pipefail

systemctl --user stop maowcore.service 2>/dev/null || true
systemctl --user disable maowcore.service 2>/dev/null || true
rm -f "$HOME/.config/systemd/user/maowcore.service"
systemctl --user daemon-reload
echo "✕  Removed maowcore.service"
