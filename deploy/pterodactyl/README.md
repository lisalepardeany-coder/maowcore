# MaowCore on Pterodactyl

`egg-maowcore.json` is a Pterodactyl egg in the `PTDL_v2` format (Pterodactyl 1.11+ and Pelican).

## Set up

1. Admin area > **Nests** > **Import Egg** > choose `egg-maowcore.json`.
2. Create a server with the **MaowCore** egg:
   - 1 port, at least 1 GB RAM and 3 GB disk (the new dashboard's build tools take about 300 MB).
   - Fill in **Discord bot token** and **Application ID**.
   - For a private repo, also fill in **Git username** and **Git access token**.
3. The install:
   - clones the repo;
   - downloads a Linux `yt-dlp` into `bin/`;
   - runs `npm install`;
   - builds the new dashboard.
4. Start the server. It shows as running once the console prints `Logged in as`.
5. Open the dashboard at `http://<node address>:<server port>/`. This is the main dashboard: themes, Control room and the status page at `/status.html`. The SvelteKit dashboard's pages (`/leveling`, `/radio`, ...) work too. To make the SvelteKit one the start page, set **Start page** to `new`.

**Already have a server from an older egg?** Update the egg (Admin > Nests > MaowCore > Update egg), then on the server's **Startup** tab set **Update on start** to `1` and restart. The first start after an update builds the new dashboard, which takes a minute or two.

## Tools

| Tool | Where it comes from |
|---|---|
| Node 22, ffmpeg, git, Python, build tools | the panel's Node image (`ghcr.io/parkervcp/yolks:nodejs_22`). The bot uses that ffmpeg. |
| yt-dlp | downloaded to `bin/` at install, updated on every start |
| yt-dlp's JavaScript runtime for YouTube | Node, which the bot already passes to yt-dlp |

YouTube often blocks hosting-company addresses ("Sign in to confirm you're not a bot"). If that happens, give the bot YouTube cookies (Netscape `cookies.txt`, exported while signed in on youtube.com) in either of these ways:

- **Drop it in the `cookies/` folder** with the panel's File Manager or SFTP. Within 30 seconds the bot keeps the YouTube/Google lines and deletes the dropped file, because a full export holds your other sites' logins too.
- **Upload it in the dashboard's Control room.**

Either way, the cookies are saved to `data/youtube-cookies.txt`. Restart once afterwards so YouTube search uses them too.

Console commands (type in the panel's console): `cookies` shows what's saved, `cookies reload` checks the folder now, `cookies remove` deletes them, `help`.

Logging in to YouTube from the console isn't possible: yt-dlp dropped its login command after YouTube blocked it.

## Notes

- The panel opens one port per server. The bot uses that port for the dashboard by itself (`lib/hosting.js`). `CONTROL_PORT` and `CONTROL_HOST` are ignored on the panel.
- The dashboard is reachable from the internet. Turn on Discord sign-in in the dashboard's settings:
  - set **Dashboard public URL** first;
  - add `<that URL>/api/auth/discord/callback` as a redirect in the Developer Portal.
- Panel variables win over `.env`. A blank panel variable doesn't hide a `.env` value. Settings the dashboard saves to `.env` (sign-in, client secret) keep working.
- **Stop** sends Ctrl+C, so the bot leaves voice and goes offline right away.
- Your data lives in `data/` in the server's files. Back that folder up before you reinstall.
- **Update on start** is on by default. Every start makes the code exactly what's on GitHub, then runs `npm install`.
  - Code files you edited on the server get replaced, so make code changes on GitHub.
  - `data/`, `cookies/`, `bin/`, `.env` and the built dashboard are kept.
  - If GitHub can't be reached, the bot starts with the code it already has.
- The rest of each start is `deploy/pterodactyl/start.sh` in the repo:
  - it rebuilds the dashboard when its source changed;
  - it updates yt-dlp;
  - it starts the bot.
  
  Because the script lives in the repo, you can change it without re-importing the egg.
- If the SvelteKit dashboard's build fails (too little disk space, for example), the bot still starts, and the main dashboard is unaffected.
- After changing `install.sh` or the variables, rebuild the egg with `node deploy/pterodactyl/build-egg.js`.
