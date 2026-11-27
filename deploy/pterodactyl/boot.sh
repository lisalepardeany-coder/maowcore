#!/bin/bash
# MaowCore start for ANY Pterodactyl Node.js egg (the generic one included),
# so no MaowCore egg is needed. Startup command (Startup tab):
#
#   if [[ ! -d .git ]]; then git init -q && git remote add origin "${GIT_ADDRESS:-https://github.com/lisalepardeany-coder/maowcore}" && git fetch -q origin "${BRANCH:-main}" && git reset -q --hard FETCH_HEAD; fi; exec bash deploy/pterodactyl/boot.sh
#
# It does what the MaowCore egg's installer + startup do, on every start:
# update the code, get yt-dlp, install the Node packages when they changed,
# then hand over to start.sh (rollback check, yt-dlp update, the bot).
# Settings without egg variables go in .env (made from .env.example once).
cd /home/container 2>/dev/null || cd "$(dirname "$0")/../.." || exit 1

# AUTO_UPDATE / BRANCH from the egg's Startup variables, else from .env.
envval() { grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r"'"'"' '; }
[[ -z "${AUTO_UPDATE}" ]] && AUTO_UPDATE=$(envval AUTO_UPDATE)
[[ -z "${BRANCH}" ]] && BRANCH=$(envval BRANCH)

# 1. Update from GitHub (AUTO_UPDATE=0 turns it off). One { } block, so bash
#    has read all of it before git replaces this file; then the new copy runs.
{
  if [[ -d .git && "${AUTO_UPDATE:-1}" == "1" && -z "${MAOW_BOOTED}" ]]; then
    echo "Updating from GitHub (${BRANCH:-main})..."
    if git fetch -q origin "${BRANCH:-main}" && git reset -q --hard FETCH_HEAD; then
      export MAOW_BOOTED=1
      exec bash deploy/pterodactyl/boot.sh
    else
      echo "Update failed (GitHub unreachable?); starting the version that's here."
    fi
  fi
}

mkdir -p bin data cookies .tmp
export TMPDIR="$PWD/.tmp"

# 2. Standalone yt-dlp (no Python needed). start.sh keeps it up to date.
if [[ ! -x bin/yt-dlp ]]; then
  case "$(uname -m)" in
    aarch64|arm64) YTDLP=yt-dlp_linux_aarch64 ;;
    *)             YTDLP=yt-dlp_linux ;;
  esac
  echo "Downloading yt-dlp (${YTDLP})..."
  curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP}" -o bin/yt-dlp && chmod +x bin/yt-dlp \
    || echo "Could not download yt-dlp; YouTube won't work until it's in bin/yt-dlp."
fi

# 3. Node packages: installed when missing or when package.json changed.
SUM=$(sha1sum package.json package-lock.json 2>/dev/null | sha1sum | cut -c1-40)
if [[ ! -d node_modules || "$(cat node_modules/.maow-pkg 2>/dev/null)" != "$SUM" ]]; then
  echo "Installing Node packages (first start or new version)..."
  if npm install --omit=dev --no-audit --no-fund; then
    echo "$SUM" > node_modules/.maow-pkg
    node -p process.versions.modules > node_modules/.maow-abi
  else
    echo "npm install failed; see above."
  fi
fi

# 4. Settings: without MaowCore's egg there are no Startup-tab variables for
#    the bot, so they live in .env (edit it in the File Manager).
if [[ ! -f .env && -z "${DISCORD_TOKEN}" ]]; then
  cp -n .env.example .env 2>/dev/null
  echo "------------------------------------------------------------------"
  echo " First start: open the File Manager, edit .env and fill in at least"
  echo " DISCORD_TOKEN and CLIENT_ID (and OWNER_USER_ID), then restart."
  echo "------------------------------------------------------------------"
  exit 1
fi

# 5. The rest is the same as with the MaowCore egg.
exec bash deploy/pterodactyl/start.sh
