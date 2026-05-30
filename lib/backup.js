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
  fs.writeFileSync(target, JSON.stringify(snapshot));
  return { name: path.basename(target), path: target, size: fs.statSync(target).size, createdAt: snapshot.createdAt };
};

const restore = (snapshotName, { dryRun = false } = {}) => {
  const file = path.join(BACKUP_DIR, path.basename(snapshotName));
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (snap.version !== 1) throw new Error(`Unsupported snapshot version: ${snap.version}`);
  const planned = [];
  for (const [rel, content] of Object.entries(snap.files || {})) {
    let target;
    if (rel.startsWith('library/')) {
      const libDir = process.env.LIBRARY_DIR || path.join(ROOT, 'data', 'library');
      target = path.join(libDir, rel.slice('library/'.length));
    } else {
      target = path.join(ROOT, rel);
    }
    planned.push({ rel, target, bytes: content.length });
    if (!dryRun) {
      try { fs.mkdirSync(path.dirname(target), { recursive: true }); } catch { /* */ }
      fs.writeFileSync(target, content);
    }
  }
  return { restored: planned.length, planned };
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
