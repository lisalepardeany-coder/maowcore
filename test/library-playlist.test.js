// Playlist install stops at YouTube's rate limit instead of trying every song.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

test('playlist install: stops at the first rate limit, max 3 at once on YouTube', async () => {
  process.env.LIBRARY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-pl-'));
  // A fake yt-dlp: the playlist has 40 entries; every video download is rate-limited.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-ytdlp-'));
  const script = path.join(dir, 'fake.js');
  fs.writeFileSync(script, `
    const args = process.argv.slice(2);
    if (args.includes('--flat-playlist')) {
      process.stdout.write(JSON.stringify({ id: 'PL1', title: 'Test', entries: Array.from({ length: 40 }, (_, i) => ({ url: 'https://www.youtube.com/watch?v=v' + i, title: 'Song ' + i })) }));
    } else {
      setTimeout(() => {
        process.stderr.write('ERROR: [youtube] v: Video unavailable. The current session has been rate-limited by YouTube for up to an hour.\\n');
        process.exit(1);
      }, 50);
    }`);
  fs.writeFileSync(path.join(dir, 'yt-dlp'), ''); // only has to exist
  process.env.YTDLP_DIR = dir;
  process.env.YTDLP_FILENAME = 'yt-dlp';
  // library.js starts yt-dlp with child_process.spawn: run the fake script with Node instead
  // (works the same on Windows and Linux), and count how many run at once.
  const realSpawn = cp.spawn;
  let running = 0, peak = 0;
  cp.spawn = (_bin, args, opts) => {
    const p = realSpawn(process.execPath, [script, ...args], opts);
    running++; peak = Math.max(peak, running);
    p.on('close', () => { running--; });
    return p;
  };
  try {
    delete require.cache[require.resolve('../lib/library')];
    const library = require('../lib/library');
    const result = await library.installPlaylistFromUrl('https://www.youtube.com/playlist?list=PL1', { concurrency: 5 });
    assert.equal(result.rateLimited, true);
    assert.ok(peak <= 3, `ran ${peak} at once, expected at most 3`);
    assert.ok(result.failed.length <= 3, `tried ${result.failed.length}, expected at most one per worker`);
    assert.equal(result.failed.length + result.notTried, 40);
  } finally {
    cp.spawn = realSpawn;
  }
});
