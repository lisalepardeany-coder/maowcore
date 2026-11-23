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
  docker_images: {
    'Node.js 22': 'ghcr.io/parkervcp/yolks:nodejs_22',
    'Node.js 20': 'ghcr.io/parkervcp/yolks:nodejs_20',
  },
  file_denylist: [],
  // Wings swaps {{VAR}} for the variable's value; the image runs this with bash in /home/container.
  // 1. Update = make the code exactly what's on GitHub (fetch + reset, so a file edited on the server can't
  //    block it the way a merge conflict would block `git pull`). data/, cookies/, bin/, .env and the built
  //    dashboard aren't in git, so they're kept. If GitHub can't be reached, the bot starts with the code it has.
  // 2. The rest lives in the repo (deploy/pterodactyl/start.sh: dashboard build, yt-dlp update, start), so it
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
    v('Start page', 'PANEL_HOME', 'Which dashboard opens at the main address: "new" or "classic" (the classic one is always at /dashboard.html).', 'new', 'required|string|in:new,classic'),
    v('Dashboard public URL', 'PANEL_PUBLIC_URL', 'Optional. The address people use to reach the dashboard, e.g. http://node.example.com:25570 (needed for Discord sign-in).', '', 'nullable|string|max:200'),
    v('Git repo', 'GIT_ADDRESS', 'Where the install script gets the code. Leave blank to upload the files yourself.', 'https://github.com/lisalepardeany-coder/maowcore', 'nullable|string|max:200'),
    v('Git branch', 'BRANCH', 'Branch to install.', 'main', 'required|string|max:60'),
    v('Git username', 'USERNAME', 'Only for a private repo.', '', 'nullable|string|max:60'),
    v('Git access token', 'ACCESS_TOKEN', 'Only for a private repo: a GitHub token with read access to it.', '', 'nullable|string|max:200'),
    v('Update on start', 'AUTO_UPDATE', '1 = get the newest code from GitHub (and its packages) every time the server starts. Files you edited on the server that are part of the code get replaced; data/, cookies/ and .env are kept.', '1', 'required|boolean'),
  ],
};

fs.writeFileSync(path.join(here, 'egg-maowcore.json'), JSON.stringify(egg, null, 4) + '\n');
console.log('wrote egg-maowcore.json');
