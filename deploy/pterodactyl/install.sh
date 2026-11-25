#!/bin/bash
# MaowCore install script for Pterodactyl (egg-maowcore.json embeds this file).
# Runs once in a node:22-trixie container; the server's files live in /mnt/server.
set -e
apt-get update
apt-get install -y --no-install-recommends git curl ca-certificates
mkdir -p /mnt/server
cd /mnt/server

# 1. Get the code: clone the repo, pull if it's already a checkout,
#    or leave uploaded files alone.
if [ -n "${GIT_ADDRESS}" ]; then
  [[ ${GIT_ADDRESS} != *.git ]] && GIT_ADDRESS="${GIT_ADDRESS}.git"
  if [ -n "${USERNAME}" ] && [ -n "${ACCESS_TOKEN}" ]; then
    # private repo: put the login into the URL
    GIT_ADDRESS="https://${USERNAME}:${ACCESS_TOKEN}@$(echo "${GIT_ADDRESS}" | cut -d/ -f3-)"
  fi
  if [ -d .git ]; then
    echo "Existing checkout found, pulling the latest code"
    git pull
  elif [ -z "$(ls -A)" ]; then
    echo "Cloning ${BRANCH:-main}"
    git clone --single-branch --branch "${BRANCH:-main}" "${GIT_ADDRESS}" .
  else
    echo "The server folder has files but no git checkout, so nothing was cloned."
    echo "Either upload the bot's files yourself, or empty the folder and reinstall."
  fi
fi

# 2. Standalone yt-dlp (no Python needed). The bot finds it in ./bin by itself.
mkdir -p bin data cookies
case "$(uname -m)" in
  aarch64|arm64) YTDLP=yt-dlp_linux_aarch64 ;;
  *)             YTDLP=yt-dlp_linux ;;
esac
curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP}" -o bin/yt-dlp
chmod +x bin/yt-dlp
./bin/yt-dlp --version

# 3. Node packages, built for Linux (never copy node_modules from Windows).
if [ -f package.json ]; then
  rm -rf node_modules
  npm install --omit=dev
  # Which Node.js the native modules were built for (start.sh rebuilds on a change)
  node -p process.versions.modules > node_modules/.maow-abi
else
  echo "No package.json yet; upload the bot and restart the server."
fi

echo "MaowCore install finished."
