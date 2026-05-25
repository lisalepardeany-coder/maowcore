const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { COLORS } = require('../lib/theme');

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('Open the stellar command console'),
  async execute(interaction) {
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
          '`/sb <name>` *(soundboard from data/sounds/)*',
          '',
          '**◇ Queue**',
          '`/queue` · `/nowplaying` · `/remove <pos>` · `/shuffle` (smart)',
          '`/save <name>` · `/load <name>` · `/myplaylists` · `/deleteplaylist <name>`',
          '`/share <name>` · `/importpl` *(cross-server playlists)*',
          '',
          '**◇ Audio**',
          '`/volume <0-150>` · `/loop <off|song|queue>` · `/filter add|remove|clear|list`',
          '`/eq preset <name>` · `/speed <factor>` · `/pitch <semitones>`',
          '`/karaoke` · `/normalize` · `/crossfade` · `/autoplay` · `/sponsorblock`',
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
          '`/welcome channel|message|off|show` · `/timeout` · `/warn` · `/modlog`',
          '`/reactionrole` · `/statschannels create|remove`',
          '',
          '**◇ Server admin**',
          '`/dj role|ratio|show` · `/alias set|remove|list` · `/personality <tone>`',
          '`/language <locale>` · `/backup` · `/import` · `/reload`',
          '`/quickset set|clear|list` · `/welcomesound which: url:`',
          '',
          '*React with* `❤️ ⏭️ 🔁 🔀` *on the Now Transmitting message for quick controls.*',
          '*Or open the dashboard:* `http://127.0.0.1:8765/`',
        ].join('\n'),
      )
      .setFooter({ text: '✦  YouTube · Spotify · SoundCloud · Genius · SponsorBlock · Bandsintown' });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
