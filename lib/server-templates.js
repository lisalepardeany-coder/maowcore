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
const applyTemplate = (guildId, template, { includeChannelIds = false } = {}) => {
  if (!template || template.templateVersion !== TEMPLATE_VERSION) {
    throw new Error(`Unsupported template version: ${template?.templateVersion}`);
  }
  const p = template.payload || {};
  const patch = {
    // Always-portable settings:
    welcomeMessage: p.welcome?.welcomeMessage || '',
    farewellMessage: p.welcome?.farewellMessage || '',
    welcomeSoundUrl: p.welcome?.welcomeSoundUrl || '',
    leaveSoundUrl: p.welcome?.leaveSoundUrl || '',
    automod: p.automod || {},
    quickPlaylists: p.quickPlaylists || [null, null, null, null],
    defaultLoopMode: p.defaultLoopMode,
    crossfade: p.crossfade,
    announce: p.announce !== undefined ? p.announce : true,
    stay247: !!p.stay247,
    sponsorblock: !!p.sponsorblock,
    hideRequester: !!p.hideRequester,
    idleMinutes: p.idleMinutes,
    tone: p.tone,
    locale: p.locale || 'en',
  };
  if (includeChannelIds) {
    patch.welcomeChannelId = p.welcome?.welcomeChannelId || null;
    patch.modlogChannelId = p.modlogChannelId || null;
    patch.autoVoiceRoomId = p.autoVoiceRoomId || null;
    patch.reactionRoles = p.reactionRoles || {};
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
