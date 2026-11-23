// ===== Hosting panels (Pterodactyl / Pelican) =====
// Loaded first thing in index.js, before .env is read.
//
// Pterodactyl's Wings runs the bot in a container and passes the server's
// settings as environment variables:
//   * P_SERVER_UUID — set on every Pterodactyl server (how we detect it)
//   * SERVER_PORT   — the one port the panel opened for this server
//   * every egg variable, including blank ones ("")
const fs = require('node:fs');
const path = require('node:path');

const onPterodactyl = !!process.env.P_SERVER_UUID;

// A blank egg variable would hide the same key in .env (dotenv never
// overrides a key that already exists), so drop blank ones before .env loads.
for (const [key, value] of Object.entries(process.env)) {
  if (value === '') delete process.env[key];
}

if (onPterodactyl) {
  // The dashboard must listen on the panel's port, on every interface,
  // or nothing outside the container can reach it.
  if (process.env.SERVER_PORT) process.env.CONTROL_PORT = process.env.SERVER_PORT;
  process.env.CONTROL_HOST = '0.0.0.0';

  // The panel's Node image ships ffmpeg; it's more reliable in containers
  // than the ffmpeg-static download (same reason the Dockerfile uses it).
  if (!process.env.FFMPEG_PATH && fs.existsSync('/usr/bin/ffmpeg')) process.env.FFMPEG_PATH = '/usr/bin/ffmpeg';

  // The egg's install script puts the standalone yt-dlp in ./bin.
  const bundled = path.join(__dirname, '..', 'bin', 'yt-dlp');
  if (!process.env.YTDLP_DIR && fs.existsSync(bundled)) {
    process.env.YTDLP_DIR = path.dirname(bundled);
    process.env.YTDLP_FILENAME = 'yt-dlp';
  }
}

module.exports = { onPterodactyl };
