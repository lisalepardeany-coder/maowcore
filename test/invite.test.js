// Tests for the OAuth2 invite URL builder. Verifies the URL is shaped
// correctly so the bot owner can rely on the console banner / /invite /
// dashboard button all pointing at a working invite.

const test = require('node:test');
const assert = require('node:assert/strict');
const { inviteUrl, resolveClientId, computePermsBitfield } = require('../lib/invite');

test('inviteUrl returns null when no client ID is available', () => {
  assert.equal(inviteUrl(null), null);
  assert.equal(inviteUrl(undefined), null);
  assert.equal(inviteUrl(''), null);
});

test('inviteUrl produces a well-formed Discord OAuth2 URL', () => {
  const url = inviteUrl('123456789012345678');
  assert.ok(url.startsWith('https://discord.com/oauth2/authorize?'));
  const u = new URL(url);
  assert.equal(u.searchParams.get('client_id'), '123456789012345678');
  assert.equal(u.searchParams.get('scope'), 'bot applications.commands');
  // Permissions must be a positive decimal integer (BigInt-as-string).
  const perms = u.searchParams.get('permissions');
  assert.match(perms, /^\d+$/);
  assert.ok(BigInt(perms) > 0n);
});

test('computePermsBitfield returns a non-zero string that excludes Administrator', () => {
  // Administrator bit = 1n << 3n = 8n. We deliberately do NOT include it —
  // the bot asks for specific perms only.
  const bits = BigInt(computePermsBitfield());
  assert.ok(bits > 0n);
  const ADMIN = 1n << 3n;
  assert.equal(bits & ADMIN, 0n, 'Administrator must not be in the requested perms');
});

test('computePermsBitfield includes the perms music + moderation actually need', () => {
  const { PermissionFlagsBits } = require('discord.js');
  const bits = BigInt(computePermsBitfield());
  // A few critical bits — if any of these go missing the bot will fail
  // silently on respective actions.
  for (const [name, bit] of [
    ['Connect (voice join)', PermissionFlagsBits.Connect],
    ['Speak (voice transmit)', PermissionFlagsBits.Speak],
    ['SendMessages (replies)', PermissionFlagsBits.SendMessages],
    ['EmbedLinks (now-playing embeds)', PermissionFlagsBits.EmbedLinks],
    ['ManageChannels (/setup, /lock)', PermissionFlagsBits.ManageChannels],
    ['ManageRoles (/reactionrole)', PermissionFlagsBits.ManageRoles],
    ['ModerateMembers (/timeout)', PermissionFlagsBits.ModerateMembers],
    ['BanMembers (/ban)', PermissionFlagsBits.BanMembers],
    ['ManageMessages (/purge)', PermissionFlagsBits.ManageMessages],
  ]) {
    assert.equal(bits & BigInt(bit), BigInt(bit), `missing required perm: ${name}`);
  }
});

test('resolveClientId prefers the live Discord client over env var', () => {
  const liveClient = { user: { id: 'live-id-999' } };
  process.env.CLIENT_ID = 'env-id-111';
  try {
    assert.equal(resolveClientId(liveClient), 'live-id-999');
    // Falls back to env when no live client
    assert.equal(resolveClientId(null), 'env-id-111');
    assert.equal(resolveClientId({}), 'env-id-111');
    assert.equal(resolveClientId({ user: null }), 'env-id-111');
  } finally {
    delete process.env.CLIENT_ID;
  }
});

test('resolveClientId returns null when no source has an ID', () => {
  delete process.env.CLIENT_ID;
  assert.equal(resolveClientId(null), null);
  assert.equal(resolveClientId({}), null);
  assert.equal(resolveClientId({ user: {} }), null);
});

test('inviteUrl is stable — same input always produces same output', () => {
  const a = inviteUrl('999');
  const b = inviteUrl('999');
  assert.equal(a, b);
});
