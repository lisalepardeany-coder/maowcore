const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const yc = require('../lib/yt-cookies');

const future = Math.floor(Date.now() / 1000) + 86400 * 30;
const sample = [
  '# Netscape HTTP Cookie File',
  `.youtube.com\tTRUE\t/\tTRUE\t${future}\tLOGIN_INFO\tabc:def`,
  `#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t${future}\t__Secure-3PSID\tsecret\tvalue`,
  `.google.com\tTRUE\t/\tFALSE\t${future}\tSID\tg1`,
  `.bank.example\tTRUE\t/\tTRUE\t${future}\tsession\tnope`,
  'garbage line',
].join('\n');

test('yt cookies: parses Netscape format, keeps only YouTube/Google', () => {
  const list = yc.parse(sample);
  assert.equal(list.length, 3);
  assert.ok(list.every((c) => /youtube|google/.test(c.domain)));
  const http = list.find((c) => c.name === '__Secure-3PSID');
  assert.equal(http.httpOnly, true);
  assert.equal(http.value, 'secret\tvalue', 'tabs inside values survive');
});

test('yt cookies: check catches wrong / expired / signed-out files', () => {
  assert.equal(yc.check(sample).ok, true);
  assert.equal(yc.check(sample).signedIn, true);
  assert.match(yc.check('# empty').error, /No YouTube cookies/);
  assert.match(yc.check(`.youtube.com\tTRUE\t/\tTRUE\t100\tPREF\tx`).error, /expired/);
  assert.equal(yc.check(`.youtube.com\tTRUE\t/\tTRUE\t${future}\tPREF\tx`).signedIn, false);
  assert.match(yc.check('x'.repeat(600 * 1024)).error, /too big/);
});

test('yt cookies: save strips other sites, info never returns values', () => {
  try {
    const info = yc.save(sample);
    assert.equal(info.present, true);
    assert.equal(info.count, 3);
    const stored = fs.readFileSync(yc.FILE, 'utf8');
    assert.ok(!stored.includes('bank.example'), 'other sites are not stored');
    assert.ok(!JSON.stringify(info).includes('secret'), 'no values in info');
    assert.equal(yc.forYtdl().length, 3);
    assert.throws(() => yc.save('nothing useful'), /No YouTube cookies/);
  } finally {
    yc.remove();
  }
  assert.equal(yc.info().present, false);
  assert.equal(yc.forYtdl(), undefined);
});

test('yt cookies: only the owner may touch them', () => {
  const x = require('../lib/panel-extras');
  assert.equal(x.requiredRank('GET', '/api/youtube-cookies'), 'owner');
  assert.equal(x.requiredRank('POST', '/api/youtube-cookies/save'), 'owner');
});
