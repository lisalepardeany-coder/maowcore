// /backup — owner only. A backup of the bot's data as a file (lib/offsite-backup.js).
//
// It used to be open to anyone with Manage Server on ANY server the bot is in,
// and handed out the whole data folder: every server's data plus the owner's
// YouTube cookies. Now only OWNER_USER_ID can use it, and backups never contain
// cookies, sign-in sessions or API keys.
const { SlashCommandBuilder, MessageFlags, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Bot owner: download a backup of the bot\'s data (or have it DM\'d)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((o) => o.setName('dm').setDescription('Send it to your DMs instead (default: here, only you see it)')),
  async execute(interaction) {
    if (!require('../lib/owners').isOwner(interaction.user.id)) {
      return interaction.reply({
        content: '◌ Only the bot owner can make backups: they contain every server\'s data.',
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const offsite = require('../lib/offsite-backup');
    try {
      if (interaction.options.getBoolean('dm')) {
        const r = await offsite.sendNow(interaction.client, interaction.user.id);
        return interaction.editReply(r.ok ? `🗄 Sent to your DMs (${(r.bytes / 1024).toFixed(0)} KB).` : `✕ ${r.error}`);
      }
      const { buffer, count } = await offsite.pack();
      if (buffer.length > 9.5 * 1024 * 1024) return interaction.editReply(`✕ The backup is ${(buffer.length / 1048576).toFixed(1)} MB, over Discord's 10 MB limit. Use the panel's Backups page.`);
      return interaction.editReply({
        content: `🗄 Backup: ${count} files, ${(buffer.length / 1024).toFixed(0)} KB. No songs, cookies or logins. `
          + 'Restore: stop the bot, then `node scripts/restore-backup.js <file>`.',
        files: [new AttachmentBuilder(buffer, { name: offsite.fileName() })],
      });
    } catch (e) {
      return interaction.editReply(`✕ Backup failed: ${e.message}`);
    }
  },
};
