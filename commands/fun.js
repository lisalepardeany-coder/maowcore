'use strict';
// commands/fun.js — AI-opponent games that pay out coins (so a quiet server is
// still fun), plus quick minigames.

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const economy = require('../lib/economy');
const ai = require('../lib/games-ai');
const mini = require('../lib/minigames');
const eg = require('../lib/econ-games');
const { COLORS } = require('../lib/theme');

const COIN = '🪙';
const fmt = (n) => Number(n || 0).toLocaleString();
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const bal = (gid, uid) => fmt(economy.getUser(gid, uid).coins);
const btn = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fun')
    .setDescription('Games vs AI (win coins!) & minigames')
    .addSubcommand((s) => s.setName('rps').setDescription('Rock-paper-scissors vs AI')
      .addIntegerOption((o) => o.setName('bet').setDescription('Coins to bet').setRequired(true).setMinValue(10).setMaxValue(1_000_000)))
    .addSubcommand((s) => s.setName('ttt').setDescription('Tic-tac-toe vs AI')
      .addIntegerOption((o) => o.setName('bet').setDescription('Coins to bet').setRequired(true).setMinValue(10).setMaxValue(1_000_000)))
    .addSubcommand((s) => s.setName('highlow').setDescription('Higher or lower? Beat the deck')
      .addIntegerOption((o) => o.setName('bet').setDescription('Coins to bet').setRequired(true).setMinValue(10).setMaxValue(1_000_000)))
    .addSubcommand((s) => s.setName('trivia').setDescription('Answer a trivia question for coins (free)'))
    .addSubcommand((s) => s.setName('8ball').setDescription('Ask the magic 8-ball')
      .addStringOption((o) => o.setName('question').setDescription('Your question').setRequired(true)))
    .addSubcommand((s) => s.setName('songguess').setDescription('Guess the song from emojis (free, win coins)'))
    .addSubcommand((s) => s.setName('daily').setDescription('Today\'s question + a daily engagement bonus')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId, uid = interaction.user.id;
    const onlyYou = (i) => i.user.id === uid;

    // ── 8-ball (free) ──────────────────────────────────────────────────────────
    if (sub === '8ball') {
      const A = ['It is certain.', 'Without a doubt.', 'Yes — definitely.', 'Most likely.', 'Signs point to yes.',
        'Reply hazy, try again.', 'Ask again later.', 'Cannot predict now.', 'Don\'t count on it.', 'My reply is no.',
        'Very doubtful.', 'Absolutely not.', 'Outlook good.', '100%. Errox approves. ⭐'];
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.COSMIC).setTitle('🎱 Magic 8-Ball')
        .setDescription(`**Q:** ${interaction.options.getString('question').slice(0, 200)}\n**A:** ${A[rnd(0, A.length - 1)]}`)] });
    }

    // ── trivia (free, win coins) ───────────────────────────────────────────────
    if (sub === 'trivia') {
      const t = ai.randomTrivia();
      const reward = rnd(150, 350);
      const row = new ActionRowBuilder().addComponents(t.a.map((_, idx) => btn(`tv_${idx}`, String.fromCharCode(65 + idx))));
      const embed = new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: '🧠 Trivia' })
        .setDescription(`**${t.q}**\n\n${t.a.map((opt, idx) => `**${String.fromCharCode(65 + idx)}.** ${opt}`).join('\n')}`)
        .setFooter({ text: `Answer in 20s · correct = ${reward} coins` });
      const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
      try {
        const i = await msg.awaitMessageComponent({ filter: onlyYou, componentType: ComponentType.Button, time: 20_000 });
        const pick = Number(i.customId.split('_')[1]);
        const correct = pick === t.i;
        if (correct) economy.award(gid, uid, reward, 'trivia');
        await i.update({ embeds: [embed.setColor(correct ? 0x57F287 : 0xED4245)
          .setDescription(`**${t.q}**\n\n${t.a.map((opt, idx) => `${idx === t.i ? '✅' : idx === pick ? '❌' : '▪️'} ${opt}`).join('\n')}\n\n${correct ? `🎉 Correct! +${COIN} **${fmt(reward)}**` : `Wrong — the answer was **${t.a[t.i]}**.`}`)
          .setFooter({ text: `Balance ${bal(gid, uid)}` })], components: [] });
      } catch { await interaction.editReply({ components: [], embeds: [embed.setFooter({ text: '⏱️ Too slow!' })] }).catch(() => {}); }
      return;
    }

    // ── songguess (free, win coins) ────────────────────────────────────────────
    if (sub === 'songguess') {
      const s = mini.randomSong();
      const reward = rnd(150, 350);
      const row = new ActionRowBuilder().addComponents(s.a.map((_, idx) => btn(`sg_${idx}`, String.fromCharCode(65 + idx))));
      const opts = (mark) => s.a.map((opt, idx) => `${mark ? (idx === s.i ? '✅' : '▪️') : '**' + String.fromCharCode(65 + idx) + '.**'} ${opt}`).join('\n');
      const embed = new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: '🎵 Guess the Song' })
        .setDescription(`# ${s.e}\n\n${opts(false)}`).setFooter({ text: `20s · correct = ${reward} coins` });
      const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
      try {
        const i = await msg.awaitMessageComponent({ filter: onlyYou, componentType: ComponentType.Button, time: 20_000 });
        const pick = Number(i.customId.split('_')[1]);
        const correct = pick === s.i;
        if (correct) economy.award(gid, uid, reward, 'songguess');
        await i.update({ embeds: [embed.setColor(correct ? 0x57F287 : 0xED4245)
          .setDescription(`# ${s.e}\n\n${s.a.map((opt, idx) => `${idx === s.i ? '✅' : idx === pick ? '❌' : '▪️'} ${opt}`).join('\n')}\n\n${correct ? `🎉 Correct! +${COIN} **${fmt(reward)}**` : `It was **${s.a[s.i]}**.`}`)
          .setFooter({ text: `Balance ${bal(gid, uid)}` })], components: [] });
      } catch { await interaction.editReply({ components: [], embeds: [embed.setFooter({ text: '⏱️ Too slow!' })] }).catch(() => {}); }
      return;
    }

    // ── daily question + engagement bonus ──────────────────────────────────────
    if (sub === 'daily') {
      const c = eg.cooldown(gid, uid, 'dailyq', 22 * 3600_000);
      let bonus;
      if (c.ok) { economy.award(gid, uid, 50, 'dailyq'); eg.setCooldown(gid, uid, 'dailyq'); bonus = `\n\n${COIN} **+50** daily engagement bonus!`; }
      else bonus = `\n\n*(bonus already claimed — back in ${eg.fmtRemaining(c.remaining)})*`;
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: '💬 Daily Question' }).setDescription(`**${mini.dailyQuestion()}**${bonus}`)] });
    }

    // games below cost a bet
    const bet = interaction.options.getInteger('bet');
    try { economy.spend(gid, uid, bet, 'fun'); }
    catch { return interaction.reply({ content: `▲  You don't have ${COIN} ${fmt(bet)}.`, flags: MessageFlags.Ephemeral }); }
    const refund = () => economy.award(gid, uid, bet, 'fun-refund');

    // ── rock-paper-scissors ────────────────────────────────────────────────────
    if (sub === 'rps') {
      const row = new ActionRowBuilder().addComponents(btn('rps_rock', '🪨 Rock'), btn('rps_paper', '📄 Paper'), btn('rps_scissors', '✂️ Scissors'));
      const msg = await interaction.reply({ content: `🆚  **RPS vs AI** for ${COIN} **${fmt(bet)}** — make your move!`, components: [row], fetchReply: true });
      try {
        const i = await msg.awaitMessageComponent({ filter: onlyYou, componentType: ComponentType.Button, time: 30_000 });
        const userPick = i.customId.split('_')[1];
        const aiPick = ai.rpsAiPick();
        const out = ai.rpsOutcome(userPick, aiPick);
        const E = { rock: '🪨', paper: '📄', scissors: '✂️' };
        let win = 0;
        if (out === 'win') win = bet * 2; else if (out === 'tie') win = bet;
        if (win > 0) economy.award(gid, uid, win, 'rps');
        const res = out === 'win' ? `🎉 You win ${COIN} **${fmt(bet)}**!` : out === 'tie' ? '🤝 Tie — bet refunded.' : `💸 AI wins — you lose ${COIN} **${fmt(bet)}**.`;
        await i.update({ content: `You ${E[userPick]}　vs　🤖 ${E[aiPick]}\n${res} · Balance ${bal(gid, uid)}`, components: [] });
      } catch { refund(); await interaction.editReply({ content: '⏱️ Timed out — bet refunded.', components: [] }).catch(() => {}); }
      return;
    }

    // ── higher / lower ─────────────────────────────────────────────────────────
    if (sub === 'highlow') {
      const cur = rnd(1, 100);
      const row = new ActionRowBuilder().addComponents(btn('hl_higher', '⬆️ Higher', ButtonStyle.Success), btn('hl_lower', '⬇️ Lower', ButtonStyle.Danger));
      const msg = await interaction.reply({ content: `🃏  The card is **${cur}** (1–100). Will the next be higher or lower? Bet ${COIN} **${fmt(bet)}**.`, components: [row], fetchReply: true });
      try {
        const i = await msg.awaitMessageComponent({ filter: onlyYou, componentType: ComponentType.Button, time: 30_000 });
        const next = rnd(1, 100);
        const guess = i.customId.split('_')[1];
        const correct = (guess === 'higher' && next > cur) || (guess === 'lower' && next < cur);
        let win = 0;
        if (next === cur) win = bet; else if (correct) win = bet * 2;
        if (win > 0) economy.award(gid, uid, win, 'highlow');
        const res = next === cur ? '🤝 Same card — refunded.' : correct ? `🎉 Correct! +${COIN} **${fmt(bet)}**` : `💸 Wrong — lost ${COIN} **${fmt(bet)}**.`;
        await i.update({ content: `🃏  **${cur} → ${next}** (you said ${guess})\n${res} · Balance ${bal(gid, uid)}`, components: [] });
      } catch { refund(); await interaction.editReply({ content: '⏱️ Timed out — refunded.', components: [] }).catch(() => {}); }
      return;
    }

    // ── tic-tac-toe vs AI ──────────────────────────────────────────────────────
    if (sub === 'ttt') {
      const board = Array(9).fill(null);
      const render = (done = false) => {
        const rows = [];
        for (let r = 0; r < 3; r++) {
          const row = new ActionRowBuilder();
          for (let c = 0; c < 3; c++) {
            const idx = r * 3 + c, v = board[idx];
            row.addComponents(new ButtonBuilder().setCustomId(`ttt_${idx}`)
              .setLabel(v || '​').setDisabled(done || !!v)
              .setStyle(v === 'X' ? ButtonStyle.Primary : v === 'O' ? ButtonStyle.Danger : ButtonStyle.Secondary));
          }
          rows.push(row);
        }
        return rows;
      };
      const msg = await interaction.reply({ content: `❎  **Tic-Tac-Toe vs 🤖** for ${COIN} **${fmt(bet)}** — you're **X**.`, components: render(), fetchReply: true });
      const collector = msg.createMessageComponentCollector({ filter: onlyYou, componentType: ComponentType.Button, time: 120_000 });
      let finished = false;
      collector.on('collect', async (i) => {
        const cell = Number(i.customId.split('_')[1]);
        if (board[cell]) return i.deferUpdate().catch(() => {});
        board[cell] = 'X';
        let w = ai.tttWinner(board);
        if (!w) {
          const empty = board.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0);
          const aiCell = Math.random() < 0.2 ? empty[rnd(0, empty.length - 1)] : ai.tttAiMove(board); // 20% slip → beatable
          if (aiCell >= 0) board[aiCell] = 'O';
          w = ai.tttWinner(board);
        }
        if (w) {
          finished = true; collector.stop();
          let win = 0, res;
          if (w === 'X') { win = bet * 2; res = `🎉 You win ${COIN} **${fmt(bet)}**!`; }
          else if (w === 'draw') { win = bet; res = '🤝 Draw — bet refunded.'; }
          else res = `🤖 AI wins — you lose ${COIN} **${fmt(bet)}**.`;
          if (win > 0) economy.award(gid, uid, win, 'ttt');
          await i.update({ content: `❎  Tic-Tac-Toe — ${res} · Balance ${bal(gid, uid)}`, components: render(true) }).catch(() => {});
        } else {
          await i.update({ components: render() }).catch(() => {});
        }
      });
      collector.on('end', () => {
        if (!finished) { refund(); interaction.editReply({ content: '⏱️ Timed out — bet refunded.', components: render(true) }).catch(() => {}); }
      });
      return;
    }
  },
};
