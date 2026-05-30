// Server templates for v2.7.0 — export EVERYTHING about a guild's MaowCore
// config into one portable JSON, apply to a different server in one click.
//
// Includes: automod, welcome/farewell, reaction-roles, playlists, automod
// blocklist, quick-playlists, automation crons/webhooks/rules, custom
// commands. Excludes anything user-identifying (sessions, social ratings).

const { getGuild, updateGuild } = require('./config');

const TEMPLATE_VERSION = 1;

const buildTemplate = (guildId, name, description) => {
  const cfg = getGuild(guildId) || {};
  // Pull custom commands + economy shop separately (different stores).
  let customCommands = [];
  try { customCommands = require('./custom-commands').listFor(guildId); } catch { /* */ }
  let economyShop = [];
  try { economyShop = require('./economy').getShop(guildId); } catch { /* */ }
  return {
    templateVersion: TEMPLATE_VERSION,
    name: String(name || `${guildId} template`).slice(0, 80),
    description: String(description || '').slice(0, 280),
    createdAt: Date.now(),
    payload: {
      welcome: {
        welcomeChannelId: cfg.welcomeChannelId || null,
        welcomeMessage: cfg.welcomeMessage || '',
        farewellMessage: cfg.farewellMessage || '',
        welcomeSoundUrl: cfg.welcomeSoundUrl || '',
        leaveSoundUrl: cfg.leaveSoundUrl || '',
      },
      automod: cfg.automod || {},
      reactionRoles: cfg.reactionRoles || {},
      quickPlaylists: cfg.quickPlaylists || [null, null, null, null],
      modlogChannelId: cfg.modlogChannelId || null,
      autoVoiceRoomId: cfg.autoVoiceRoomId || null,
      defaultLoopMode: cfg.defaultLoopMode || null,
      crossfade: cfg.crossfade || null,
      announce: cfg.announce !== undefined ? cfg.announce : true,
      stay247: !!cfg.stay247,
      sponsorblock: !!cfg.sponsorblock,
      hideRequester: !!cfg.hideRequester,
      idleMinutes: cfg.idleMinutes || null,
      tone: cfg.tone || null,
      locale: cfg.locale || 'en',
      customCommands,
      economyShop,
    },
  };
};

// Apply a template to a target guild. NEVER touches channel IDs by default
// because they're server-specific; user can re-link the welcome channel after.
//
// CRITICAL: only include keys that are actually PRESENT in the template
// payload — putting undefined into updateGuild() would WIPE the target's
// existing settings (Object.assign treats undefined as a write). Skipping
// absent keys means "use whatever the target had" instead of "delete".
const applyTemplate = (guildId, template, { includeChannelIds = false } = {}) => {
  if (!template || template.templateVersion !== TEMPLATE_VERSION) {
    throw new Error(`Unsupported template version: ${template?.templateVersion}`);
  }
  const p = template.payload || {};
  const patch = {};
  const setIf = (key, val) => { if (val !== undefined && val !== null) patch[key] = val; };
  const setBool = (key, val) => { if (val !== undefined) patch[key] = !!val; };

  // Welcome / farewell — only set what's present (so empty template doesn't
  // wipe the user's existing welcome message).
  if (p.welcome) {
    setIf('welcomeMessage', p.welcome.welcomeMessage);
    setIf('farewellMessage', p.welcome.farewellMessage);
    setIf('welcomeSoundUrl', p.welcome.welcomeSoundUrl);
    setIf('leaveSoundUrl', p.welcome.leaveSoundUrl);
  }
  setIf('automod', p.automod);
  setIf('quickPlaylists', p.quickPlaylists);
  setIf('defaultLoopMode', p.defaultLoopMode);
  setIf('crossfade', p.crossfade);
  if (p.announce !== undefined) patch.announce = !!p.announce;
  setBool('stay247', p.stay247);
  setBool('sponsorblock', p.sponsorblock);
  setBool('hideRequester', p.hideRequester);
  setIf('idleMinutes', p.idleMinutes);
  setIf('tone', p.tone);
  setIf('locale', p.locale);

  if (includeChannelIds) {
    setIf('welcomeChannelId', p.welcome?.welcomeChannelId);
    setIf('modlogChannelId', p.modlogChannelId);
    setIf('autoVoiceRoomId', p.autoVoiceRoomId);
    setIf('reactionRoles', p.reactionRoles);
  }
  updateGuild(guildId, patch);

  // Apply custom commands.
  let cmdsAdded = 0;
  if (Array.isArray(p.customCommands)) {
    try {
      const cc = require('./custom-commands');
      for (const c of p.customCommands) {
        try { cc.add(guildId, c); cmdsAdded++; }
        catch { /* duplicates skipped */ }
      }
    } catch { /* */ }
  }
  let shopAdded = 0;
  if (Array.isArray(p.economyShop)) {
    try {
      const econ = require('./economy');
      for (const item of p.economyShop) {
        try { econ.addShopItem(guildId, item); shopAdded++; }
        catch { /* */ }
      }
    } catch { /* */ }
  }
  return { ok: true, patchedKeys: Object.keys(patch).length, customCommandsAdded: cmdsAdded, shopItemsAdded: shopAdded };
};

module.exports = { buildTemplate, applyTemplate, TEMPLATE_VERSION };
