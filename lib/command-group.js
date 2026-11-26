// One slash command made from several existing command files.
//
// Discord allows 100 slash commands per server, so related commands are
// merged: /sound eq …, /mod kick …, /playlist save … The old files live in
// command-parts/ (not loaded as commands of their own) and run unchanged:
//
//   • a part without subcommands  → a subcommand     /mod kick user:… reason:…
//   • a part with subcommands     → a subcommand group /sound eq preset name:…
//
// discord.js already hands a part only its own options (getString, getUser …
// read the deepest subcommand), and getSubcommand() returns the part's own
// subcommand inside a group, so the parts need no changes.
//
// Each part's default permission (e.g. Ban Members for ban) is checked when it
// runs, because Discord can only gate the whole merged command.
const { MessageFlags, PermissionsBitField } = require('discord.js');

const SUB = 1;
const GROUP = 2;

const isSub = (o) => o.type === SUB || o.type === GROUP;

// parts: [{ name, module, description?, flat? }]
//   flat: true puts a part's own subcommands straight under the merged command
//   (/mod tempban …) instead of in a group; its name is then only internal.
function group({ name, description, parts, defaultPermission = null, everywhere }) {
  const byName = new Map();
  for (const p of parts) {
    if (!p.flat) { byName.set(p.name, p); continue; }
    for (const s of p.module.data.toJSON().options || []) byName.set(s.name, p);
  }

  const toJSON = () => {
    const options = parts.flatMap((p) => {
      const j = p.module.data.toJSON();
      const opts = j.options || [];
      if (p.flat) return opts;
      const desc = (p.description || j.description || p.name).slice(0, 100);
      return opts.some(isSub)
        ? { type: GROUP, name: p.name, description: desc, options: opts }
        : { type: SUB, name: p.name, description: desc, options: opts };
    });
    const json = { name, description, options };
    if (defaultPermission != null) json.default_member_permissions = String(defaultPermission);
    return json;
  };

  // The part for this interaction (group name for grouped parts, else the subcommand).
  const pick = (interaction) => {
    const g = interaction.options.getSubcommandGroup(false);
    return byName.get(g || interaction.options.getSubcommand(false));
  };

  // A part's own default permission, as a bitfield (or null for "anyone").
  const neededPerm = (part) => {
    const raw = part.module.data.toJSON().default_member_permissions;
    return raw == null ? null : BigInt(raw);
  };

  return {
    data: { name, toJSON },
    ...(everywhere !== undefined ? { everywhere } : {}),
    parts: byName,
    async execute(interaction) {
      const part = pick(interaction);
      if (!part) return interaction.reply({ content: '◌ Unknown option.', flags: MessageFlags.Ephemeral });
      const need = neededPerm(part);
      if (need && interaction.inGuild() && !interaction.memberPermissions?.has(need)) {
        const names = new PermissionsBitField(need).toArray().map((p) => p.replace(/([a-z])([A-Z])/g, '$1 $2'));
        return interaction.reply({ content: `◌ You need **${names.join(', ')}** for /${name} ${part.name}.`, flags: MessageFlags.Ephemeral });
      }
      return part.module.execute(interaction);
    },
    async autocomplete(interaction) {
      const part = pick(interaction);
      if (part?.module.autocomplete) return part.module.autocomplete(interaction);
      return interaction.respond([]).catch(() => {});
    },
  };
}

module.exports = { group };
