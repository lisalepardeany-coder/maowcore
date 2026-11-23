const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ytCookies = require('../lib/yt-cookies'); // writes to a temp file under node --test
const drop = require('../lib/cookie-drop');

const future = Math.floor(Date.now() / 1000) + 86400 * 30;
const goodFile = [
  '# Netscape HTTP Cookie File',
  `.youtube.com\tTRUE\t/\tTRUE\t${future}\tPREF\tf6=40000000`,
  `.youtube.com\tTRUE\t/\tTRUE\t${future}\tLOGIN_INFO\tabc`,
  `.mybank.example\tTRUE\t/\tTRUE\t${future}\tsession\tsecret`,
].join('\n');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'maow-cookie-drop-'));

test('a dropped cookies.txt is imported, stripped to YouTube, and removed', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'README.md'), 'readme');
  fs.writeFileSync(path.join(dir, 'my cookies.txt'), goodFile);
  const msg = drop.importDrop(ytCookies, dir);
  assert.match(msg, /imported my cookies\.txt/);
  assert.match(msg, /signed in/);
  assert.equal(fs.existsSync(path.join(dir, 'my cookies.txt')), false);
  assert.equal(fs.existsSync(path.join(dir, 'README.md')), true);
  const saved = fs.readFileSync(ytCookies.FILE, 'utf8');
  assert.match(saved, /LOGIN_INFO/);
  assert.doesNotMatch(saved, /mybank/);
  assert.equal(drop.importDrop(ytCookies, dir), null); // nothing left to do
  ytCookies.remove();
});

test('a bad file is reported once and left in place', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'cookies.txt'), 'not a cookie file');
  assert.match(drop.importDrop(ytCookies, dir), /couldn't use cookies\.txt/);
  assert.equal(drop.importDrop(ytCookies, dir), null);
  assert.equal(fs.existsSync(path.join(dir, 'cookies.txt')), true);
});

test('an empty or missing folder does nothing', () => {
  assert.equal(drop.importDrop(ytCookies, tempDir()), null);
  assert.equal(drop.importDrop(ytCookies, path.join(os.tmpdir(), 'maow-no-such-dir')), null);
});
