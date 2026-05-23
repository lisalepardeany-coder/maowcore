const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('import')
    .setDescription('Restore a backup bundle (overwrites current data — admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addAttachmentOption((opt) => opt.setName('bundle').setDescription('Backup .json from /backup').setRequired(true)),
  async execute(interaction) {
    const att = interaction.options.getAttachment('bundle');
    if (!att || !att.name.endsWith('.json')) {
      return interaction.reply({ content: '◌ Provide the .json backup file.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const res = await fetch(att.url);
      const text = await res.text();
      const bundle = JSON.parse(text);
      if (bundle.version !== 1 || !bundle.files) throw new Error('Unrecognized bundle format.');
      fs.mkdirSync(DATA_DIR, { recursive: true });
      let count = 0;
      for (const [name, b64] of Object.entries(bundle.files)) {
        const safe = path.basename(name); // prevent path traversal
        fs.writeFileSync(path.join(DATA_DIR, safe), Buffer.from(b64, 'base64'));
        count++;
      }
      return interaction.editReply(`✦  Restored **${count}** file(s). Restart the bot for all changes to take effect.`);
    } catch (e) {
      return interaction.editReply(`▲ Restore failed: ${e.message}`);
    }
  },
};
