// Tests for the v3.2.4 voice-follow opt-in module (lib/voice-follow.js).
//
// Uses a temp guild config so the operator's real data is never touched.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Point config at a temp location BEFORE requiring it so its initial load
// doesn't pick up the operator's real config.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-vf-'));
process.env.CONFIG_PATH = path.join(tmpDir, 'config.json');

const voiceFollow = require('../lib/voice-follow');

const G = '123456789012345678';
const U1 = '111111111111111111';
const U2 = '222222222222222222';

test('voice-follow: default state is off for everyone', () => {
  assert.equal(voiceFollow.isEnabled(G, U1), false);
  assert.equal(voiceFollow.isEnabled(G, U2), false);
  assert.deepEqual(voiceFollow.list(G), []);
});

test('voice-follow: setEnabled(true) adds the user', () => {
  voiceFollow.setEnabled(G, U1, true);
  assert.equal(voiceFollow.isEnabled(G, U1), true);
  assert.equal(voiceFollow.isEnabled(G, U2), false);
  assert.deepEqual(voiceFollow.list(G), [U1]);
});

test('voice-follow: setEnabled(false) removes the user', () => {
  voiceFollow.setEnabled(G, U1, true);
  voiceFollow.setEnabled(G, U1, false);
  assert.equal(voiceFollow.isEnabled(G, U1), false);
});

test('voice-follow: toggle flips the state', () => {
  voiceFollow.setEnabled(G, U2, false);
  assert.equal(voiceFollow.toggle(G, U2), true);
  assert.equal(voiceFollow.isEnabled(G, U2), true);
  assert.equal(voiceFollow.toggle(G, U2), false);
  assert.equal(voiceFollow.isEnabled(G, U2), false);
});

test('voice-follow: multiple users coexist in the same guild', () => {
  voiceFollow.setEnabled(G, U1, true);
  voiceFollow.setEnabled(G, U2, true);
  assert.equal(voiceFollow.isEnabled(G, U1), true);
  assert.equal(voiceFollow.isEnabled(G, U2), true);
  assert.equal(voiceFollow.list(G).length, 2);
});

test('voice-follow: empty/null IDs are safe', () => {
  assert.equal(voiceFollow.isEnabled(null, U1), false);
  assert.equal(voiceFollow.isEnabled(G, null), false);
  assert.equal(voiceFollow.isEnabled(undefined, undefined), false);
  // setEnabled with missing args should silently no-op rather than crash.
  voiceFollow.setEnabled(null, U1, true);
  voiceFollow.setEnabled(G, null, true);
});

test('cleanup', () => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
});
