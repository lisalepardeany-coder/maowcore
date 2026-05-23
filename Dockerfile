# MaowCore — Discord music bot + cosmic dashboard
# Build: docker build -t maowcore .
# Run:   docker run --env-file .env -v $(pwd)/data:/app/data -p 8765:8765 maowcore

FROM node:22-bookworm-slim

# ffmpeg + python3 (for yt-dlp) + build deps for opusscript fallback
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache deps install layer
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install

# Copy app source
COPY . .

# Run the post-install patches (handles yt-dlp deprecation flags)
RUN node scripts/patch-ytsr.js || true

# Mount /app/data for persistent state (history, sessions, favorites)
VOLUME /app/data

# Default control-server port + dashboard
EXPOSE 8765
ENV CONTROL_HOST=0.0.0.0

CMD ["node", "index.js"]
