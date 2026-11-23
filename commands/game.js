const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require('discord.js');
const fun = require('../lib/fun');

// ===== Pure helpers (unit tested) =====
const RPS = { rock: '🪨', paper: '📄', scissors: '✂️' };
const rpsResult = (a, b) => (a === b ? 'draw' : ({ rock: 'scissors', paper: 'rock', scissors: 'paper' }[a] === b ? 'win' : 'lose'));
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const tttWinner = (b) => {
  for (const [x, y, z] of LINES) if (b[x] && b[x] === b[y] && b[x] === b[z]) return b[x];
  return b.every(Boolean) ? 'draw' : null;
};
// Bot move: win, else block, else centre, else a corner, else anything.
const tttBotMove = (b, me, them) => {
  const empty = b.map((v, i) => (v ? null : i)).filter((i) => i !== null);
  const tryMark = (mark) => empty.find((i) => { const c = b.slice(); c[i] = mark; return tttWinner(c) === mark; });
  const win = tryMark(me); if (win !== undefined) return win;
  const block = tryMark(them); if (block !== undefined) return block;
  if (!b[4]) return 4;
  const corner = [0, 2, 6, 8].filter((i) => !b[i]);
  if (corner.length) return corner[Math.floor(Math.random() * corner.length)];
  return empty[Math.floor(Math.random() * empty.length)];
};
const EIGHT = ['It is certain.', 'Without a doubt.', 'Yes — definitely.', 'Most likely.', 'Signs point to yes.', 'Ask again later.',
  'Better not tell you now.', 'Cannot predict now.', 'Don\'t count on it.', 'My sources say no.', 'Very doubtful.', 'The cat says… maybe.'];

const tttRows = (b, done) => [0, 1, 2].map((r) => new ActionRowBuilder().addComponents([0, 1, 2].map((c) => {
  const i = r * 3 + c;
  return new ButtonBuilder().setCustomId(`ttt:${i}`).setLabel(b[i] || '·').setStyle(b[i] === '❌' ? ButtonStyle.Danger : b[i] === '⭕' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(done || !!b[i]);
})));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('game')
    .setDescription('Mini games (wins earn a few coins)')
    .addSubcommand((s) => s.setName('rps').setDescription('Rock, paper, scissors vs the bot')
      .addStringOption((o) => o.setName('pick').setDescription('Your pick').setRequired(true).addChoices({ name: '🪨 Rock', value: 'rock' }, { name: '📄 Paper', value: 'paper' }, { name: '✂️ Scissors', value: 'scissors' })))
    .addSubcommand((s) => s.setName('coin').setDescription('Flip a coin'))
    .addSubcommand((s) => s.setName('dice').setDescription('Roll dice')
      .addIntegerOption((o) => o.setName('sides').setDescription('Sides (default 6)').setMinValue(2).setMaxValue(1000))
      .addIntegerOption((o) => o.setName('count').setDescription('How many dice (default 1)').setMinValue(1).setMaxValue(10)))
    .addSubcommand((s) => s.setName('8ball').setDescription('Ask the magic ball')
      .addStringOption((o) => o.setName('question').setDescription('Your question').setRequired(true)))
    .addSubcommand((s) => s.setName('higherlower').setDescription('Higher or lower? Keep your streak going'))
    .addSubcommand((s) => s.setName('tictactoe').setDescription('Tic-tac-toe vs a friend or the bot')
      .addUserOption((o) => o.setName('opponent').setDescription('Leave empty to play the bot'))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId; const uid = interaction.user.id;
    if (sub === 'rps') {
      const me = interaction.options.getString('pick');
      const bot = Object.keys(RPS)[Math.floor(Math.random() * 3)];
      const r = rpsResult(me, bot);
      if (r === 'win') fun.reward(gid, uid, 5, 'rps');
      return interaction.reply(`${RPS[me]} vs ${RPS[bot]} — ${r === 'win' ? '**You win!** +5 🪙' : r === 'lose' ? '**I win!** 😼' : '**Draw.**'}`);
    }
    if (sub === 'coin') return interaction.reply(`🪙 ${Math.random() < 0.5 ? '**Heads**' : '**Tails**'}`);
    if (sub === 'dice') {
      const sides = interaction.options.getInteger('sides') || 6; const n = interaction.options.getInteger('count') || 1;
      const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
      return interaction.reply(`🎲 ${rolls.join(' + ')}${n > 1 ? ` = **${rolls.reduce((a, b) => a + b, 0)}**` : ''} (d${sides})`);
    }
    if (sub === '8ball') return interaction.reply(`🎱 *${interaction.options.getString('question').slice(0, 200)}*\n**${EIGHT[Math.floor(Math.random() * EIGHT.length)]}**`);

    if (sub === 'higherlower') {
      let cur = 1 + Math.floor(Math.random() * 100); let streak = 0;
      const row = (off) => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('hl:up').setLabel('Higher').setEmoji('⬆').setStyle(ButtonStyle.Success).setDisabled(off),
        new ButtonBuilder().setCustomId('hl:down').setLabel('Lower').setEmoji('⬇').setStyle(ButtonStyle.Danger).setDisabled(off),
        new ButtonBuilder().setCustomId('hl:cash').setLabel('Cash out').setEmoji('🪙').setStyle(ButtonStyle.Secondary).setDisabled(off || !streak));
      const view = (text, off = false) => ({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('⬆⬇ Higher or lower?').setDescription(`${text}\n\nCurrent number: **${cur}** (1–100)\nStreak: **${streak}**`)], components: [row(off)] });
      const msg = await interaction.reply({ ...view('Will the next number be higher or lower?'), withResponse: true }).then((r) => r.resource?.message);
      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 3 * 60000 });
      col.on('collect', async (i) => {
        if (i.user.id !== uid) return i.reply({ content: 'Start your own game with `/game higherlower`!', flags: MessageFlags.Ephemeral });
        if (i.customId === 'hl:cash') { const coins = streak * 3; fun.reward(gid, uid, coins, 'higherlower'); col.stop('done'); return i.update(view(`🪙 Cashed out a streak of ${streak} for **${coins}** coins!`, true)); }
        let next; do { next = 1 + Math.floor(Math.random() * 100); } while (next === cur);
        const right = i.customId === 'hl:up' ? next > cur : next < cur;
        const was = cur; cur = next;
        if (!right) { col.stop('done'); return i.update(view(`It was **${next}** (after ${was}). ❌ Streak over at ${streak}.`, true)); }
        streak++;
        return i.update(view(`It was **${next}** — ✓ correct!`));
      });
      col.on('end', (_c, why) => { if (why !== 'done') msg.edit({ components: [row(true)] }).catch(() => {}); });
      return null;
    }

    // ===== Tic-tac-toe =====
    const opp = interaction.options.getUser('opponent');
    if (opp && (opp.bot || opp.id === uid)) return interaction.reply({ content: '◌ Pick a real person who isn\'t you — or leave it empty to play me.', flags: MessageFlags.Ephemeral });
    const vsBot = !opp;
    const players = { '❌': uid, '⭕': vsBot ? 'bot' : opp.id };
    const board = Array(9).fill(null);
    let turn = '❌';
    const title = () => `❌ ${interaction.user.username} vs ⭕ ${vsBot ? 'MaowCore' : opp.username}`;
    const msg = await interaction.reply({ content: `${title()}\nYour turn, <@${uid}>.`, components: tttRows(board, false), withResponse: true }).then((r) => r.resource?.message);
    const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60000 });
    const finish = (i, w) => {
      col.stop('done');
      let text;
      if (w === 'draw') text = '🤝 Draw!';
      else if (players[w] === 'bot') text = '😼 I win!';
      else { text = `🏆 <@${players[w]}> wins! +${vsBot ? 5 : 15} 🪙`; fun.reward(gid, players[w], vsBot ? 5 : 15, 'tictactoe'); }
      return i.update({ content: `${title()}\n${text}`, components: tttRows(board, true) });
    };
    col.on('collect', async (i) => {
      if (i.user.id !== players[turn]) return i.reply({ content: Object.values(players).includes(i.user.id) ? 'Not your turn!' : 'You\'re not in this game.', flags: MessageFlags.Ephemeral });
      const idx = Number(i.customId.split(':')[1]);
      if (board[idx]) return i.deferUpdate();
      board[idx] = turn;
      let w = tttWinner(board);
      if (w) return finish(i, w);
      turn = turn === '❌' ? '⭕' : '❌';
      if (vsBot) {
        board[tttBotMove(board, '⭕', '❌')] = '⭕';
        w = tttWinner(board);
        if (w) return finish(i, w);
        turn = '❌';
      }
      return i.update({ content: `${title()}\nYour turn, <@${players[turn]}>.`, components: tttRows(board, false) });
    });
    col.on('end', (_c, why) => { if (why !== 'done') msg.edit({ content: `${title()}\n⌛ Game timed out.`, components: tttRows(board, true) }).catch(() => {}); });
    return null;
  },
  _test: { rpsResult, tttWinner, tttBotMove },
};
