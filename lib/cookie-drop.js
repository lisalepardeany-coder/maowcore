// ===== The cookies/ folder =====
// Drop a cookies.txt (Netscape format, exported while on youtube.com) into
// the bot's cookies/ folder: with the panel's File Manager, SFTP, or just
// Explorer at home. The bot checks the folder at startup and every 30 s,
// keeps the YouTube/Google lines (same as a dashboard upload, via
// yt-cookies.save) and deletes the dropped file, since a full browser export
// holds the logins for every site you use.
//
// On Pterodactyl the console also takes a "cookies" command.
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'cookies');
const POLL_MS = 30_000;
const rejected = new Map(); // file -> mtime we already complained about

const README = `Put a cookies.txt here to let MaowCore past YouTube's "confirm you're not a bot".

1. Sign in to YouTube in your browser (a spare account is safest).
2. Export cookies for youtube.com in Netscape format (a "cookies.txt" extension).
3. Drop the file in this folder. Any name ending in .txt works.

Within 30 seconds the bot saves the YouTube part to data/youtube-cookies.txt
and deletes the file you dropped. Restart once so YouTube search uses them too.
`;

// Pure-ish: the newest .txt in the folder (README excluded), or null.
const newestDrop = (dir = DIR) => {
  let files;
  try { files = fs.readdirSync(dir); } catch { return null; }
  const drops = files
    .filter((f) => /\.txt$/i.test(f) && !/^readme/i.test(f))
    .map((f) => ({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return drops[0] || null;
};

// Import one dropped file. Returns a short message, or null when there was nothing to do.
const importDrop = (ytCookies, dir = DIR) => {
  const drop = newestDrop(dir);
  if (!drop || rejected.get(drop.file) === drop.mtime) return null;
  const name = path.basename(drop.file);
  try {
    const info = ytCookies.save(fs.readFileSync(drop.file, 'utf8'));
    fs.unlinkSync(drop.file);
    rejected.delete(drop.file);
    return `♥ Cookies: imported ${name} (${info.count} YouTube/Google cookies, ${info.signedIn ? 'signed in' : 'NOT signed in'}). `
      + 'Removed the dropped file. Restart once so YouTube search uses them too.';
  } catch (e) {
    rejected.set(drop.file, drop.mtime); // say it once, not every 30 s
    return `▲ Cookies: couldn't use ${name}: ${e.message}`;
  }
};

const status = (ytCookies) => {
  const i = ytCookies.info();
  if (!i.present) return '◌ Cookies: none saved. Drop a cookies.txt in the cookies/ folder.';
  const when = new Date(i.updatedAt).toISOString().slice(0, 16).replace('T', ' ');
  return i.valid
    ? `◆ Cookies: ${i.count} saved ${when} UTC, ${i.signedIn ? 'signed in' : 'NOT signed in'}.`
    : `▲ Cookies: saved file has a problem: ${i.problem}`;
};

const start = (ytCookies, { consoleCommands = false } = {}) => {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const readme = path.join(DIR, 'README.md');
    if (!fs.existsSync(readme)) fs.writeFileSync(readme, README);
  } catch { /* read-only folder: the dashboard upload still works */ }

  const run = () => { const msg = importDrop(ytCookies); if (msg) console.log(msg); };
  run(); // before @distube/youtube reads the cookies at startup
  setInterval(run, POLL_MS).unref();

  if (consoleCommands) {
    // Pterodactyl sends what you type in its console to stdin.
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const cmd = buf.slice(0, nl).trim().toLowerCase();
        buf = buf.slice(nl + 1);
        if (cmd === 'cookies') console.log(status(ytCookies));
        else if (cmd === 'cookies reload') console.log(importDrop(ytCookies) || '◌ Cookies: nothing new in the cookies/ folder.');
        else if (cmd === 'cookies remove') console.log(ytCookies.remove() ? '◇ Cookies: deleted.' : '◌ Cookies: there were none.');
        else if (cmd === 'help') console.log('Console commands: cookies · cookies reload · cookies remove · (Stop button = clean shutdown)');
        else if (cmd) console.log(`◌ Unknown command "${cmd}". Type help.`);
      }
    });
    process.stdin.resume();
  }
};

module.exports = { start, importDrop, newestDrop, status, DIR };
