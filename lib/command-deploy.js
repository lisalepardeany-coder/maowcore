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

const buildCommandsArray = (client) =>
  [...client.commands.values()]
    .filter((c) => c.data && typeof c.execute === 'function')
    .map((c) => c.data.toJSON());

// Deploy commands to a single guild. Returns:
//   { ok: true, deployed: true,  count }  — actually pushed
//   { ok: true, deployed: false, count }  — skipped, already in sync
//   { ok: false, error }                  — API call failed
const deployToGuild = async (client, guildId, { force = false } = {}) => {
  const commands = buildCommandsArray(client);
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
const _resetCache = () => { cachedHashes = null; };

module.exports = {
  deployToGuild,
  deployToAll,
  forgetGuild,
  buildCommandsArray,
  commandsHash,
  _resetCache,
};
