'use strict';
// commands/eco.js — the whole economy in one command (Discord caps a guild at
// 100 slash commands, so the wallet/games/lottery/shop live under groups here).
//   /eco wallet  balance|daily|work|beg|pay|top
//   /eco play    scratch|coinflip|slots|dice|roulette|rob
//   /eco lottery buy|pot|draw
//   /eco shop    list|buy|add|remove

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const economy = require('../lib/economy');
const games = require('../lib/econ-games');
const scratch = require('../lib/scratch');
const { COLORS } = require('../lib/theme');

const COIN = '🪙';
const fmt = (n) => Number(n || 0).toLocaleString();
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[rnd(0, arr.length - 1)];
const SLOT = [{ e: '🍒', m: 6 }, { e: '🍋', m: 8 }, { e: '🔔', m: 10 }, { e: '⭐', m: 15 }, { e: '💎', m: 25 }, { e: '7️⃣', m: 50 }];
const LOTTO_PRICE = 500;
const eph = (content) => ({ content, flags: MessageFlags.Ephemeral });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('eco')
    .setDescription('Economy — wallet, games, lottery & shop')
    .addSubcommandGroup((g) => g.setName('wallet').setDescription('Coins & earning')
      .addSubcommand((s) => s.setName('balance').setDescription('Check a balance').addUserOption((o) => o.setName('user').setDescription('Whose balance')))
      .addSubcommand((s) => s.setName('daily').setDescription('Claim daily coins (streak bonus)'))
      .addSubcommand((s) => s.setName('work').setDescription('Work for coins (1h cooldown)'))
      .addSubcommand((s) => s.setName('beg').setDescription('Beg for coins (5m cooldown)'))
      .addSubcommand((s) => s.setName('pay').setDescription('Give coins to someone')
        .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
        .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
      .addSubcommand((s) => s.setName('top').setDescription('Richest members')))
    .addSubcommandGroup((g) => g.setName('play').setDescription('Games')
      .addSubcommand((s) => s.setName('scratch').setDescription('Scratch a card — match 3+ to win!')
        .addIntegerOption((o) => o.setName('bet').setDescription('10–100,000').setRequired(true).setMinValue(10).setMaxValue(100_000))
        .addStringOption((o) => o.setName('theme').setDescription('Card theme (random if omitted)').addChoices(...scratch.themeChoices)))
      .addSubcommand((s) => s.setName('coinflip').setDescription('Heads or tails, double or nothing')
        .addIntegerOption((o) => o.setName('bet').setDescription('Bet').setRequired(true).setMinValue(10).setMaxValue(1_000_000))
        .addStringOption((o) => o.setName('side').setDescription('Your call').setRequired(true).addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })))
      .addSubcommand((s) => s.setName('slots').setDescription('Spin the slots')
        .addIntegerOption((o) => o.setName('bet').setDescription('Bet').setRequired(true).setMinValue(10).setMaxValue(1_000_000)))
      .addSubcommand((s) => s.setName('dice').setDescription('Guess the die (1–6) for 6×')
        .addIntegerOption((o) => o.setName('bet').setDescription('Bet').setRequired(true).setMinValue(10).setMaxValue(1_000_000))
        .addIntegerOption((o) => o.setName('guess').setDescription('1–6').setRequired(true).setMinValue(1).setMaxValue(6)))
      .addSubcommand((s) => s.setName('roulette').setDescription('Bet red/black/green/even/odd or a number 0–36')
        .addIntegerOption((o) => o.setName('bet').setDescription('Bet').setRequired(true).setMinValue(10).setMaxValue(1_000_000))
        .addStringOption((o) => o.setName('on').setDescription('red/black/green/even/odd or 0–36').setRequired(true)))
      .addSubcommand((s) => s.setName('rob').setDescription('Rob a member — risky! (2h cooldown)')
        .addUserOption((o) => o.setName('user').setDescription('Who to rob').setRequired(true))))
    .addSubcommandGroup((g) => g.setName('lottery').setDescription(`Lottery — ${LOTTO_PRICE}/ticket`)
      .addSubcommand((s) => s.setName('buy').setDescription('Buy tickets').addIntegerOption((o) => o.setName('tickets').setDescription('How many').setRequired(true).setMinValue(1).setMaxValue(100)))
      .addSubcommand((s) => s.setName('pot').setDescription('See the pot & your odds'))
      .addSubcommand((s) => s.setName('draw').setDescription('(Admin) Draw a winner')))
    .addSubcommandGroup((g) => g.setName('shop').setDescription('Server shop')
      .addSubcommand((s) => s.setName('list').setDescription('Browse the shop'))
      .addSubcommand((s) => s.setName('buy').setDescription('Buy an item').addStringOption((o) => o.setName('item').setDescription('Name or ID').setRequired(true)))
      .addSubcommand((s) => s.setName('add').setDescription('(Admin) Add an item')
        .addStringOption((o) => o.setName('name').setDescription('Name').setRequired(true))
        .addIntegerOption((o) => o.setName('cost').setDescription('Price').setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName('description').setDescription('What it is')))
      .addSubcommand((s) => s.setName('remove').setDescription('(Admin) Remove an item').addStringOption((o) => o.setName('id').setDescription('Item ID').setRequired(true)))),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId, uid = interaction.user.id;
    const admin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

    // ── wallet ───────────────────────────────────────────────────────────────
    if (group === 'wallet') {
      if (sub === 'balance') {
        const user = interaction.options.getUser('user') || interaction.user;
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.COSMIC)
          .setAuthor({ name: `${user.username}'s wallet`, iconURL: user.displayAvatarURL() })
          .setDescription(`${COIN} **${fmt(economy.getUser(gid, user.id).coins)}** coins`)] });
      }
      if (sub === 'daily') {
        const r = games.claimDaily(gid, uid);
        return interaction.reply(r.ok ? `${COIN}  Claimed **${fmt(r.amount)}**! 🔥 Streak **${r.streak}**.` : eph(`⏳  Come back in **${games.fmtRemaining(r.remaining)}**.`));
      }
      if (sub === 'work') {
        const r = games.work(gid, uid);
        return interaction.reply(r.ok ? `💼  You ${r.job} and earned ${COIN} **${fmt(r.amount)}**.` : eph(`⏳  Rest up — **${games.fmtRemaining(r.remaining)}** left.`));
      }
      if (sub === 'beg') {
        const r = games.beg(gid, uid);
        if (!r.ok) return interaction.reply(eph(`⏳  Try again in **${games.fmtRemaining(r.remaining)}**.`));
        return interaction.reply(r.amount ? `🙏  ${r.who} gave you ${COIN} **${fmt(r.amount)}**.` : `🙏  You begged ${r.who}… nothing.`);
      }
      if (sub === 'pay') {
        const user = interaction.options.getUser('user'); const amount = interaction.options.getInteger('amount');
        if (user.bot || user.id === uid) return interaction.reply(eph('▲  Pick someone else.'));
        try { economy.spend(gid, uid, amount, 'pay'); economy.award(gid, user.id, amount, 'pay'); return interaction.reply(`${COIN}  Sent **${fmt(amount)}** to ${user}.`); }
        catch { return interaction.reply(eph(`▲  You don't have ${COIN} ${fmt(amount)}.`)); }
      }
      if (sub === 'top') {
        const list = economy.leaderboard(gid, 100).slice().sort((a, b) => (b.coins || 0) - (a.coins || 0)).slice(0, 15);
        if (!list.length) return interaction.reply(eph('No coins earned yet.'));
        const medal = (i) => ['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``;
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: `${COIN}  Richest — ${interaction.guild.name}` })
          .setDescription(list.map((e, i) => `${medal(i)} <@${e.userId}> — ${COIN} ${fmt(e.coins)}`).join('\n'))], allowedMentions: { parse: [] } });
      }
    }

    // ── play ─────────────────────────────────────────────────────────────────
    if (group === 'play') {
      if (sub === 'rob') {
        const target = interaction.options.getUser('user');
        if (target.bot) return interaction.reply(eph('🤖  Can\'t rob a bot.'));
        const r = games.rob(gid, uid, target.id);
        if (!r.ok) return interaction.reply(eph(r.reason === 'self' ? 'Can\'t rob yourself.' : r.reason === 'cooldown' ? `🚔  Lay low — **${games.fmtRemaining(r.remaining)}**.` : r.reason === 'poor' ? `${target.tag} is too broke.` : `You need ${COIN} 100 collateral.`));
        return interaction.reply(r.success ? `🦹  Robbed ${target} for ${COIN} **${fmt(r.amount)}**!` : `🚓  Caught! Fined ${COIN} **${fmt(r.fine)}**.`);
      }
      const bet = interaction.options.getInteger('bet');
      try { economy.spend(gid, uid, bet, 'game'); } catch { return interaction.reply(eph(`▲  You don't have ${COIN} ${fmt(bet)}.`)); }

      if (sub === 'scratch') {
        const themeId = interaction.options.getString('theme') || pick(scratch.THEMES).id;
        const r = scratch.play(themeId, bet);
        if (r.win > 0) economy.award(gid, uid, r.win, 'scratch-win');
        const grid = [0, 3, 6].map((i) => r.cells.slice(i, i + 3).join('　')).join('\n');
        const res = r.best ? `🎉  **${r.best.count}× ${r.best.symbol}** → ${r.best.payout}× = ${COIN} **${fmt(r.win)}** (${r.profit >= 0 ? '+' : ''}${fmt(r.profit)})` : `😢  No 3-match — lost ${COIN} **${fmt(bet)}**.`;
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(r.profit > 0 ? 0x57F287 : 0xED4245)
          .setAuthor({ name: `${r.theme.emoji} ${r.theme.name} — Scratch`, iconURL: interaction.user.displayAvatarURL() })
          .setDescription(`${grid}\n\n${res}`).setFooter({ text: `Bet ${bet} · Balance ${fmt(economy.getUser(gid, uid).coins)}` })] });
      }
      const done = (win, lines) => {
        if (win > 0) economy.award(gid, uid, win, 'game');
        const net = win - bet;
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(net >= 0 ? 0x57F287 : 0xED4245)
          .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
          .setDescription(`${lines}\n\n${net >= 0 ? `🎉  Won ${COIN} **${fmt(win)}** (+${fmt(net)})` : `💸  Lost ${COIN} **${fmt(bet)}**`}`)
          .setFooter({ text: `Balance ${fmt(economy.getUser(gid, uid).coins)}` })] });
      };
      if (sub === 'coinflip') { const flip = pick(['heads', 'tails']); const side = interaction.options.getString('side'); return done(flip === side ? bet * 2 : 0, `🪙  It's **${flip}** (you called ${side})`); }
      if (sub === 'slots') {
        const r = [pick(SLOT), pick(SLOT), pick(SLOT)];
        let win = 0;
        if (r[0].e === r[1].e && r[1].e === r[2].e) win = Math.round(bet * r[0].m);
        else if (r[0].e === r[1].e || r[1].e === r[2].e || r[0].e === r[2].e) win = Math.round(bet * 1.5);
        return done(win, `🎰  **[ ${r.map((x) => x.e).join(' ┃ ')} ]**`);
      }
      if (sub === 'dice') { const g = interaction.options.getInteger('guess'); const roll = rnd(1, 6); return done(roll === g ? bet * 6 : 0, `🎲  Rolled **${roll}** (guessed ${g})`); }
      if (sub === 'roulette') {
        const on = interaction.options.getString('on').trim().toLowerCase(); const num = rnd(0, 36);
        const color = num === 0 ? 'green' : (num % 2 === 0 ? 'black' : 'red'); let win = 0;
        if (/^\d+$/.test(on)) { if (Number(on) === num) win = bet * 36; }
        else if (on === 'green' && color === 'green') win = bet * 14;
        else if ((on === 'red' || on === 'black') && on === color) win = bet * 2;
        else if (on === 'even' && num !== 0 && num % 2 === 0) win = bet * 2;
        else if (on === 'odd' && num % 2 === 1) win = bet * 2;
        return done(win, `🎡  ${color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢'} **${num} ${color}** (bet ${on})`);
      }
    }

    // ── lottery ──────────────────────────────────────────────────────────────
    if (group === 'lottery') {
      if (sub === 'buy') {
        const count = interaction.options.getInteger('tickets');
        try { const r = games.buyTickets(gid, uid, count, LOTTO_PRICE); return interaction.reply(`🎟️  Bought **${count}** for ${COIN} **${fmt(r.cost)}**. You hold **${r.tickets}**. Pot ${COIN} **${fmt(r.pot)}**.`); }
        catch { return interaction.reply(eph(`▲  Can't afford ${COIN} ${fmt(count * LOTTO_PRICE)}.`)); }
      }
      if (sub === 'pot') {
        const l = games.lotteryInfo(gid); const total = Object.values(l.tickets || {}).reduce((a, b) => a + b, 0);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: '🎰  Lottery' })
          .setDescription(`**Pot:** ${COIN} ${fmt(l.pot)}\n**Tickets:** ${total}\n**Yours:** ${l.tickets?.[uid] || 0}\n**Odds:** ${total ? Math.round(((l.tickets?.[uid] || 0) / total) * 100) : 0}%`)] });
      }
      if (sub === 'draw') {
        if (!admin) return interaction.reply(eph('◌  Manage-Server only.'));
        const r = games.drawLottery(gid);
        return interaction.reply(r.ok ? `🎉  <@${r.winner}> wins the pot of ${COIN} **${fmt(r.pot)}** (${r.entries} tickets)! 🥳` : eph('No tickets sold.'));
      }
    }

    // ── shop ─────────────────────────────────────────────────────────────────
    if (group === 'shop') {
      if (sub === 'list') {
        const items = economy.getShop(gid);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: `🛒  ${interaction.guild.name} Shop` })
          .setDescription(items.length ? items.map((i) => `**${i.name}** — ${COIN} ${fmt(i.cost)}\n　${i.description || '*—*'} · \`${i.id}\``).join('\n\n') : '*Empty. Admins: `/eco shop add`.*')] });
      }
      if (sub === 'buy') {
        const q = interaction.options.getString('item').toLowerCase();
        const item = economy.getShop(gid).find((i) => i.id.toLowerCase() === q || i.name.toLowerCase() === q);
        if (!item) return interaction.reply(eph('▲  No such item — see `/eco shop list`.'));
        try { economy.spend(gid, uid, item.cost, `shop:${item.id}`); return interaction.reply(`🛍️  ${interaction.user} bought **${item.name}** for ${COIN} **${fmt(item.cost)}**!`); }
        catch { return interaction.reply(eph(`▲  Can't afford **${item.name}**.`)); }
      }
      if (!admin) return interaction.reply(eph('◌  Manage-Server only.'));
      if (sub === 'add') {
        const item = economy.addShopItem(gid, { name: interaction.options.getString('name'), cost: interaction.options.getInteger('cost'), description: interaction.options.getString('description') });
        return interaction.reply(eph(`✦  Added **${item.name}** (${COIN} ${fmt(item.cost)}) — \`${item.id}\`.`));
      }
      if (sub === 'remove') return interaction.reply(eph(economy.removeShopItem(gid, interaction.options.getString('id')) ? '✕  Removed.' : '▲  No item with that ID.'));
    }
  },
};
