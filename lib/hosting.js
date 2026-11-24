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

  // Temporary files go on the server's disk, not /tmp. The standalone yt-dlp
  // unpacks itself (~35 MB) into the temp folder on every run, and the panel's
  // /tmp is a small in-memory folder (100 MB by default): 5 playlist downloads
  // at once filled it, and every song failed with "[PYI-…] Failed to extract …".
  // (yt-dlp is started with this process's environment, so it inherits TMPDIR.)
  if (!process.env.TMPDIR || process.env.TMPDIR === '/tmp') {
    const tmp = path.join(__dirname, '..', '.tmp');
    try { fs.mkdirSync(tmp, { recursive: true }); process.env.TMPDIR = tmp; } catch { /* keep /tmp */ }
  }

  // The egg's install script puts the standalone yt-dlp in ./bin.
  const bundled = path.join(__dirname, '..', 'bin', 'yt-dlp');
  if (!process.env.YTDLP_DIR && fs.existsSync(bundled)) {
    process.env.YTDLP_DIR = path.dirname(bundled);
    process.env.YTDLP_FILENAME = 'yt-dlp';
  }
}

// On a panel the dashboard is reachable from the internet, so it must never
// run in open mode (no CONTROL_TOKEN = anyone can control the bot). Called
// after .env loads, so a token from the Startup tab or .env always wins; if
// there is none, one is made once and kept in data/control-token.txt.
// The token itself is never logged (console screenshots get shared).
function ensureControlToken(dataDir = path.join(__dirname, '..', 'data')) {
  if (!onPterodactyl || process.env.CONTROL_TOKEN) return null;
  const file = path.join(dataDir, 'control-token.txt');
  let token = '';
  try { token = fs.readFileSync(file, 'utf8').trim(); } catch { /* first start */ }
  if (!token) {
    token = require('node:crypto').randomBytes(24).toString('base64url');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, token + '\n', { mode: 0o600 });
    console.log('[hosting] Dashboard locked: no CONTROL_TOKEN was set, so one was made.');
  }
  process.env.CONTROL_TOKEN = token;
  console.log('[hosting] Dashboard token: Files tab -> data/control-token.txt (or set CONTROL_TOKEN on the Startup tab).');
  return file;
}

module.exports = { onPterodactyl, ensureControlToken };
