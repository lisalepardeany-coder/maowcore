const { MessageFlags } = require('discord.js');

// Interaction contexts (Discord API): 0 = server, 1 = DM with the bot,
// 2 = group DM or DM between users (user-installed app).
const CONTEXT = { GUILD: 0, BOT_DM: 1, PRIVATE: 2 };

// True when the bot itself is in the server the command was used in, so it
// can read members, voice states and post in channels.
const botInServer = (interaction) =>
  Boolean(interaction.guildId && interaction.client.guilds.cache.has(interaction.guildId));

// Find the music queue that belongs to this command. Inside a server the bot
// is in, that's the server's queue. Anywhere else (DMs, group DMs, servers
// the bot isn't in) it's the queue in whichever voice channel the user is
// currently sitting in, if any.
const findUserQueue = (interaction) => {
  const distube = interaction.client.distube;
  if (!distube) return null;
  if (botInServer(interaction)) {
    try { return distube.getQueue(interaction.guildId) || null; } catch { return null; }
  }
  const userId = interaction.user?.id;
  const queues = distube.queues?.collection;
  if (!userId || !queues) return null;
  for (const queue of queues.values()) {
    if (queue.voiceChannel?.members?.has?.(userId)) return queue;
  }
  return null;
};

const requireQueue = async (interaction, message = '◌ No active transmission.') => {
  const queue = findUserQueue(interaction);
  if (!queue) {
    const hint = botInServer(interaction) ? '' : ' (join a voice channel where MaowCore is playing)';
    await interaction.reply({ content: message + hint, flags: MessageFlags.Ephemeral });
    return null;
  }
  return queue;
};

module.exports = { requireQueue, findUserQueue, botInServer, CONTEXT };
