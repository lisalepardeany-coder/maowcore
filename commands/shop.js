const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const economy = require('../lib/economy');
const fun = require('../lib/fun');

const itemChoices = Object.entries(fun.ITEMS).map(([value, it]) => ({ name: `${it.name} — ${it.cost} coins`, value }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Coins, the shop and your items')
    .addSubcommand((s) => s.setName('balance').setDescription('Your coins and level')
      .addUserOption((o) => o.setName('user').setDescription('Someone else')))
    .addSubcommand((s) => s.setName('daily').setDescription('Claim your daily coins (streaks give more!)'))
    .addSubcommand((s) => s.setName('list').setDescription('What you can buy'))
    .addSubcommand((s) => s.setName('buy').setDescription('Buy an item')
      .addStringOption((o) => o.setName('item').setDescription('Item').setRequired(true).addChoices(...itemChoices))
      .addIntegerOption((o) => o.setName('amount').setDescription('How many (default 1)').setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s.setName('use').setDescription('Use an item (on your pet, or wear it)')
      .addStringOption((o) => o.setName('item').setDescription('Item').setRequired(true).addChoices(...itemChoices.filter((c) => !fun.ITEMS[c.value].title))))
    .addSubcommand((s) => s.setName('items').setDescription('Your inventory'))
    .addSubcommand((s) => s.setName('title').setDescription('Set your custom title (needs a 🏷 Custom title)')
      .addStringOption((o) => o.setName('text').setDescription('Your title').setRequired(true).setMaxLength(40)))
    .addSubcommand((s) => s.setName('top').setDescription('Richest & highest level members')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId; const uid = interaction.user.id;
    const eph = { flags: MessageFlags.Ephemeral };
    try {
      if (sub === 'balance') {
        const who = interaction.options.getUser('user') || interaction.user;
        const u = economy.getUser(gid, who.id);
        return interaction.reply({ content: `🪙 **${who.username}**: ${u.coins} coins · level ${u.level} (${u.xp}/${economy.xpForLevel(u.level)} XP)`, ...eph });
      }
      if (sub === 'daily') {
        const r = fun.claimDaily(gid, uid);
        if (!r.ok) return interaction.reply({ content: '◌ You already claimed today. Come back tomorrow!', ...eph });
        return interaction.reply(`🪙 ${interaction.user} claimed **${r.coins}** coins! 🔥 Streak: **${r.streak}** day${r.streak === 1 ? '' : 's'}.`);
      }
      if (sub === 'list') {
        const custom = economy.getShop(gid) || [];
        const embed = new EmbedBuilder().setColor(0xfee75c).setTitle('🛒 Shop')
          .setDescription(Object.values(fun.ITEMS).map((it) => `**${it.name}** — ${it.cost} 🪙\n${it.desc}`).join('\n\n'))
          .setFooter({ text: 'Buy with /shop buy · earn coins with /shop daily, /game and /trivia' });
        if (custom.length) embed.addFields({ name: 'Server items (ask a mod after buying)', value: custom.map((c) => `**${c.name}** — ${c.cost} 🪙${c.description ? ` · ${c.description}` : ''}`).join('\n').slice(0, 1024) });
        return interaction.reply({ embeds: [embed], ...eph });
      }
      if (sub === 'buy') {
        const id = interaction.options.getString('item'); const n = interaction.options.getInteger('amount') || 1;
        const it = fun.ITEMS[id];
        economy.spend(gid, uid, it.cost * n, `shop:${id}`);
        const total = fun.addItem(gid, uid, id, n);
        return interaction.reply({ content: `🛍 Bought ${n}× **${it.name}** for ${it.cost * n} coins. You have ${total}.${it.title ? ' Set it with `/shop title`.' : ' Use it with `/shop use`.'}`, ...eph });
      }
      if (sub === 'use') return interaction.reply({ content: `✓ ${fun.useItem(gid, uid, interaction.options.getString('item'))}`, ...eph });
      if (sub === 'title') {
        if (!fun.takeItem(gid, uid, 'title')) return interaction.reply({ content: '◌ You need a 🏷 Custom title first: `/shop buy item:title`.', ...eph });
        fun.setTitle(gid, uid, interaction.options.getString('text'));
        return interaction.reply({ content: '🏷 Title set! It shows on your pet card.', ...eph });
      }
      if (sub === 'items') {
        const inv = fun.inventory(gid, uid);
        const list = Object.entries(inv).map(([id, n]) => `${fun.ITEMS[id]?.name || id} × ${n}`);
        return interaction.reply({ content: list.length ? `🎒 ${list.join(' · ')}` : '🎒 Your bag is empty. Visit `/shop list`.', ...eph });
      }
      if (sub === 'top') {
        const lb = economy.leaderboard(gid, 10);
        return interaction.reply({ content: lb.length ? `🏆 **Top members**\n${lb.map((u, i) => `\`${i + 1}\` <@${u.userId}> — level ${u.level} · ${u.coins} 🪙`).join('\n')}` : '◌ Nobody has coins yet.', allowedMentions: { users: [] } });
      }
    } catch (e) {
      return interaction.reply({ content: `▲ ${String(e.message).replace(/^Insufficient coins/, 'Not enough coins')}`, ...eph });
    }
    return null;
  },
};
