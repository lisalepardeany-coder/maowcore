#!/bin/bash
# MaowCore start script for Pterodactyl (the egg's startup runs this after updating the code).
# Runs in /home/container. Updates yt-dlp, then starts the bot in place of this
# script (so Stop's Ctrl+C reaches it).
cd /home/container || exit 1

# 0. If this update broke the bot before (its start check failed, or it kept
#    crashing), go back to the last version that worked (lib/rollback.js).
#    AUTO_ROLLBACK=0 turns this off. Exit code 10 = it went back: this file
#    changed too, so start over with the older version's copy. (One { } block,
#    so bash has read all of it before git replaces the file.)
{
  if [[ -d .git && -f lib/rollback.js && "${AUTO_ROLLBACK:-1}" != "0" ]]; then
    node lib/rollback.js pre-start
    if [[ $? -eq 10 ]]; then exec bash deploy/pterodactyl/start.sh; fi
  fi
}

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

# 4. Native modules (opus, sqlite, sodium) are built for one Node.js version.
#    When the server's Docker image moves to another one, rebuild them once.
ABI=$(node -p process.versions.modules)
if [[ -d node_modules && "$(cat node_modules/.maow-abi 2>/dev/null)" != "$ABI" ]]; then
  echo "Node.js $(node -v): rebuilding native modules..."
  if npm rebuild --no-audit --no-fund >/dev/null 2>&1; then echo "Native modules rebuilt."
  else echo "Rebuild had problems; the bot uses its built-in fallbacks where it can."; fi
  echo "$ABI" > node_modules/.maow-abi
fi

# 5. The bot (--expose-gc: it frees memory after big downloads, same as npm start).
exec node --expose-gc index.js
