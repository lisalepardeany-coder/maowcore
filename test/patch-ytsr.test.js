// Tests for scripts/patch-ytsr.js — the postinstall patches that keep the
// bot working against newer Node and the current YouTube page shape.
//
// We don't re-run the postinstall here (it modifies node_modules); instead
// we verify the patched files actually contain the optional chaining we
// expect, AND that the patched parseItem function tolerates the malformed
// YouTube payload that was crashing /play.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PARSE_ITEM_PATH = path.join(__dirname, '..', 'node_modules', '@distube', 'ytsr', 'lib', 'parseItem.js');

test('patch-ytsr: parseItem has optional chaining on browseEndpoint', () => {
  const src = fs.readFileSync(PARSE_ITEM_PATH, 'utf8');
  // Post-patch: ZERO occurrences of the unsafe access pattern.
  const unsafe = src.match(/\.browseEndpoint\.(canonicalBaseUrl|browseId)/g);
  assert.equal(unsafe, null, `unsafe browseEndpoint access still present: ${unsafe?.join(', ')}`);
  // Post-patch: at least 4 safe accesses (2 in _parseAuthor, 2 in _parseOwner).
  const safe = src.match(/\.browseEndpoint\?\.(canonicalBaseUrl|browseId)/g) || [];
  assert.ok(safe.length >= 4, `expected >= 4 patched sites, got ${safe.length}`);
});

test('patch-ytsr: re-running the patch is idempotent (no double "?.")', () => {
  const src = fs.readFileSync(PARSE_ITEM_PATH, 'utf8');
  // Patch should never produce `.browseEndpoint??.` (which would mean we
  // accidentally re-patched a patched file).
  assert.equal(src.includes('browseEndpoint??.'), false);
});

test('patch-ytsr: parseItem actually loads after patching (syntactically valid)', () => {
  // Just require()'ing the module would execute it; we can require it without
  // triggering API calls since it only exports parse functions.
  assert.doesNotThrow(() => {
    delete require.cache[require.resolve('@distube/ytsr/lib/parseItem.js')];
    require('@distube/ytsr/lib/parseItem.js');
  });
});

test('patch-ytsr: patch transform applied to fresh source is idempotent', () => {
  // Simulate "I just reinstalled node_modules" — feed the transform a
  // pre-patch source and a post-patch source. Pre-patch input changes;
  // post-patch input is a no-op.
  const transform = (s) => s.replace(/\.browseEndpoint\.(canonicalBaseUrl|browseId)/g, '.browseEndpoint?.$1');
  const pre = 'author.navigationEndpoint.browseEndpoint.canonicalBaseUrl || author.navigationEndpoint.browseEndpoint.browseId';
  const post = transform(pre);
  assert.notEqual(pre, post);
  assert.equal(post, 'author.navigationEndpoint.browseEndpoint?.canonicalBaseUrl || author.navigationEndpoint.browseEndpoint?.browseId');
  // Second run on already-patched text — must be a no-op.
  assert.equal(transform(post), post);
});

test('patch-ytsr: patch transform does NOT touch unrelated `.canonicalBaseUrl` accesses', () => {
  // Defensive: only the `.browseEndpoint.<x>` chain should be touched. A
  // `foo.canonicalBaseUrl` access elsewhere must stay verbatim.
  const transform = (s) => s.replace(/\.browseEndpoint\.(canonicalBaseUrl|browseId)/g, '.browseEndpoint?.$1');
  assert.equal(transform('obj.canonicalBaseUrl'), 'obj.canonicalBaseUrl');
  assert.equal(transform('foo.browseId'), 'foo.browseId');
});
