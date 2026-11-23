// Auto-deploy slash commands to every guild the bot is in.
//
// Why this exists: Discord's global commands take up to 1 hour to propagate
// to newly-joined servers, and `deploy-commands.js` with GUILD_ID set wipes
// globals + targets one guild only. Guild-scoped commands appear INSTANTLY,
// so we just push to every guild on ready + on join.
//
// A SHA-256 hash of the commands payload is cached per-guild on disk so we
// skip the API call when the command set is unchanged across bot restarts.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Routes } = require('discord.js');

const HASH_PATH = path.join(__dirname, '..', 'data', 'command-deploy.json');

let cachedHashes = null;
const loadHashes = () => {
  if (cachedHashes !== null) return cachedHashes;
  try {
    const parsed = JSON.parse(fs.readFileSync(HASH_PATH, 'utf8'));
    cachedHashes = (parsed && typeof parsed === 'object' && parsed.guilds) ? parsed.guilds : {};
  } catch {
    cachedHashes = {};
  }
  return cachedHashes;
};
const saveHashes = () => {
  try {
    fs.mkdirSync(path.dirname(HASH_PATH), { recursive: true });
    const tmp = `${HASH_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ guilds: cachedHashes || {} }));
    fs.renameSync(tmp, HASH_PATH);
  } catch (e) {
    console.warn('[command-deploy] save failed:', e.message);
  }
};

// Stable hash of the commands array — only re-deploy when the JSON shape
// actually changes. SHA-256 truncated to 16 hex chars is plenty for cache
// keys (no collision risk at this scale).
const commandsHash = (commands) =>
  crypto.createHash('sha256').update(JSON.stringify(commands)).digest('hex').slice(0, 16);

const validCommands = (client) =>
  [...client.commands.values()].filter((c) => c.data && typeof c.execute === 'function');

// Commands that export `everywhere: true` are registered once globally so
// they also work in DMs, group chats and through a user install. The rest
// stay per-guild (instant updates). `includeEverywhere` puts the portable
// ones back into the per-guild set, used when the global deploy failed.
const buildCommandsArray = (client, { includeEverywhere = false } = {}) =>
  validCommands(client)
    .filter((c) => includeEverywhere || c.everywhere !== true)
    .map((c) => c.data.toJSON());

// Install types: 0 = added to a server, 1 = added to a user's account.
// Contexts: 0 = server, 1 = DM with the bot, 2 = group DM / other DMs.
const buildGlobalArray = (client, { userInstall = true } = {}) =>
  validCommands(client)
    .filter((c) => c.everywhere === true)
    .map((c) => ({
      ...c.data.toJSON(),
      integration_types: userInstall ? [0, 1] : [0],
      contexts: userInstall ? [0, 1, 2] : [0, 1],
    }));

const GLOBAL_KEY = '@global';

// Set when the global deploy failed completely: per-guild deploys then carry
// the portable commands too, so they never vanish from servers.
let portableFallback = false;

// Deploy the portable commands globally. Tries with user install first; if
// Discord rejects that (User Install not enabled for the app), retries as
// server-install only so the commands still exist. Returns
//   { ok, deployed, count, userInstall, error?, userInstallError? }
const deployGlobal = async (client, { force = false } = {}) => {
  const hashes = loadHashes();
  let userInstallError = null;
  for (const userInstall of [true, false]) {
    const commands = buildGlobalArray(client, { userInstall });
    const hash = commandsHash(commands);
    if (!force && hashes[GLOBAL_KEY] === hash && userInstall) {
      return { ok: true, deployed: false, count: commands.length, userInstall };
    }
    try {
      await client.rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      hashes[GLOBAL_KEY] = hash;
      saveHashes();
      portableFallback = false;
      return { ok: true, deployed: true, count: commands.length, userInstall, userInstallError };
    } catch (e) {
      if (userInstall) { userInstallError = e.message || String(e); continue; }
      portableFallback = true;
      return { ok: false, error: e.message || String(e), userInstallError };
    }
  }
  return { ok: false, error: 'unreachable' };
};

// Deploy commands to a single guild. Returns:
//   { ok: true, deployed: true,  count }  — actually pushed
//   { ok: true, deployed: false, count }  — skipped, already in sync
//   { ok: false, error }                  — API call failed
const deployToGuild = async (client, guildId, { force = false, includeEverywhere = portableFallback } = {}) => {
  const commands = buildCommandsArray(client, { includeEverywhere });
  const hash = commandsHash(commands);
  const hashes = loadHashes();
  if (!force && hashes[guildId] === hash) {
    return { ok: true, deployed: false, count: commands.length };
  }
  try {
    await client.rest.put(
      Routes.applicationGuildCommands(client.user.id, guildId),
      { body: commands },
    );
    hashes[guildId] = hash;
    saveHashes();
    return { ok: true, deployed: true, count: commands.length };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
};

// Deploy to every guild the bot is currently in. Runs serially so we don't
// hammer Discord's REST rate limits on bots with many guilds.
const deployToAll = async (client, opts = {}) => {
  const results = [];
  for (const [guildId, guild] of client.guilds.cache) {
    const r = await deployToGuild(client, guildId, opts);
    results.push({ guildId, guildName: guild?.name || 'Unknown', ...r });
  }
  return results;
};

// Drop our cache for a guild (e.g. when the bot leaves it). Keeps the file
// from bloating with stale hashes for servers we're no longer in.
const forgetGuild = (guildId) => {
  const hashes = loadHashes();
  if (hashes[guildId]) {
    delete hashes[guildId];
    saveHashes();
  }
};

// Test seam — lets tests reset the cache without touching disk.
const _resetCache = () => { cachedHashes = null; portableFallback = false; };

module.exports = {
  deployToGuild,
  deployToAll,
  deployGlobal,
  forgetGuild,
  buildCommandsArray,
  buildGlobalArray,
  commandsHash,
  _resetCache,
};
