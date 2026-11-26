// Builds egg-maowcore.json (Pterodactyl egg, PTDL_v2 format) from install.sh.
// Run after changing install.sh or the variables:  node deploy/pterodactyl/build-egg.js
const fs = require('node:fs');
const path = require('node:path');

const here = __dirname;
const install = fs.readFileSync(path.join(here, 'install.sh'), 'utf8').replace(/\r\n/g, '\n');

const v = (name, env_variable, description, default_value, rules, extra = {}) => ({
  name, description, env_variable, default_value,
  user_viewable: true, user_editable: true, rules, field_type: 'text', ...extra,
});

const egg = {
  _comment: 'MaowCore Discord music bot + dashboard. Import in the admin area: Nests > Import Egg.',
  meta: { version: 'PTDL_v2', update_url: null },
  exported_at: new Date().toISOString().replace(/\.\d+Z$/, '+00:00'),
  name: 'MaowCore',
  author: 'lara@maowcore.local',
  description: 'MaowCore: a Discord music + community bot (YouTube, Spotify, SoundCloud, leveling, modmail, giveaways, automod) with a web dashboard. '
    + 'The dashboard runs on this server\'s port; open http://<server address>:<port>/ once it says "Logged in as".',
  features: null,
  // First = default. Switching images later is fine: start.sh rebuilds the
  // native modules once when the Node.js version changes.
  docker_images: {
    'Node.js 22': 'ghcr.io/parkervcp/yolks:nodejs_22',
    'Node.js 24': 'ghcr.io/parkervcp/yolks:nodejs_24',
    'Node.js 20': 'ghcr.io/parkervcp/yolks:nodejs_20',
  },
  file_denylist: [],
  // Wings swaps {{VAR}} for the variable's value; the image runs this with bash in /home/container.
  // 1. Update = make the code exactly what's on GitHub (fetch + reset, so a file edited on the server can't
  //    block it the way a merge conflict would block `git pull`). data/, cookies/, bin/, .env and the built
  //    dashboard aren't in git, so they're kept. If GitHub can't be reached, the bot starts with the code it has.
  // 2. The rest lives in the repo (deploy/pterodactyl/start.sh: temp folder, yt-dlp update, start), so it
  //    can change without re-importing the egg. Older code without that script just starts the bot.
  startup: 'if [[ -d .git ]] && [[ "{{AUTO_UPDATE}}" == "1" ]]; then echo "Updating from GitHub..."; '
    + 'git fetch --quiet origin {{BRANCH}} && git reset --hard FETCH_HEAD && npm install --omit=dev --no-audit --no-fund; fi; '
    + 'if [[ -f deploy/pterodactyl/start.sh ]]; then exec bash deploy/pterodactyl/start.sh; else node index.js; fi',
  config: {
    files: '{}',
    startup: JSON.stringify({ done: 'Logged in as ' }),
    logs: '{}',
    stop: '^C', // SIGINT: the bot leaves voice and goes offline cleanly
  },
  scripts: {
    // same Debian release (trixie) as the run image, so native modules match its libraries
    installation: { script: install, container: 'node:22-trixie', entrypoint: 'bash' },
  },
  variables: [
    v('Discord bot token', 'DISCORD_TOKEN', 'Developer Portal > your app > Bot > Reset Token.', '', 'required|string|max:200'),
    v('Application ID', 'CLIENT_ID', 'Developer Portal > your app > General Information > Application ID.', '', 'required|string|max:32'),
    v('Test server ID', 'GUILD_ID', 'Optional. Slash commands appear in this server instantly; leave blank for all servers (up to an hour).', '', 'nullable|string|max:32'),
    v('Spotify client ID', 'SPOTIFY_CLIENT_ID', 'Optional, for Spotify links. developer.spotify.com/dashboard', '', 'nullable|string|max:100'),
    v('Spotify client secret', 'SPOTIFY_CLIENT_SECRET', 'Optional, for Spotify links.', '', 'nullable|string|max:100'),
    v('Genius token', 'GENIUS_TOKEN', 'Optional, for /lyrics. genius.com/api-clients', '', 'nullable|string|max:200'),
    v('Bot name', 'BOT_INSTANCE_NAME', 'Name shown in mod-log entries ("via <name>").', 'MaowCore', 'required|string|max:40'),
    v('Extra owner user IDs', 'OWNER_USER_ID', 'Optional. The bot\'s two owners are built in; add more permanent owners here as Discord user IDs separated by commas (Settings > Advanced > Developer Mode, then right-click a name > Copy User ID). Owners are always owner on the dashboard and pass the bot\'s permission checks in every server.', '', 'nullable|string|max:200'),
    v('Dashboard token', 'CONTROL_TOKEN', 'Password for the web dashboard. Leave blank and the bot makes one on first start, saved in data/control-token.txt.', '', 'nullable|string|max:200'),
    v('Discord sign-in secret', 'DISCORD_CLIENT_SECRET', 'Optional: lets people sign in to the dashboard with Discord. Developer Portal > your app > OAuth2 > Client Secret. Also set the dashboard public URL below.', '', 'nullable|string|max:200'),
    v('Require sign-in', 'PANEL_REQUIRE_LOGIN', '1 = the dashboard needs a Discord sign-in (or the token) for everything; 0 = the dashboard token alone.', '0', 'required|boolean'),
    v('Command prefix', 'COMMAND_PREFIX', 'Optional. Puts a prefix in front of every slash command name (e.g. "mc" makes /play into /mc-play), for running two bots in one server. Lowercase letters, digits and _ only.', '', 'nullable|regex:/^[a-z0-9_]*$/|max:10'),
    v('Backup DMs', 'OFFSITE_BACKUP', 'How often the bot DMs its owner (Owner user ID above) a backup of its data: weekly, daily or off. No songs, cookies or logins are included.', 'weekly', 'required|string|in:weekly,daily,off'),
    v('Dashboard public URL', 'PANEL_PUBLIC_URL', 'Optional. The address people use to reach the dashboard, e.g. https://203.0.113.5:25570 (needed for Discord sign-in; the https certificate also covers this address).', '', 'nullable|string|max:200'),
    v('Dashboard https', 'PANEL_HTTPS', 'auto = the dashboard uses https with a certificate the bot makes itself (browsers warn once: Advanced > Proceed); on = always; off = plain http. Open it at https://<server IP>:<port>. To use your own certificate, upload data/tls/cert.pem and data/tls/key.pem.', 'auto', 'required|string|in:auto,on,off'),
    v('Open sign-up', 'PANEL_OPEN_SIGNUP', 'With "Require sign-in" on: 1 = new Discord sign-ins become members right away; 0 = they start as guests until a moderator promotes them.', '0', 'required|boolean'),
    v('Extra allowed websites', 'PANEL_ALLOWED_ORIGINS', 'Optional. Other websites allowed to call the dashboard API (e.g. a status page), separated by commas: https://a.example.com,https://b.example.com', '', 'nullable|string|max:500'),
    v('Twitch client ID', 'TWITCH_CLIENT_ID', 'Optional, for Twitch go-live alerts. dev.twitch.tv/console > Register Your Application.', '', 'nullable|string|max:100'),
    v('Twitch client secret', 'TWITCH_CLIENT_SECRET', 'Optional, for Twitch go-live alerts.', '', 'nullable|string|max:100'),
    v('Last.fm API key', 'LASTFM_API_KEY', 'Optional, to scrobble what the bot plays. last.fm/api/account/create', '', 'nullable|string|max:100'),
    v('Last.fm shared secret', 'LASTFM_API_SECRET', 'Optional, for Last.fm scrobbling.', '', 'nullable|string|max:100'),
    v('Last.fm session key', 'LASTFM_SESSION_KEY', 'Optional. Leave blank and connect Last.fm from the dashboard instead (it saves the key itself).', '', 'nullable|string|max:100'),
    v('Health alerts', 'HEALTH_ALERTS', '1 = the bot DMs its main owner when something breaks (crashes, downloads failing, YouTube blocked); 0 = no alert DMs.', '1', 'required|boolean'),
    v('Update notes DM', 'UPDATE_NOTES', '1 = after an update, the bot DMs its main owner what changed (the CHANGELOG since the version it ran before); 0 = no DM.', '1', 'required|boolean'),
    v('Daily error digest', 'ERROR_DIGEST', '1 = once a day the bot DMs its main owner the previous day\'s errors, grouped (nothing on days without errors); 0 = off.', '1', 'required|boolean'),
    v('Clean up left servers', 'GUILD_CLEANUP', '1 = settings of servers the bot was removed from are deleted after 30 days (levels, coins and play history stay); 0 = keep everything.', '1', 'required|boolean'),
    v('Alert webhook', 'ALERT_WEBHOOK_URL', 'Optional. A Discord webhook URL that also gets error-spike alerts.', '', 'nullable|string|max:300'),
    v('Status page URL', 'STATUS_PUSH_URL', 'Optional. Where the bot pushes its public status (the Cloudflare status worker in deploy/status-worker).', '', 'nullable|string|max:300'),
    v('Status page secret', 'STATUS_PUSH_SECRET', 'Optional. Shared secret for the status page push.', '', 'nullable|string|max:200'),
    v('GitHub token', 'GITHUB_TOKEN', 'Optional. A read-only GitHub token, only to avoid rate limits for the update feed and /announceupdate.', '', 'nullable|string|max:200'),
    v('Deploy commands on start', 'AUTO_DEPLOY_COMMANDS', 'true = the bot updates its slash commands with Discord when it starts (new or changed commands show up by themselves); false = never.', 'true', 'required|string|in:true,false'),
    v('Git repo', 'GIT_ADDRESS', 'Where the install script gets the code. Leave blank to upload the files yourself.', 'https://github.com/lisalepardeany-coder/maowcore', 'nullable|string|max:200'),
    v('Git branch', 'BRANCH', 'Branch to install.', 'main', 'required|string|max:60'),
    v('Git username', 'USERNAME', 'Only for a private repo.', '', 'nullable|string|max:60'),
    v('Git access token', 'ACCESS_TOKEN', 'Only for a private repo: a GitHub token with read access to it.', '', 'nullable|string|max:200'),
    v('Update on start', 'AUTO_UPDATE', '1 = get the newest code from GitHub (and its packages) every time the server starts. Files you edited on the server that are part of the code get replaced; data/, cookies/ and .env are kept.', '1', 'required|boolean'),
  ],
};

fs.writeFileSync(path.join(here, 'egg-maowcore.json'), JSON.stringify(egg, null, 4) + '\n');
console.log('wrote egg-maowcore.json');
