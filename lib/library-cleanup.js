// Library cleanup wizard for v2.1.0.
//
// Scans the library for issues and returns a report grouped by category.
// Default action is "show + confirm each" — this module never deletes
// anything on its own; the dashboard explicitly opts in to deletes.

const fs = require('node:fs');
const path = require('node:path');

const LIB_DIR = process.env.LIBRARY_DIR || path.join(__dirname, '..', 'data', 'library');

// Pure (tested): a title stripped of the bits that differ between uploads of
// the same song: (Official Audio), [Lyrics], (HD), "feat. X", punctuation, case.
const simplifyTitle = (name) => String(name || '')
  .toLowerCase()
  .replace(/[([{][^)\]}]*(official|audio|video|lyric|lyrics|visuali[sz]er|hd|hq|4k|remaster(ed)?|music video|mv)[^)\]}]*[)\]}]/g, ' ')
  .replace(/\b(official (audio|video|music video)|lyrics?|hd|hq)\b/g, ' ')
  .replace(/\b(feat\.?|ft\.?|featuring)\s.*$/, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

// Scan LIB_DIR for issues. Returns { orphans, dupes, unplayed, missingDuration, breakdown }.
const scan = (library, history, opts = {}) => {
  const unplayedDays = Math.max(7, Number(opts.unplayedDays) || 180);
  const songs = library.list();
  const fileNames = new Set(songs.map((s) => s.file));

  // 1. Orphans — files on disk not in manifest (in the library and in its
  // folders; the folders themselves aren't orphans, nor are "_"/"." ones).
  const onDisk = [];
  const ls = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };
  for (const d of ls(LIB_DIR)) {
    if (/^[_.]/.test(d.name)) continue;
    if (d.isDirectory()) { for (const f of ls(path.join(LIB_DIR, d.name))) if (f.isFile() && !/^[_.]/.test(f.name)) onDisk.push(`${d.name}/${f.name}`); }
    else if (d.isFile()) onDisk.push(d.name);
  }
  const orphans = onDisk
    .filter((f) => !fileNames.has(f))
    .map((f) => {
      const full = path.join(LIB_DIR, ...f.split('/'));
      let size = 0;
      try { size = fs.statSync(full).size; } catch { /* */ }
      return { file: f, size };
    });

  // 2. Duplicates — same sourceUrl (for installed songs) OR same display name,
  // within one folder: the same song in two playlist folders is on purpose.
  const folderOf = (s) => s.folder || (String(s.file).includes('/') ? s.file.split('/')[0] : '');
  const byUrl = new Map();
  const byName = new Map();
  for (const s of songs) {
    if (s.sourceUrl) {
      const k = `${folderOf(s)}\n${s.sourceUrl}`;
      const arr = byUrl.get(k) || [];
      arr.push(s);
      byUrl.set(k, arr);
    }
    const k = `${folderOf(s)}\n${s.name}`;
    const arr = byName.get(k) || [];
    arr.push(s);
    byName.set(k, arr);
  }
  const dupes = [];
  for (const [k, arr] of byUrl) {
    if (arr.length > 1) dupes.push({ kind: 'sourceUrl', key: k.split('\n')[1], songs: arr.map((s) => ({ id: s.id, name: s.name, file: s.file, size: s.size })) });
  }
  for (const [k, arr] of byName) {
    if (arr.length > 1 && !arr.every((s) => s.sourceUrl && byUrl.get(`${folderOf(s)}\n${s.sourceUrl}`)?.length > 1)) {
      dupes.push({ kind: 'name', key: k.split('\n')[1], songs: arr.map((s) => ({ id: s.id, name: s.name, file: s.file, size: s.size })) });
    }
  }
  // Same song under different titles ("Song", "Song (Official Audio)", "SONG [Lyrics]"):
  // same simplified title and, when both are known, lengths within 3 seconds.
  const grouped = new Set(dupes.flatMap((d) => d.songs.map((s) => s.id)));
  const bySimple = new Map();
  for (const s of songs) {
    const t = simplifyTitle(s.name);
    if (!t || grouped.has(s.id)) continue;
    const k = `${folderOf(s)}\n${t}`;
    const arr = bySimple.get(k) || [];
    arr.push(s);
    bySimple.set(k, arr);
  }
  for (const [k, arr] of bySimple) {
    if (arr.length < 2) continue;
    const ref = arr.find((s) => s.durationSec) || arr[0];
    const same = arr.filter((s) => !s.durationSec || !ref.durationSec || Math.abs(s.durationSec - ref.durationSec) <= 3);
    if (same.length > 1) dupes.push({ kind: 'similar', key: k.split('\n')[1], songs: same.map((s) => ({ id: s.id, name: s.name, file: s.file, size: s.size })) });
  }
  // Which copy to keep in each group: the one added first (what you had before).
  const added = new Map(songs.map((s) => [s.id, s.addedAt || 0]));
  for (const d of dupes) {
    d.keep = [...d.songs].sort((a, b) => (added.get(a.id) || 0) - (added.get(b.id) || 0))[0]?.id || null;
    d.songs.forEach((s) => { s.addedAt = added.get(s.id) || null; });
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

// Delete a list of orphan files. Each entry must be a file name, or
// <folder>/<file>, inside LIB_DIR — protect against path traversal.
const deleteOrphans = (files) => {
  const results = [];
  for (const f of files) {
    const parts = String(f).replace(/\\/g, '/').split('/');
    const base = parts.join('/');
    const full = path.join(LIB_DIR, ...parts);
    if (parts.length > 2 || parts.some((p) => !p || p === '.' || p === '..' || /^[_.]/.test(p))
      || !full.startsWith(LIB_DIR + path.sep)) {
      results.push({ file: base, ok: false, error: 'forbidden' });
      continue;
    }
    try { if (!fs.statSync(full).isFile()) { results.push({ file: base, ok: false, error: 'not a file' }); continue; } } catch { /* unlink reports it */ }
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

// Remove library songs (file + manifest entry) by id, e.g. duplicates.
const removeSongs = (library, ids) => (Array.isArray(ids) ? ids : []).map((id) => {
  const s = library.get(String(id));
  return { id, name: s?.name || null, ok: s ? !!library.remove(String(id)) : false };
});

module.exports = { scan, deleteOrphans, probeMissing, removeSongs, simplifyTitle };
