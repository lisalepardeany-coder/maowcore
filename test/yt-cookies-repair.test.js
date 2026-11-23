const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const yc = require('../lib/yt-cookies');

const future = Math.floor(Date.now() / 1000) + 86400 * 30;
const good = [
  yc.HEADER,
  `.youtube.com\tTRUE\t/\tTRUE\t${future}\tPREF\tf6=40000000`,
  `#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t${future}\tLOGIN_INFO\tabc:def`,
].join('\n') + '\n';

// what yt-dlp requires: header first, every cookie line exactly 7 tab fields
const ytdlpAccepts = (text) => {
  const lines = text.split('\n');
  if (!/^#( Netscape)? HTTP Cookie File/.test(lines[0])) return false;
  return lines.slice(1).every((l) => {
    const b = l.startsWith('#HttpOnly_') ? l.slice(10) : l;
    return !b.trim() || b.startsWith('#') || b.split('\t').length === 7;
  });
};

test('cookies: a good file passes through unchanged', () => {
  assert.equal(yc.normalize(good), good);
  assert.ok(ytdlpAccepts(yc.normalize(good)));
});

test('cookies: repairs byte-order mark, CRLF, blank first line, missing header, spaces for tabs', () => {
  const damaged = [
    '﻿' + '\r\n' + good.replace(/\n/g, '\r\n'),             // BOM + blank line + CRLF
    good.split('\n').slice(1).join('\n'),                        // header missing
    good.replace(/\t/g, '    '),                                  // tabs became spaces (panel editor)
    '\n\n' + good.replace(/\t/g, ' '),                            // blank lines + single spaces
  ];
  for (const d of damaged) {
    const fixed = yc.normalize(d);
    assert.ok(ytdlpAccepts(fixed), `not accepted after repair:\n${JSON.stringify(fixed)}`);
    assert.equal(yc.parse(fixed).length, 2);
    assert.ok(yc.check(d).ok, 'check() accepts the damaged original');
  }
});

test('cookies: a broken saved file is repaired in place (original kept as .bak)', () => {
  fs.writeFileSync(yc.FILE, '﻿' + good.replace(/\t/g, '  ').replace(/\n/g, '\r\n'));
  assert.equal(yc.usableFile(), yc.FILE);
  const now = fs.readFileSync(yc.FILE, 'utf8');
  assert.ok(ytdlpAccepts(now));
  assert.ok(fs.existsSync(`${yc.FILE}.bak`));
  assert.ok(yc.ytdlpArgs().includes('--cookies'));
  fs.rmSync(`${yc.FILE}.bak`, { force: true });
  yc.remove();
});

test('cookies: an unusable file is left out instead of breaking yt-dlp', () => {
  fs.writeFileSync(yc.FILE, '[{"name":"json export"}]');
  assert.equal(yc.usableFile(), null);
  assert.ok(!yc.ytdlpArgs().includes('--cookies'));
  yc.remove();
});
