'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const community = require('../lib/community');

test('community.parseDate: numeric + named formats', () => {
  assert.deepEqual(community.parseDate('25/12'), { d: 25, m: 12 });
  assert.deepEqual(community.parseDate('25-12'), { d: 25, m: 12 });
  assert.deepEqual(community.parseDate('25.12'), { d: 25, m: 12 });
  assert.deepEqual(community.parseDate('25 dec'), { d: 25, m: 12 });
  assert.deepEqual(community.parseDate('december 25'), { d: 25, m: 12 });
  assert.deepEqual(community.parseDate('1 jan'), { d: 1, m: 1 });
});

test('community.parseDate: rejects bad input', () => {
  assert.equal(community.parseDate('40/12'), null); // day out of range
  assert.equal(community.parseDate('25/13'), null); // month out of range
  assert.equal(community.parseDate('hello'), null);
  assert.equal(community.parseDate('25 frobuary'), null);
  assert.equal(community.parseDate(''), null);
  assert.equal(community.parseDate(null), null);
});

test('community.fmtDate', () => {
  assert.equal(community.fmtDate({ d: 25, m: 12 }), '25 December');
  assert.equal(community.fmtDate({ d: 1, m: 1 }), '1 January');
  assert.equal(community.fmtDate(null), '—');
});
