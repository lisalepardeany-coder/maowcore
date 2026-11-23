const { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fun = require('../lib/fun');

const bar = (n) => `${'▰'.repeat(Math.round(n / 10))}${'▱'.repeat(10 - Math.round(n / 10))} ${n}`;
const card = (guildId, userId, pet, note) => {
  const sp = fun.SPECIES[pet.species] || fun.SPECIES.cat;
  const mood = fun.moodOf(pet);
  const bits = fun.profileBits(guildId, userId);
  return new EmbedBuilder()
    .setColor([0xed4245, 0xfee75c, 0x5865f2, 0x57f287][mood])
    .setTitle(`${sp.faces[mood]} ${bits.wear || ''} ${pet.name}`.replace(/\s+/g, ' ').trim())
    .setDescription(`${bits.title ? `*${bits.title}*\n` : ''}Level **${pet.level}** ${sp.name} · ${pet.name} ${fun.MOOD_TEXT[mood]}.${note ? `\n\n${note}` : ''}`)
    .addFields(
      { name: '🍖 Hunger', value: bar(pet.hunger), inline: true },
      { name: '💖 Happy', value: bar(pet.happy), inline: true },
      { name: '⚡ Energy', value: bar(pet.energy), inline: true },
    )
    .setFooter({ text: `Adopted ${new Date(pet.born).toLocaleDateString()} · ${pet.care} care points` });
};
const buttons = (disabled = false) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('pet:feed').setLabel('Feed').setEmoji('🍖').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  new ButtonBuilder().setCustomId('pet:play').setLabel('Play').setEmoji('🎾').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  new ButtonBuilder().setCustomId('pet:sleep').setLabel('Nap').setEmoji('💤').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Your own little creature to look after')
    .addSubcommand((s) => s.setName('adopt').setDescription('Adopt a pet')
      .addStringOption((o) => o.setName('species').setDescription('What kind').setRequired(true)
        .addChoices(...Object.entries(fun.SPECIES).map(([value, x]) => ({ name: `${x.emoji} ${x.name}`, value }))))
      .addStringOption((o) => o.setName('name').setDescription('Its name').setRequired(true).setMaxLength(24)))
    .addSubcommand((s) => s.setName('show').setDescription('See your pet (with care buttons)')
      .addUserOption((o) => o.setName('user').setDescription('Look at someone else\'s pet')))
    .addSubcommand((s) => s.setName('rename').setDescription('Give your pet a new name')
      .addStringOption((o) => o.setName('name').setDescription('New name').setRequired(true).setMaxLength(24)))
    .addSubcommand((s) => s.setName('release').setDescription('Let your pet go (it will be fine!)')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId; const uid = interaction.user.id;
    if (sub === 'adopt') {
      if (fun.getPet(gid, uid)) return interaction.reply({ content: '◌ You already have a pet. Use `/pet show`.', flags: MessageFlags.Ephemeral });
      const pet = fun.newPet(interaction.options.getString('name'), interaction.options.getString('species'));
      fun.setPet(gid, uid, pet);
      return interaction.reply({ embeds: [card(gid, uid, pet, `🎉 Welcome home, **${pet.name}**!`)], components: [buttons()] });
    }
    if (sub === 'rename') {
      const pet = fun.getPet(gid, uid);
      if (!pet) return interaction.reply({ content: '◌ Adopt a pet first: `/pet adopt`.', flags: MessageFlags.Ephemeral });
      pet.name = interaction.options.getString('name').slice(0, 24);
      fun.setPet(gid, uid, pet);
      return interaction.reply({ content: `✓ Your pet is now called **${pet.name}**.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'release') {
      const pet = fun.getPet(gid, uid);
      if (!pet) return interaction.reply({ content: '◌ You don\'t have a pet.', flags: MessageFlags.Ephemeral });
      fun.setPet(gid, uid, null);
      return interaction.reply({ content: `🌈 ${pet.name} waved goodbye and went off on an adventure.`, flags: MessageFlags.Ephemeral });
    }
    const who = interaction.options.getUser('user') || interaction.user;
    const pet = fun.getPet(gid, who.id);
    if (!pet) return interaction.reply({ content: who.id === uid ? '◌ You don\'t have a pet yet. Try `/pet adopt`!' : `◌ ${who.username} doesn't have a pet.`, flags: MessageFlags.Ephemeral });
    const own = who.id === uid;
    const msg = await interaction.reply({ embeds: [card(gid, who.id, pet)], components: own ? [buttons()] : [], withResponse: true }).then((r) => r.resource?.message);
    if (!own || !msg) return null;
    const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60000 });
    col.on('collect', async (i) => {
      if (i.user.id !== uid) return i.reply({ content: 'This is someone else\'s pet. Get your own with `/pet adopt`!', flags: MessageFlags.Ephemeral });
      const cur = fun.getPet(gid, uid);
      if (!cur) return i.update({ components: [] });
      const r = fun.act(cur, i.customId.split(':')[1]);
      fun.setPet(gid, uid, r.pet);
      if (r.ok && Math.random() < 0.35) fun.reward(gid, uid, 2, 'pet care');
      return i.update({ embeds: [card(gid, uid, r.pet, r.ok ? `✓ ${r.msg}` : `◌ ${r.msg}`)] });
    });
    col.on('end', () => msg.edit({ components: [buttons(true)] }).catch(() => {}));
    return null;
  },
};
