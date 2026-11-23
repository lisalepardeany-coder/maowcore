#!/bin/bash
# MaowCore start script for Pterodactyl (the egg's startup runs this after updating the code).
# Runs in /home/container. Updates yt-dlp, then starts the bot in place of this
# script (so Stop's Ctrl+C reaches it).
cd /home/container || exit 1

# 1. The SvelteKit dashboard was removed in 3.8.0. Its build output and tools
#    (~300 MB, not tracked by git, so the update leaves them) are cleared once.
if [[ -d dashboard && ! -f dashboard/package.json ]]; then
  rm -rf dashboard && echo "Removed the old SvelteKit dashboard's leftover files."
fi

# 2. Temporary files on the disk instead of the panel's small in-memory /tmp:
#    yt-dlp unpacks ~35 MB there on every run (lib/hosting.js does the same for the bot).
#    Leftovers from runs that were killed are cleared, as nothing is running yet.
mkdir -p .tmp && rm -rf .tmp/_MEI* 2>/dev/null
export TMPDIR=/home/container/.tmp

# 3. yt-dlp updates itself (YouTube breaks old versions often).
if [[ -x bin/yt-dlp ]]; then ./bin/yt-dlp -U 2>&1 | tail -n 1; fi

# 4. The bot.
exec node index.js
