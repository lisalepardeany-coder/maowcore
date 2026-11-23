const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readJson, writeJson } = require('../lib/safe-json');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'maow-sj-')), 'store.json');
const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };

test('safe-json: missing file gives the fallback', () => {
  assert.deepEqual(readJson(tmpFile(), { a: 1 }), { a: 1 });
});

test('safe-json: write is complete and keeps the previous version as .bak', () => {
  const f = tmpFile();
  writeJson(f, { v: 1 });
  writeJson(f, { v: 2 });
  assert.deepEqual(readJson(f, null), { v: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(`${f}.bak`, 'utf8')), { v: 1 });
  assert.equal(fs.readdirSync(path.dirname(f)).filter((n) => n.endsWith('.tmp')).length, 0);
});

test('safe-json: a half-written file is restored from the backup, and kept aside', () => {
  const f = tmpFile();
  writeJson(f, { giveaways: ['a', 'b'] });
  writeJson(f, { giveaways: ['a', 'b', 'c'] });
  fs.writeFileSync(f, '{"giveaways":["a","b","c"'); // crash mid-save
  const data = quiet(() => readJson(f, {}));
  assert.deepEqual(data, { giveaways: ['a', 'b'] }); // last good save, not {}
  assert.ok(fs.readdirSync(path.dirname(f)).some((n) => n.includes('.corrupt-')), 'damaged copy kept');
});

test('safe-json: damaged and no backup → fallback, damaged copy still kept', () => {
  const f = tmpFile();
  fs.writeFileSync(f, 'not json');
  assert.deepEqual(quiet(() => readJson(f, [])), []);
  assert.ok(fs.readdirSync(path.dirname(f)).some((n) => n.includes('.corrupt-')));
});

test('safe-json: wrong shape counts as damaged', () => {
  const f = tmpFile();
  writeJson(f, ['ok']);
  writeJson(f, { not: 'a list' });
  assert.deepEqual(quiet(() => readJson(f, [], { valid: Array.isArray })), ['ok']);
});
