const { SlashCommandBuilder, MessageFlags, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Pack a directory into a JSON "bundle" (no native zip dep). Files are
// base64-encoded so the bundle is portable and human-readable.
const packDir = (dir) => {
  const bundle = { version: 1, createdAt: Date.now(), files: {} };
  if (!fs.existsSync(dir)) return bundle;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isFile()) bundle.files[entry] = fs.readFileSync(full).toString('base64');
  }
  return bundle;
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Export all config, history, ratings, sessions, playlists as a JSON bundle')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const bundle = packDir(DATA_DIR);
    const buf = Buffer.from(JSON.stringify(bundle, null, 2));
    const file = new AttachmentBuilder(buf, { name: `maowcore-backup-${new Date().toISOString().slice(0, 10)}.json` });
    return interaction.reply({
      content: `✦  Backup created — ${Object.keys(bundle.files).length} file(s), ${(buf.length / 1024).toFixed(1)} KB.`,
      files: [file],
      flags: MessageFlags.Ephemeral,
    });
  },
};
