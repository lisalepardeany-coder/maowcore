#!/bin/bash
# MaowCore start script for Pterodactyl (the egg's startup runs this after updating the code).
# Runs in /home/container. Builds the new dashboard when its source changed, updates
# yt-dlp, then starts the bot in place of this script (so Stop's Ctrl+C reaches it).
cd /home/container || exit 1

# 1. The new (SvelteKit) dashboard: build it when it's missing or its source changed.
#    If the build fails, the bot still starts and "/" shows the classic dashboard.
if [[ -f dashboard/package.json ]]; then
  want=$(git rev-parse HEAD:dashboard 2>/dev/null || echo unknown)
  have=$(cat dashboard/build/.source 2>/dev/null)
  if [[ ! -f dashboard/build/index.html || "$want" != "$have" ]]; then
    echo "Building the dashboard (first start after an update takes a minute)..."
    if npm --prefix dashboard install --no-audit --no-fund --loglevel=error \
       && npm --prefix dashboard run build --silent; then
      echo "$want" > dashboard/build/.source
      echo "Dashboard built."
    else
      echo "Dashboard build failed; the classic dashboard is used instead."
    fi
  fi
fi

# 2. yt-dlp updates itself (YouTube breaks old versions often).
if [[ -x bin/yt-dlp ]]; then ./bin/yt-dlp -U 2>&1 | tail -n 1; fi

# 3. The bot.
exec node index.js
