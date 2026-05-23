const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const path = require('node:path');
const fs = require('node:fs');

module.exports = {
  data: new SlashCommandBuilder().setName('reload').setDescription('(Owner only) Hot-reload command files'),
  async execute(interaction) {
    const ownerId = interaction.client.application?.owner?.id;
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ content: '◌ Owner only.', flags: MessageFlags.Ephemeral });
    }
    const commandsPath = path.join(__dirname);
    let reloaded = 0, failed = 0;
    for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
      const fullPath = path.join(commandsPath, file);
      try {
        delete require.cache[require.resolve(fullPath)];
        const cmd = require(fullPath);
        if (cmd.data && cmd.execute) {
          interaction.client.commands.set(cmd.data.name, cmd);
          reloaded++;
        }
      } catch (e) {
        failed++;
        console.warn(`[reload] ${file}: ${e.message}`);
      }
    }
    return interaction.reply({
      content: `↻  Reloaded **${reloaded}** command${reloaded === 1 ? '' : 's'}${failed ? `, ${failed} failed (see console)` : ''}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
