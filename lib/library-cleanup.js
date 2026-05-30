// Library cleanup wizard for v2.1.0.
//
// Scans the library for issues and returns a report grouped by category.
// Default action is "show + confirm each" — this module never deletes
// anything on its own; the dashboard explicitly opts in to deletes.

const fs = require('node:fs');
const path = require('node:path');

const LIB_DIR = process.env.LIBRARY_DIR || path.join(__dirname, '..', 'data', 'library');

// Scan LIB_DIR for issues. Returns { orphans, dupes, unplayed, missingDuration, breakdown }.
const scan = (library, history, opts = {}) => {
  const unplayedDays = Math.max(7, Number(opts.unplayedDays) || 180);
  const songs = library.list();
  const fileNames = new Set(songs.map((s) => s.file));

  // 1. Orphans — files on disk not in manifest.
  let onDisk = [];
  try { onDisk = fs.readdirSync(LIB_DIR); } catch { /* no LIB_DIR yet */ }
  const orphans = onDisk
    .filter((f) => !f.startsWith('_') && !fileNames.has(f))
    .map((f) => {
      const full = path.join(LIB_DIR, f);
      let size = 0;
      try { size = fs.statSync(full).size; } catch { /* */ }
      return { file: f, size };
    });

  // 2. Duplicates — same sourceUrl (for installed songs) OR same display name.
  const byUrl = new Map();
  const byName = new Map();
  for (const s of songs) {
    if (s.sourceUrl) {
      const arr = byUrl.get(s.sourceUrl) || [];
      arr.push(s);
      byUrl.set(s.sourceUrl, arr);
    }
    const arr = byName.get(s.name) || [];
    arr.push(s);
    byName.set(s.name, arr);
  }
  const dupes = [];
  for (const [url, arr] of byUrl) {
    if (arr.length > 1) dupes.push({ kind: 'sourceUrl', key: url, songs: arr.map((s) => ({ id: s.id, name: s.name, file: s.file, size: s.size })) });
  }
  for (const [name, arr] of byName) {
    if (arr.length > 1 && !arr.every((s) => s.sourceUrl && byUrl.get(s.sourceUrl)?.length > 1)) {
      dupes.push({ kind: 'name', key: name, songs: arr.map((s) => ({ id: s.id, name: s.name, file: s.file, size: s.size })) });
    }
  }

  // 3. Unplayed for N+ months — songs never appearing in history.
  // Pool of guild histories: use allGuilds() if available.
  let playedNames = new Set();
  try {
    const guilds = history.allGuilds();
    const cutoff = Date.now() - unplayedDays * 86400000;
    for (const g of guilds) {
      for (const h of history.list(g, 500)) {
        if (h.ts >= cutoff) playedNames.add(h.name);
      }
    }
  } catch { /* */ }
  const unplayed = songs
    .filter((s) => !playedNames.has(s.name))
    .filter((s) => s.addedAt && s.addedAt < Date.now() - unplayedDays * 86400000)
    .map((s) => ({ id: s.id, name: s.name, file: s.file, size: s.size, addedAt: s.addedAt }));

  // 4. Missing durations — installed but never probed.
  const missingDuration = songs
    .filter((s) => s.durationSec == null)
    .map((s) => ({ id: s.id, name: s.name, file: s.file }));

  // 5. Storage breakdown — by format.
  const breakdown = {};
  for (const s of songs) {
    const ext = s.ext || 'unknown';
    if (!breakdown[ext]) breakdown[ext] = { count: 0, bytes: 0 };
    breakdown[ext].count++;
    breakdown[ext].bytes += s.size || 0;
  }

  return {
    scannedAt: Date.now(),
    libDir: LIB_DIR,
    totalSongs: songs.length,
    totalBytes: songs.reduce((a, s) => a + (s.size || 0), 0),
    orphans,
    dupes,
    unplayed,
    missingDuration,
    breakdown,
    unplayedDays,
  };
};

// Delete a list of orphan files. Each entry must be a bare filename
// inside LIB_DIR — protect against path traversal.
const deleteOrphans = (files) => {
  const results = [];
  for (const f of files) {
    const base = path.basename(String(f));
    const full = path.join(LIB_DIR, base);
    if (!full.startsWith(LIB_DIR) || base.startsWith('_')) {
      results.push({ file: base, ok: false, error: 'forbidden' });
      continue;
    }
    try { fs.unlinkSync(full); results.push({ file: base, ok: true }); }
    catch (e) { results.push({ file: base, ok: false, error: e.message }); }
  }
  return results;
};

// Re-probe missing durations via library.probeAndStore.
const probeMissing = async (library) => {
  const songs = library.list();
  const missing = songs.filter((s) => s.durationSec == null);
  let probed = 0;
  for (const s of missing) {
    const fullPath = library.getPath(s.id);
    if (!fullPath) continue;
    try {
      await library.probeAndStore(s.id, fullPath);
      probed++;
    } catch { /* */ }
  }
  return { attempted: missing.length, probed };
};

module.exports = { scan, deleteOrphans, probeMissing };
