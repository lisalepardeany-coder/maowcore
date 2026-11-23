// Restore a MaowCore backup (the .json.gz file from /backup or the weekly DM).
//
//   1. Stop the bot.
//   2. node scripts/restore-backup.js path/to/maowcore-backup-....json.gz
//   3. Start the bot.
//
// The files that are there now are moved to data/before-restore-<time>/ first,
// so nothing is lost. Cookies and logins aren't in backups: add them again after.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/restore-backup.js <backup.json.gz>'); process.exit(1); }
const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(file);
const bundle = JSON.parse((file.endsWith('.gz') || raw[0] === 0x1f ? zlib.gunzipSync(raw) : raw).toString('utf8'));
if (bundle.kind !== 'maowcore-backup' || !bundle.files) { console.error('That is not a MaowCore backup file.'); process.exit(1); }

const libDir = process.env.LIBRARY_DIR || path.join(ROOT, 'data', 'library');
const target = (rel) => (rel.startsWith('library/') ? path.join(libDir, rel.slice(8)) : path.join(ROOT, rel));
const aside = path.join(ROOT, 'data', `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`);
let moved = 0; let written = 0;
for (const [rel, b64] of Object.entries(bundle.files)) {
  if (!/^(data|library)\/[^/\\]+$/.test(rel)) { console.warn(`skipped odd path ${rel}`); continue; }
  const dest = target(rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    fs.mkdirSync(aside, { recursive: true });
    fs.renameSync(dest, path.join(aside, rel.replace('/', '__')));
    moved++;
  }
  fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
  written++;
}
// a database left from before would mix with the restored one
for (const ext of ['-wal', '-shm']) { const p = path.join(ROOT, 'data', `maow.db${ext}`); if (fs.existsSync(p)) { fs.mkdirSync(aside, { recursive: true }); fs.renameSync(p, path.join(aside, `maow.db${ext}`)); } }
console.log(`✓ Restored ${written} files from ${new Date(bundle.createdAt).toLocaleString()} (bot ${bundle.bot}).`);
if (moved) console.log(`  The ${moved} files that were there are in ${path.relative(ROOT, aside)}.`);
console.log('  Not in backups: YouTube cookies and logins. Add them again (cookies/ folder, sign in on the panel).');
