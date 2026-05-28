const { Events, ActivityType } = require('discord.js');
const { inviteUrl, resolveClientId } = require('../lib/invite');
const { deployToAll } = require('../lib/command-deploy');
const library = require('../lib/library');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`◆ Uplink stable · Logged in as ${client.user.tag}`);
    client.user.setActivity('cosmic transmissions · /help', { type: ActivityType.Listening });

    // Backfill durations for any library uploads missing one (e.g. uploaded
    // before duration-probing existed). Runs in the background.
    library.backfillDurations().then((n) => {
      if (n) console.log(`♫ Probed duration for ${n} library upload${n === 1 ? '' : 's'}.`);
    }).catch(() => {});

    // Print the OAuth2 invite URL so the bot owner doesn't need to fish around
    // in the Discord developer portal every time they want to add it to a new
    // server. Visible in stdout the moment the bot logs in.
    const url = inviteUrl(resolveClientId(client));
    if (url) {
      const guildCount = client.guilds.cache.size;
      console.log('');
      console.log('  ╭──────────────────────────────────────────────────────────────');
      console.log('  │  ✦  Invite this bot to a server:');
      console.log('  │');
      console.log(`  │  ${url}`);
      console.log('  │');
      console.log(`  │  Currently in ${guildCount} server${guildCount === 1 ? '' : 's'}.`);
      console.log('  │');
      console.log('  │  Press Ctrl+C in this window to stop cleanly (drops the bot');
      console.log('  │  offline immediately). Closing the window force-kills it and');
      console.log('  │  Discord takes ~30–45s to notice.');
      console.log('  ╰──────────────────────────────────────────────────────────────');
      console.log('');
    }

    // Auto-deploy slash commands to every guild — appears instantly, no
    // up-to-1-hour global propagation wait. Skipped per-guild when the
    // command set is unchanged (hash cached on disk).
    // Set AUTO_DEPLOY_COMMANDS=false in .env to opt out.
    if (process.env.AUTO_DEPLOY_COMMANDS !== 'false') {
      const results = await deployToAll(client);
      const deployed = results.filter((r) => r.ok && r.deployed);
      const skipped = results.filter((r) => r.ok && !r.deployed);
      const failed = results.filter((r) => !r.ok);
      if (deployed.length) {
        const n = deployed[0]?.count ?? 0;
        console.log(`✦ Auto-deployed ${n} slash commands to ${deployed.length} guild${deployed.length === 1 ? '' : 's'}: ${deployed.map((r) => r.guildName).join(', ')}`);
      }
      if (skipped.length) {
        console.log(`◇ Skipped ${skipped.length} guild${skipped.length === 1 ? '' : 's'} (commands already in sync)`);
      }
      if (failed.length) {
        console.warn(`▲ Deploy failed for ${failed.length} guild${failed.length === 1 ? '' : 's'}:`);
        failed.forEach((r) => console.warn(`    ${r.guildName}: ${r.error}`));
      }
    }
  },
};
