// Backup restores that finish on the next start.
//
// Restoring while the bot runs didn't work: settings live in memory (the next
// change wrote the old ones back over the restored file) and the database is
// held open by many modules (closing it broke them until a restart, and its
// leftover -wal file could mix old data into the restored copy). So a restore
// now only stages each file next to its target as <file>.restore-pending, and
// apply() — the very first thing index.js runs — swaps them in before any
// module reads them.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SUFFIX = '.restore-pending';
const manifestPath = () => process.env.RESTORE_MANIFEST
  || (process.env.NODE_TEST_CONTEXT
    ? path.join(require('node:os').tmpdir(), `maow-restore-${process.pid}.json`)
    : path.join(ROOT, 'data', '.restore-pending.json'));

const readManifest = () => { try { return JSON.parse(fs.readFileSync(manifestPath(), 'utf8')).files || []; } catch { return []; } };
const writeManifest = (files) => {
  fs.mkdirSync(path.dirname(manifestPath()), { recursive: true });
  fs.writeFileSync(manifestPath(), JSON.stringify({ files, at: Date.now() }));
};

// Stage one file for the next start. `isDb` also drops the database's -wal/-shm
// files then, so nothing from the old database is replayed into the new one.
const stage = (target, content, { isDb = false } = {}) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}${SUFFIX}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, `${target}${SUFFIX}`);
  const files = readManifest().filter((f) => f.target !== target);
  files.push({ target, isDb });
  writeManifest(files);
};

const pending = () => readManifest();

// Swap staged files in. Returns how many were applied.
const apply = () => {
  const files = readManifest();
  if (!files.length) return 0;
  let n = 0;
  for (const { target, isDb } of files) {
    const staged = `${target}${SUFFIX}`;
    if (!fs.existsSync(staged)) continue;
    try {
      if (isDb) for (const ext of ['-wal', '-shm']) { try { fs.unlinkSync(`${target}${ext}`); } catch { /* none */ } }
      fs.renameSync(staged, target);
      n++;
    } catch (e) { console.warn(`[restore] could not apply ${target}: ${e.message}`); }
  }
  try { fs.unlinkSync(manifestPath()); } catch { /* */ }
  if (n) console.log(`[restore] applied ${n} restored file${n === 1 ? '' : 's'} from a backup`);
  return n;
};

module.exports = { stage, apply, pending, SUFFIX };
