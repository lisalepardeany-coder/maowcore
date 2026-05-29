# ============================================================
# MaowCore — Discord music bot + dashboard
# Multi-stage build for a lean, Linux-native runtime image.
#
#   Build:  docker build -t maowcore .
#   Run:    docker compose up -d           (recommended — see docker-compose.yml)
#     or:   docker run -d --name maowcore --env-file .env \
#             -e CONTROL_HOST=0.0.0.0 -p 8765:8765 \
#             -v maowcore-data:/app/data maowcore
#
# IMPORTANT: never COPY the host's node_modules into the image — it contains
# Windows/host-specific native binaries (@snazzah/davey, ffmpeg-static,
# yt-dlp). The builder stage runs a fresh `npm install` so the LINUX binaries
# are fetched. (.dockerignore excludes node_modules to enforce this.)
# ============================================================

# ---------- Stage 1: build / install dependencies ----------
FROM node:22-bookworm-slim AS builder

# Toolchain for any native module that needs node-gyp, plus python3 (yt-dlp)
# and CA certs (ffmpeg-static + yt-dlp download their binaries over HTTPS).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      make \
      g++ \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the manifest AND the postinstall patch script first. `npm install`
# runs `postinstall` (scripts/patch-ytsr.js), which must exist at that point —
# copying scripts/ beforehand is what makes the install succeed.
# (No package-lock.json is committed, so we install from package.json.)
COPY package.json ./
COPY scripts ./scripts

# Install production deps. This fetches the Linux-native ffmpeg-static,
# yt-dlp, and @snazzah/davey binaries, then runs the ytsr/yt-dlp patches.
RUN npm install --omit=dev


# ---------- Stage 2: runtime ----------
FROM node:22-bookworm-slim

# Media stack — the reliable part of the "song removed immediately" fix:
#   * system ffmpeg  — the bundled ffmpeg-static binary is flaky/fragile in
#     containers; the distro ffmpeg is rock-solid and in PATH.
#   * latest standalone yt-dlp — @distube/yt-dlp's auto-downloaded binary can
#     be stale or mis-resolved, and YouTube breaks old yt-dlp constantly. We
#     fetch the current PyInstaller build (no Python needed) and point the bot
#     at it via YTDLP_DIR / YTDLP_FILENAME below.
# python3 stays as a safety net; CA certs for outbound HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      ca-certificates \
      curl \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
         -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && /usr/local/bin/yt-dlp --version \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# Point the bot at the system media binaries (see index.js + @distube/yt-dlp).
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV YTDLP_DIR=/usr/local/bin
ENV YTDLP_FILENAME=yt-dlp

# Bring the already-installed, already-patched Linux node_modules from builder.
COPY --from=builder /app/node_modules ./node_modules

# App source (node_modules / .env / data excluded via .dockerignore).
COPY . .

# Persistent state: config, history, sessions, favorites, uploaded library.
# Owned by the unprivileged `node` user so the named volume inherits writable
# permissions on first run.
RUN mkdir -p /app/data && chown -R node:node /app
VOLUME /app/data

# The control server / dashboard MUST bind 0.0.0.0 inside the container to be
# reachable via the published port (it defaults to 127.0.0.1, host-only).
ENV CONTROL_HOST=0.0.0.0
ENV CONTROL_PORT=8765
EXPOSE 8765

# Drop privileges.
USER node

# Tiny healthcheck against the dashboard's /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.CONTROL_PORT||8765)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "index.js"]
