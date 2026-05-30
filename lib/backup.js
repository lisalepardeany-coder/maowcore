// Backup / disaster recovery for v2.3.0.
//
// Snapshots are tar-ish (just JSON metadata + raw files) bundles produced by
// concatenating the small JSON state files. Audio files are NOT included by
// default (too big); the manifest references them so on restore we list any
// orphans for the operator to re-install.
//
// Snapshot file format: a single JSON file with shape:
//   { version: 1, createdAt, files: { [path]: jsonString } }
// Stored under data/backups/<timestamp>.json. Operator can also export to
// any path or pipe to S3/GCS via a sidecar.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'data', 'backups');
const SOURCES = [
  'data/config.json',
  'data/history.json',
  'data/sessions.json',
  'data/social.json',
  'data/playlist-subs.json',
  'data/library.json',  // legacy manifest if still present
];

const ensureDir = () => { try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch { /* */ } };

const list = () => {
  ensureDir();
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const full = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(full);
        return { name: f, path: full, size: stat.size, createdAt: stat.mtimeMs };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
};

const create = () => {
  ensureDir();
  const files = {};
  for (const rel of SOURCES) {
    const full = path.join(ROOT, rel);
    try {
      files[rel] = fs.readFileSync(full, 'utf8');
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  // Also pull library manifest (could be inside LIBRARY_DIR if user moved it).
  const libDir = process.env.LIBRARY_DIR || path.join(ROOT, 'data', 'library');
  for (const f of ['_manifest.json', '_config.json', '_subs.json']) {
    const full = path.join(libDir, f);
    try {
      files[`library/${f}`] = fs.readFileSync(full, 'utf8');
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  const snapshot = { version: 1, createdAt: Date.now(), files };
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(BACKUP_DIR, `snapshot-${ts}.json`);
  // Atomic write: .tmp + rename. A crash mid-write would otherwise leave a
  // half-written snapshot that JSON.parse would barf on during restore.
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot));
  fs.renameSync(tmp, target);
  return { name: path.basename(target), path: target, size: fs.statSync(target).size, createdAt: snapshot.createdAt };
};

const restore = (snapshotName, { dryRun = false } = {}) => {
  const file = path.join(BACKUP_DIR, path.basename(snapshotName));
  if (!file.startsWith(BACKUP_DIR)) throw new Error('Forbidden snapshot path.');
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (snap.version !== 1) throw new Error(`Unsupported snapshot version: ${snap.version}`);
  const libDir = process.env.LIBRARY_DIR || path.join(ROOT, 'data', 'library');
  const planned = [];
  for (const [rel, content] of Object.entries(snap.files || {})) {
    let target;
    let allowedBase;
    if (rel.startsWith('library/')) {
      target = path.join(libDir, rel.slice('library/'.length));
      allowedBase = libDir;
    } else {
      target = path.join(ROOT, rel);
      allowedBase = ROOT;
    }
    // Path-traversal guard: a malicious snapshot with rel: '../../etc/passwd'
    // would resolve outside ROOT. Reject anything that escapes its allowed
    // base directory.
    const resolvedTarget = path.resolve(target);
    const resolvedBase = path.resolve(allowedBase);
    if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
      planned.push({ rel, target, bytes: content.length, skipped: 'path-traversal' });
      continue;
    }
    planned.push({ rel, target, bytes: content.length });
    if (!dryRun) {
      try { fs.mkdirSync(path.dirname(target), { recursive: true }); } catch { /* */ }
      // Atomic per-file: write .tmp + rename so a crash mid-restore doesn't
      // leave a half-written critical file (config.json corrupted = bot
      // can't start).
      const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, target);
    }
  }
  const skipped = planned.filter((p) => p.skipped).length;
  return { restored: planned.length - skipped, skipped, planned };
};

const remove = (snapshotName) => {
  const file = path.join(BACKUP_DIR, path.basename(snapshotName));
  if (!file.startsWith(BACKUP_DIR)) throw new Error('Forbidden path.');
  try { fs.unlinkSync(file); return true; } catch { return false; }
};

// Background scheduler — daily snapshot, retains last 14.
const startScheduler = ({ retain = 14, intervalHours = 24, onLog } = {}) => {
  const noop = onLog || (() => {});
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    try {
      const snap = create();
      noop(`✓ Auto-backup: ${snap.name} (${(snap.size / 1024).toFixed(1)} KB)`, 'info');
      // Prune old snapshots beyond retain count.
      const all = list();
      if (all.length > retain) {
        for (const s of all.slice(retain)) {
          try { fs.unlinkSync(s.path); } catch { /* */ }
        }
      }
    } catch (e) {
      noop(`✕ Auto-backup failed: ${e.message}`, 'error');
    }
  };
  const timer = setInterval(tick, intervalHours * 3600000);
  timer.unref?.();
  // First snapshot ~5 minutes after boot.
  const boot = setTimeout(tick, 5 * 60 * 1000);
  boot.unref?.();
  return () => { stopped = true; clearInterval(timer); clearTimeout(boot); };
};

module.exports = { list, create, restore, remove, startScheduler, BACKUP_DIR };
