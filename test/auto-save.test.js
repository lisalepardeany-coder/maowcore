// Songs are saved to the library as they play (lib/auto-save.js + yt-stream's copy).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-autosave-'));
process.env.LIBRARY_DIR = tmpRoot;
const library = require('../lib/library');
const ys = require('../lib/yt-stream');
const autoSave = require('../lib/auto-save');

const fakes = [];
ys._setSpawn(() => {
  const p = new EventEmitter();
  p.stdout = new PassThrough(); p.stderr = new PassThrough(); p.exitCode = null;
  p.end = (code = 0) => { p.stdout.end(); p.stderr.end(); setImmediate(() => { p.exitCode = code; p.emit('close', code); }); };
  p.kill = () => { if (p.exitCode === null) p.end(null); };
  fakes.push(p);
  return p;
});
autoSave.start();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('opus-audio-bytes')]);
const song = (id, extra = {}) => ({ url: `https://www.youtube.com/watch?v=${id}`, name: `Song ${id}`, uploader: { name: 'Artist' }, duration: 200, ...extra });
const incoming = () => { try { return fs.readdirSync(library.INCOMING_DIR); } catch { return []; } };

test('auto-save: a song that downloaded completely and played is saved', async () => {
  ys.prefetch('https://youtu.be/AAAAAAAAAAA');
  fakes.at(-1).stdout.write(WEBM); fakes.at(-1).end(0);
  await wait(50);
  assert.equal(library.findByVideoId('AAAAAAAAAAA'), null, 'not saved before it plays');
  const entry = autoSave.notePlayed(song('AAAAAAAAAAA'));
  assert.ok(entry, 'saved once it plays');
  assert.equal(entry.source, 'played');
  assert.equal(entry.ext, 'webm');
  assert.equal(entry.name, 'Song AAAAAAAAAAA');
  assert.equal(entry.uploader, 'Artist');
  assert.equal(entry.durationSec, 200);
  assert.deepEqual(fs.readFileSync(path.join(library.LIB_DIR, entry.file)), WEBM);
  assert.equal(library.findByVideoId('AAAAAAAAAAA').id, entry.id);
  assert.deepEqual(incoming(), []);
  // in the library now: no second YouTube download
  const before = fakes.length;
  assert.equal(ys.prefetch('https://www.youtube.com/watch?v=AAAAAAAAAAA'), false);
  assert.equal(fakes.length, before);
});

test('auto-save: also when the song starts playing before the download ends', async () => {
  ys.prefetch('https://www.youtube.com/watch?v=BBBBBBBBBBB');
  assert.equal(autoSave.notePlayed(song('BBBBBBBBBBB')), null);
  fakes.at(-1).stdout.write(WEBM); fakes.at(-1).end(0);
  await wait(50);
  assert.ok(library.findByVideoId('BBBBBBBBBBB'));
});

test('auto-save: a skipped (stopped) download is thrown away', async () => {
  ys.prefetch('https://www.youtube.com/watch?v=CCCCCCCCCCC');
  autoSave.notePlayed(song('CCCCCCCCCCC'));
  fakes.at(-1).stdout.write(WEBM);
  ys.dropPrefetch('https://www.youtube.com/watch?v=CCCCCCCCCCC');
  await wait(50);
  assert.equal(library.findByVideoId('CCCCCCCCCCC'), null);
  assert.deepEqual(incoming(), []);
});

test('auto-save: long videos and unknown formats are not saved', async () => {
  ys.prefetch('https://www.youtube.com/watch?v=DDDDDDDDDDD');
  fakes.at(-1).stdout.write(WEBM); fakes.at(-1).end(0);
  await wait(50);
  assert.equal(autoSave.notePlayed(song('DDDDDDDDDDD', { duration: 3 * 3600 })), null);
  ys.prefetch('https://www.youtube.com/watch?v=EEEEEEEEEEE');
  fakes.at(-1).stdout.write('<html>not audio</html>'); fakes.at(-1).end(0);
  await wait(50);
  assert.equal(autoSave.notePlayed(song('EEEEEEEEEEE')), null);
  assert.equal(library.findByVideoId('DDDDDDDDDDD'), null);
  assert.equal(library.findByVideoId('EEEEEEEEEEE'), null);
  assert.deepEqual(incoming(), []);
});

test('auto-save: turned off → nothing is copied', async () => {
  library.saveConfig({ autoSave: false });
  const n = fakes.length;
  ys.prefetch('https://www.youtube.com/watch?v=FFFFFFFFFFF');
  assert.equal(fakes.length, n + 1);
  assert.deepEqual(incoming(), []);
  fakes.at(-1).stdout.write(WEBM); fakes.at(-1).end(0);
  await wait(50);
  assert.equal(autoSave.notePlayed(song('FFFFFFFFFFF')), null);
  library.saveConfig({ autoSave: true });
  assert.equal(library.loadConfig().concurrency, 2, 'other settings kept');
});

test('auto-save: when full, the longest-unplayed saved songs go first; uploads never', () => {
  const manifest = path.join(library.LIB_DIR, '_manifest.json');
  const mk = (id, source, lastPlayedAt) => {
    fs.writeFileSync(path.join(library.LIB_DIR, `${id}.webm`), WEBM);
    return { id, file: `${id}.webm`, name: id, ext: 'webm', size: 60 * 1048576, addedAt: 1, lastPlayedAt, ...(source ? { source } : {}) };
  };
  fs.writeFileSync(manifest, JSON.stringify({ songs: [
    mk('old', 'played', 100), mk('recent', 'played', 300), mk('mid', 'played', 200), mk('upload', null, 0),
  ] }));
  library.saveConfig({ autoSaveMaxMB: 100 });
  const removed = autoSave.enforceCap(null);
  assert.deepEqual(removed, ['old', 'mid']);
  assert.deepEqual(library.list().map((s) => s.id).sort(), ['recent', 'upload']);
});

test('auto-save: the file type is read from its first bytes', () => {
  const f = path.join(tmpRoot, 'probe.bin');
  const t = (b) => { fs.writeFileSync(f, b); return autoSave.sniffExt(f); };
  assert.equal(t(WEBM), 'webm');
  assert.equal(t(Buffer.from('\0\0\0\x20ftypM4A ', 'latin1')), 'm4a');
  assert.equal(t(Buffer.from('OggS\0\0\0\0\0\0\0\0')), 'ogg');
  assert.equal(t(Buffer.from('nope nope nope')), null);
});

test('cleanup', () => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });
