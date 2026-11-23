// ===== Offsite backups =====
// The bot's data (settings, levels, economy, playlists, the database, the
// library list) packed into one file and DM'd to the owner (OWNER_USER_ID) on a
// schedule, so a broken or wiped server doesn't take everything with it.
//
//   OFFSITE_BACKUP = weekly (default) | daily | off
//
// Never included: YouTube cookies, panel sign-in sessions and API keys (they
// are logins, and a backup travels), plus .bak/.corrupt copies and other
// leftovers. Audio files aren't included either (too big); the library list
// is, so songs can be downloaded again.
//
// Restore: stop the bot, then  node scripts/restore-backup.js <file.json.gz>
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const STATE = path.join(DATA, '.offsite-backup.json');
const MAX_DM_BYTES = 9.5 * 1024 * 1024; // Discord's upload limit for bots is 10 MB

// Pure (tested): may this data/ file go into a backup?
const SECRET = /^(youtube-cookies|sessions\.json|api-tokens\.json|\.env)/i;
const JUNK = /(\.bak|\.tmp|\.corrupt-.*|\.pre-v[\d.]+|-shm|-wal)$|^(package-lock.*|\.supervisor\.json|\.last-exit\.json|\.offsite-backup\.json)$/i;
const include = (name) => !SECRET.test(name) && !JUNK.test(name) && name !== 'maow.db';

const pack = async () => {
  const files = {};
  const skipped = [];
  for (const name of fs.existsSync(DATA) ? fs.readdirSync(DATA) : []) {
    const full = path.join(DATA, name);
    let st; try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    if (!include(name)) { if (SECRET.test(name)) skipped.push(name); continue; }
    files[`data/${name}`] = fs.readFileSync(full).toString('base64');
  }
  // the database: a consistent copy even while the bot writes to it
  try {
    const db = require('./db');
    if (db.isAvailable) files['data/maow.db'] = (await db.backup()).toString('base64');
  } catch (e) { console.warn('[offsite-backup] database copy failed:', e.message); }
  // the library list + playlist subscriptions + download settings (live next to the songs)
  const libDir = require('./library').LIB_DIR;
  for (const name of ['_manifest.json', '_subs.json', '_config.json']) {
    const full = path.join(libDir, name);
    if (fs.existsSync(full)) files[`library/${name}`] = fs.readFileSync(full).toString('base64');
  }
  const bundle = { kind: 'maowcore-backup', version: 2, createdAt: Date.now(), bot: require('../package.json').version, files, leftOut: skipped };
  return { buffer: zlib.gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 }), count: Object.keys(files).length, skipped };
};

const fileName = () => `maowcore-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json.gz`;

const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
const writeState = (s) => { try { fs.writeFileSync(STATE, JSON.stringify(s)); } catch { /* */ } };

// DM a fresh backup to the owner now. Returns { ok, bytes, count } or { ok:false, error }.
const sendNow = async (client) => {
  const owner = process.env.OWNER_USER_ID;
  if (!owner) return { ok: false, error: 'OWNER_USER_ID is not set, so there is nobody to send it to.' };
  const { buffer, count } = await pack();
  const user = await client.users.fetch(owner);
  if (buffer.length > MAX_DM_BYTES) {
    await user.send(`🗄 Backup skipped: it's ${(buffer.length / 1048576).toFixed(1)} MB, over Discord's 10 MB limit. Use the panel's Backups page instead.`);
    return { ok: false, error: 'too big for Discord', bytes: buffer.length };
  }
  await user.send({
    content: `🗄 **MaowCore backup** · ${count} files · ${(buffer.length / 1024).toFixed(0)} KB\n`
      + 'Settings, levels, economy, playlists and the library list (no songs, no cookies or logins). '
      + 'To restore: stop the bot, put the file in its folder and run `node scripts/restore-backup.js <file>`.',
    files: [{ attachment: buffer, name: fileName() }],
  });
  writeState({ ...readState(), lastSentAt: Date.now(), lastBytes: buffer.length });
  return { ok: true, bytes: buffer.length, count };
};

const intervalMs = () => {
  const v = String(process.env.OFFSITE_BACKUP || 'weekly').toLowerCase();
  if (v === 'off' || v === '0' || v === 'false') return 0;
  return v === 'daily' ? 86400000 : 7 * 86400000;
};

// Checked every hour; sends when the last one is older than the interval.
const start = (client) => {
  const every = intervalMs();
  if (!every || !process.env.OWNER_USER_ID) return;
  const tick = async () => {
    if (!client.isReady?.()) return;
    const last = readState().lastSentAt || 0;
    if (Date.now() - last < every) return;
    try {
      const r = await sendNow(client);
      if (r.ok) console.log(`🗄 Offsite backup sent to the owner (${(r.bytes / 1024).toFixed(0)} KB)`);
    } catch (e) { console.warn('[offsite-backup] send failed:', e.message); }
  };
  setTimeout(tick, 5 * 60 * 1000).unref?.(); // 5 min after start
  setInterval(tick, 60 * 60 * 1000).unref?.();
};

module.exports = { pack, sendNow, start, include, fileName, intervalMs };
