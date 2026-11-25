// Listen room without Discord voice (lib/web-queue.js): a shared clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const wq = require('../lib/web-queue');

const song = (name, duration) => ({ name, url: `yt:${name}`, duration, byId: 'u1' });

test('songs play one after another on one shared clock', () => {
  wq.clear('g');
  const t = 1_000_000;
  wq.add('g', [song('a', 100), song('b', 50)], t);
  wq.touch('g', 'u1', t + 30_000);
  assert.deepEqual([wq.position('g', t + 30_000).song.name, wq.position('g', t + 30_000).at], ['a', 30]);
  wq.touch('g', 'u1', t + 110_000);
  const p = wq.position('g', t + 110_000);
  assert.deepEqual([p.song.name, p.at], ['b', 10], 'a ended at 100 s, b is 10 s in');
  wq.touch('g', 'u1', t + 151_000);
  assert.equal(wq.position('g', t + 151_000), null, 'queue ran out');
});

test('nobody on the page: the clock stops, and goes on when someone is back', () => {
  wq.clear('g');
  const t = 0;
  wq.add('g', [song('a', 600)], t);
  wq.touch('g', 'u1', t + 10_000);
  // Gone for an hour.
  const back = t + 3_600_000;
  wq.position('g', back);            // a peek without a visitor doesn't restart it
  wq.touch('g', 'u1', back);
  const p = wq.position('g', back);
  assert.equal(p.song.name, 'a', 'the song didn\'t run out while nobody listened');
  assert.equal(p.at, 10 + wq.IDLE_MS / 1000, 'resumes where it froze');
  assert.equal(p.paused, false);
});

test('pause and resume by a person', () => {
  wq.clear('g');
  wq.add('g', [song('a', 300)], 0);
  wq.touch('g', 'u1', 20_000);
  wq.setPaused('g', true, 20_000);
  wq.touch('g', 'u1', 50_000);       // visiting doesn't undo a real pause
  assert.deepEqual([wq.position('g', 50_000).at, wq.position('g', 50_000).paused], [20, true]);
  wq.setPaused('g', false, 50_000);
  wq.touch('g', 'u1', 55_000);
  assert.deepEqual([wq.position('g', 55_000).at, wq.position('g', 55_000).paused], [25, false]);
});

test('skip starts the next song from the beginning; live streams never end by themselves', () => {
  wq.clear('g');
  wq.add('g', [song('live', 0), song('b', 100)], 0);
  wq.touch('g', 'u1', 50_000);
  assert.equal(wq.position('g', 50_000).song.name, 'live');
  assert.equal(wq.skip('g', 50_000).name, 'b');
  wq.touch('g', 'u1', 53_000);
  assert.equal(wq.position('g', 53_000).at, 3);
  assert.equal(wq.skip('g', 53_000), null);
});

test('who counts as listening (for skip votes) and the size limit', () => {
  wq.clear('g');
  wq.add('g', [song('a', 100)], 0);
  wq.touch('g', 'u1', 1_000);
  wq.touch('g', 'u2', 10_000);
  assert.deepEqual(wq.listeners('g', 20_000), ['u2'], 'u1 left more than 15 s ago');
  wq.clear('g');
  assert.equal(wq.add('g', Array.from({ length: wq.MAX_SONGS + 5 }, (_, i) => song(`s${i}`, 10)), 0), wq.MAX_SONGS);
  assert.throws(() => wq.add('g', [song('x', 10)], 0), /full/);
});
