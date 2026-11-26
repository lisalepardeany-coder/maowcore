const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { COLORS } = require('../lib/theme');
const { botInServer } = require('../lib/guards');

module.exports = {
  everywhere: true,
  data: new SlashCommandBuilder().setName('help').setDescription('Open the stellar command console'),
  async execute(interaction) {
    // Outside a server the bot is in (DMs, group chats, other servers) only
    // the portable commands work, so show just those.
    if (!botInServer(interaction)) {
      const short = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setTitle('◆  POCKET CONSOLE')
        .setDescription([
          '*Commands that work in DMs, group chats and any server:*',
          '',
          '`/lyrics [q]` · `/nowplaying` · `/meme top: bottom:`',
          '`/avatar [user]` · `/remind when: what:` · `/botinfo` · `/invite` · `/help`',
          '',
          '*`/nowplaying`, `/meme` and `/lyrics` without a query use the song in the voice channel you\'re in.*',
          '*Music, moderation and setup commands only work in servers MaowCore is in.*',
        ].join('\n'));
      return interaction.reply({ embeds: [short], flags: MessageFlags.Ephemeral });
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setTitle('◆  STELLAR COMMAND CONSOLE')
      .setDescription(
        [
          '*Transmission protocols for the void.*',
          '',
          '**◇ Playback**',
          '`/play <q>` · `/anonymous <q>` · `/dedicate <q> for: <who>`',
          '`/skip` (vote/DJ) · `/previous` · `/seek <s>` · `/loopab <start> <end>`',
          '`/pause` · `/resume` · `/stop` · `/leave` · `/247` · `/restore` · `/sleep <m>`',
          '',
          '**◇ Sources**',
          '`/radio <station>` · `/radiosearch <q>` · `/podcast subscribe|play|list`',
          '`/sb <name>` *(soundboard)* · `/library play|list|remove` *(your uploads)*',
          '',
          '**◇ Queue**',
          '`/queue` · `/nowplaying` · `/remove <pos>` · `/shuffle` (smart)',
          '`/playlist save|load|list|delete <name>`',
          '`/playlist share|import` *(cross-server playlists)*',
          '',
          '**◇ Audio**',
          '`/volume <0-150>` · `/loop <off|song|queue>` · `/sound filter add|remove|clear|list`',
          '`/sound eq preset <name>` · `/sound speed <factor>` · `/sound pitch <semitones>`',
          '`/sound karaoke|normalize|crossfade` · `/autoplay` · `/sponsorblock`',
          '',
          '**◇ Intelligence**',
          '`/lyrics [q]` *(synced + translate)* · `/rate current|top|low`',
          '`/tours [artist]` · `/say <text>` · `/announce` *(TTS announcements)*',
          '',
          '**◇ Sessions & games**',
          '`/pomodoro start|stop` · `/quiz [rounds]` · `/meme top: bottom:`',
          '',
          '**◇ Queue & favorites**',
          '`/favorite add|remove|list` · `/undo` *(restore last /stop)*',
          '`/timemachine <era>` · `/event start|end|status`',
          '',
          '**◇ Server moderation**',
          '`/welcome channel|message|off|show` · `/warn` · `/modlog`',
          '`/mod kick|ban|softban|unban|timeout` · `/mod tempban|tempmute|history|note|modmail`',
          '`/reactionrole` · `/statschannels create|remove`',
          '',
          '**◇ Server admin**',
          '`/dj role|ratio|show` · `/alias set|remove|list` · `/personality <tone>`',
          '`/language <locale>` · `/backup` · `/reload` · `/botinfo`',
          '`/quickset set|clear|list` · `/welcomesound which: url:`',
          '',
          '*React with* `❤️ ⏭️ 🔁 🔀` *on the Now Transmitting message for quick controls.*',
          '*Or open the dashboard:* `http://127.0.0.1:8766/`',
        ].join('\n'),
      )
      .setFooter({ text: '✦  YouTube · Spotify · SoundCloud · Genius · SponsorBlock · Bandsintown' });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
