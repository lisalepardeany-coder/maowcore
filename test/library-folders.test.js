// Library folders: real subfolders of the library (lib/library.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-folders-'));
process.env.LIBRARY_DIR = tmpRoot;
// an empty library (else the old data/library.json of this PC is migrated in)
fs.writeFileSync(path.join(tmpRoot, '_manifest.json'), JSON.stringify({ songs: [] }));
const library = require('../lib/library');
const cleanup = require('../lib/library-cleanup');
const MP3 = Buffer.from('ID3fake-mp3-bytes');
const onDisk = (rel) => fs.existsSync(path.join(tmpRoot, ...rel.split('/')));

test('folders: names are cleaned and can\'t climb out or clash with the bot\'s own', () => {
  assert.equal(library.sanitizeFolder('  Chill  Vibes '), 'Chill Vibes');
  assert.equal(library.sanitizeFolder('../../etc'), 'etc');
  assert.equal(library.sanitizeFolder('a/b\\c'), 'a b c');
  assert.equal(library.sanitizeFolder('_incoming'), 'incoming');
  assert.equal(library.sanitizeFolder('.hidden'), 'hidden');
  assert.equal(library.sanitizeFolder('CON'), 'CON_');
  assert.equal(library.sanitizeFolder(''), '');
  assert.equal(library.sanitizeFolder('x'.repeat(100)).length, 60);
  assert.throws(() => library.createFolder('///'), /name/);
});

test('folders: an upload goes into the chosen folder on disk', () => {
  const e = library.add('Song One.mp3', MP3, { folder: 'Chill' });
  assert.equal(e.folder, 'Chill');
  assert.match(e.file, /^Chill\/[a-z0-9]+-Song_One\.mp3$/);
  assert.ok(onDisk(e.file));
  assert.equal(library.getPath(e.id), path.join(tmpRoot, 'Chill', e.file.split('/')[1]));
  const t = library.createUploadTarget('Two.mp3', { folder: 'Chill' });
  assert.equal(t.fullPath, path.join(tmpRoot, 'Chill', t.file.split('/')[1]));
  const root = library.add('Root.mp3', MP3);
  assert.equal(root.folder, '');
  assert.ok(!root.file.includes('/'));
});

test('folders: list, move, and old links still find a moved song', () => {
  library.createFolder('Empty One');
  const names = library.listFolders().map((f) => `${f.name}:${f.count}`);
  assert.deepEqual(names, [':1', 'Chill:1', 'Empty One:0']);
  const song = library.list().find((s) => s.name === 'Song One');
  const oldUrl = `http://127.0.0.1:8765/library/${encodeURIComponent(song.file)}`;
  assert.equal(library.fileOfUrl(oldUrl), song.file);
  const moved = library.moveSong(song.id, 'Party');
  assert.match(moved.file, /^Party\//);
  assert.ok(onDisk(moved.file) && !onDisk(song.file.replace(/^Party/, 'Chill')));
  assert.ok(library.isPlayableUrl(oldUrl), 'a queued link from before the move still plays');
  assert.equal(library.findByFile(library.fileOfUrl(oldUrl)).id, song.id);
  library.moveSong(song.id, '');
  assert.equal(library.get(song.id).folder, '');
  library.moveSong(song.id, 'Chill');
});

test('folders: links that try to leave the library are refused', () => {
  for (const bad of ['..%2F..%2Fsecret.txt', 'a%2Fb%2Fc.mp3', '%2E%2E', 'x%2F..%2Fy']) {
    assert.equal(library.fileOfUrl(`http://127.0.0.1:1/library/${bad}`), null, bad);
  }
});

test('folders: rename moves every song with it (case-only too)', () => {
  const to = library.renameFolder('Chill', 'Chill Mix');
  assert.equal(to, 'Chill Mix');
  const s = library.list().find((x) => x.name === 'Song One');
  assert.equal(s.folder, 'Chill Mix');
  assert.ok(onDisk(s.file));
  assert.equal(library.renameFolder('Chill Mix', 'chill mix'), 'chill mix');
  assert.ok(onDisk(library.get(s.id).file));
  assert.throws(() => library.renameFolder('Nope', 'X'), /No such folder/);
  library.createFolder('Taken');
  assert.throws(() => library.renameFolder('chill mix', 'Taken'), /already/);
});

test('folders: delete moves the songs out, or deletes them with it', () => {
  const a = library.add('A.mp3', MP3, { folder: 'Old' });
  const r1 = library.deleteFolder('Old');
  assert.deepEqual(r1, { folder: 'Old', moved: 1, deleted: 0 });
  assert.equal(library.get(a.id).folder, '');
  assert.ok(!fs.existsSync(path.join(tmpRoot, 'Old')));
  const b = library.add('B.mp3', MP3, { folder: 'Gone' });
  library.deleteFolder('Gone', { songs: 'delete' });
  assert.equal(library.get(b.id), null);
});

test('folders: the same song in another folder is copied, not downloaded again', () => {
  const src = library.add('Hit.mp3', MP3, { folder: 'Party' });
  // pretend it was installed from a link
  const m = JSON.parse(fs.readFileSync(path.join(tmpRoot, '_manifest.json'), 'utf8'));
  Object.assign(m.songs.find((s) => s.id === src.id), { source: 'install', sourceUrl: 'https://youtu.be/HHHHHHHHHHH', format: 'original' });
  fs.writeFileSync(path.join(tmpRoot, '_manifest.json'), JSON.stringify(m));
  assert.equal(library.findBySourceUrl('https://youtu.be/HHHHHHHHHHH', 'original', 'Workout'), null);
  const copy = library.copyToFolder(library.get(src.id), 'Workout');
  assert.match(copy.file, /^Workout\/[a-z0-9]+-Hit\.mp3$/);
  assert.notEqual(copy.id, src.id);
  assert.deepEqual(fs.readFileSync(path.join(tmpRoot, ...copy.file.split('/'))), MP3);
  assert.equal(library.findBySourceUrl('https://youtu.be/HHHHHHHHHHH', 'original', 'Workout').id, copy.id);
  // the cleanup wizard doesn't call the two copies duplicates, nor folders orphans
  const report = cleanup.scan(library, { allGuilds: () => [] });
  assert.ok(!report.dupes.some((d) => d.songs.some((s) => s.id === copy.id)));
  assert.deepEqual(report.orphans, []);
});

test('folders: a stray file inside a folder is an orphan the wizard can delete', () => {
  fs.writeFileSync(path.join(tmpRoot, 'Party', 'stray.mp3'), 'x');
  const report = cleanup.scan(library, { allGuilds: () => [] });
  assert.deepEqual(report.orphans.map((o) => o.file), ['Party/stray.mp3']);
  assert.deepEqual(cleanup.deleteOrphans(['../x', 'Party/../../x', '_incoming/y']).map((r) => r.ok), [false, false, false]);
  assert.deepEqual(cleanup.deleteOrphans(['Party/stray.mp3']).map((r) => r.ok), [true]);
});

test('folders: songs saved while playing go to the auto-save folder', () => {
  assert.equal(library.loadConfig().autoSaveFolder, 'Played');
  const tmp = path.join(tmpRoot, 'tmp.webm');
  fs.writeFileSync(tmp, 'webm');
  const e = library.addPlayed(tmp, { name: 'Played Song', ext: 'webm', folder: library.loadConfig().autoSaveFolder });
  assert.match(e.file, /^Played\//);
  library.saveConfig({ autoSaveFolder: '../Nope' });
  assert.equal(library.loadConfig().autoSaveFolder, 'Nope');
  library.saveConfig({ autoSaveFolder: '' });
  assert.equal(library.loadConfig().autoSaveFolder, '');
});

test('cleanup', () => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });
