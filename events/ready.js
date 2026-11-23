const { Events, ActivityType } = require('discord.js');
const { inviteUrl, userInstallUrl, resolveClientId } = require('../lib/invite');
const { deployToAll, deployGlobal } = require('../lib/command-deploy');
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
      // Portable commands (DMs, group chats, user install) go global first;
      // if that fails entirely, the guild deploy below carries them instead.
      const g = await deployGlobal(client);
      if (!g.ok) {
        console.warn(`▲ Global commands failed, keeping them per-server: ${g.error}`);
      } else {
        if (g.deployed) console.log(`✦ Deployed ${g.count} portable commands globally${g.userInstall ? ' (DMs, group chats, user install)' : ''}`);
        if (!g.userInstall) {
          console.warn('▲ User install is off for this app — turn it on in the Developer Portal → Installation to use commands in group chats.');
          if (g.userInstallError) console.warn(`    Discord said: ${g.userInstallError}`);
        }
        const link = userInstallUrl(resolveClientId(client));
        if (g.userInstall && link) console.log(`✧ Add to your account (DMs & group chats): ${link}`);
      }
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
