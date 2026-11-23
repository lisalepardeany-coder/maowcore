// Batch 1: crossfade ramps, quiet hours windows, next-song prefetch guards.
const test = require('node:test');
const assert = require('node:assert/strict');

test('fader: smooth ramp from start to end', () => {
  const { rampVolume } = require('../lib/fader');
  assert.equal(rampVolume(5, 100, 0, 3000), 5);
  assert.equal(rampVolume(5, 100, 3000, 3000), 100);
  assert.equal(rampVolume(5, 100, 9999, 3000), 100);
  const mid = rampVolume(0, 100, 1500, 3000);
  assert.equal(mid, 50);
  assert.ok(rampVolume(0, 100, 300, 3000) < 10, 'starts gently');
  assert.equal(rampVolume(100, 5, 3000, 3000), 5, 'works downwards too');
});

test('fader: remembers the real volume between songs', () => {
  const fader = require('../lib/fader');
  const q = { id: 'g-fade', volume: 80, currentTime: 0, repeatMode: 0, setVolume(v) { this.volume = v; } };
  fader.onSongStart(q, { duration: 200 }, 80);
  q.volume = 4;   // as if the last song faded out
  assert.equal(fader.targetFor(q), 80);
  fader.clear('g-fade');
});

test('quiet hours: windows, including across midnight', () => {
  const { inWindow } = require('../lib/owner-prefs');
  const at = (h, m) => new Date(2026, 10, 10, h, m);
  assert.equal(inWindow('23:00', '08:00', at(23, 30)), true);
  assert.equal(inWindow('23:00', '08:00', at(3, 0)), true);
  assert.equal(inWindow('23:00', '08:00', at(8, 0)), false);
  assert.equal(inWindow('23:00', '08:00', at(12, 0)), false);
  assert.equal(inWindow('13:00', '15:00', at(14, 59)), true);
  assert.equal(inWindow('13:00', '15:00', at(15, 0)), false);
  assert.equal(inWindow('bad', '15:00', at(14, 0)), false);
  assert.equal(inWindow('10:00', '10:00', at(10, 0)), false);
});

test('quiet hours: settings validate and save', () => {
  const op = require('../lib/owner-prefs');
  op._reset();
  assert.equal(op.get().quiet.enabled, false);
  const p = op.update({ quiet: { enabled: true, start: '22:30', end: '07:15', gentle: false } });
  assert.equal(p.quiet.enabled, true);
  assert.equal(p.quiet.start, '22:30');
  assert.equal(p.quiet.gentle, false);
  assert.throws(() => op.update({ quiet: { start: '25:00' } }), /23:00/);
  op._reset();
});

test('prefetch: only YouTube links, never twice', () => {
  const ys = require('../lib/yt-stream');
  assert.equal(ys.prefetch('https://example.com/a.mp3'), false);
  assert.equal(ys.prefetch('file:///C:/x'), false);
  assert.equal(ys.prefetchedCount(), 0);
});

test('panel ranks for batch 1 routes', () => {
  const x = require('../lib/panel-extras');
  assert.equal(x.requiredRank('GET', '/api/owner-prefs'), 'member');
  assert.equal(x.requiredRank('POST', '/api/owner-prefs'), 'owner');
  assert.equal(x.requiredRank('POST', '/api/status-channel'), 'admin');
});
