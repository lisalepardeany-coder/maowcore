'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseDuration, formatDuration } = require('../lib/mod-actions');

const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H, W = 7 * D;

test('parseDuration: single + compound units', () => {
  assert.equal(parseDuration('7d'), 7 * D);
  assert.equal(parseDuration('2h30m'), 2 * H + 30 * M);
  assert.equal(parseDuration('1w'), W);
  assert.equal(parseDuration('90m'), 90 * M);
  assert.equal(parseDuration('45s'), 45 * S);
  assert.equal(parseDuration('1d 12h'), D + 12 * H);
  assert.equal(parseDuration('abc'), null);
  assert.equal(parseDuration(''), null);
  assert.equal(parseDuration(null), null);
});

test('formatDuration: human readable, week-aware', () => {
  assert.equal(formatDuration(3 * D), '3d');
  assert.equal(formatDuration(90 * M), '1h 30m');
  assert.equal(formatDuration(2 * D + 3 * H), '2d 3h');
  assert.equal(formatDuration(W), '1w');
  assert.equal(formatDuration(8 * D), '1w 1d');
  assert.equal(formatDuration(30 * S), '<1m');
});
