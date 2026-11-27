# MaowCore on Pterodactyl

`egg-maowcore.json` is a Pterodactyl egg in the `PTDL_v2` format (Pterodactyl 1.11+ and Pelican).

## Set up

1. Admin area > **Nests** > **Import Egg** > choose `egg-maowcore.json`.
2. Create a server with the **MaowCore** egg:
   - 1 port, at least 1 GB RAM and 2 GB disk.
   - Fill in **Discord bot token** and **Application ID**.
   - For a private repo, also fill in **Git username** and **Git access token**.
3. The install:
   - clones the repo;
   - downloads a Linux `yt-dlp` into `bin/`;
   - runs `npm install`.
4. Start the server. It shows as running once the console prints `Logged in as`.
5. Open the dashboard at `https://<server IP>:<server port>/`, with themes, Control room, downloads and the status page at `/status.html`. The first time, the browser warns about the certificate: click **Advanced > Proceed** (see [Dashboard https](#dashboard-https)).

**Already have a server from an older egg?** Update the egg (Admin > Nests > MaowCore > Update egg), then on the server's **Startup** tab set **Update on start** to `1` and restart.

## Without the MaowCore egg (any Node.js egg)

No admin access to import an egg? A server with Pterodactyl's standard **Node.js** egg (or any egg with a Node.js 22+ image) runs the bot too. The host's own system doesn't matter (Debian 13, Ubuntu, …): the bot runs inside the egg's Docker image.

1. On the server's **Startup** tab, set the startup command to:

   ```bash
   if [[ ! -d .git ]]; then git init -q && git remote add origin "${GIT_ADDRESS:-https://github.com/lisalepardeany-coder/maowcore}" && git fetch -q origin "${BRANCH:-main}" && git reset -q --hard FETCH_HEAD; fi; exec bash deploy/pterodactyl/boot.sh
   ```

   If the panel doesn't let you edit the command, ask the panel admin to change it (or import the egg after all).
2. Pick a **Node.js 22** (or 24) Docker image on the same tab.
3. Start the server once. The first start downloads the bot, `yt-dlp` and the Node packages (a few minutes), makes a `.env` file and stops, asking you to fill it in.
4. In the **File Manager**, edit `.env`: at least `DISCORD_TOKEN`, `CLIENT_ID` and `OWNER_USER_ID`. Everything the MaowCore egg has on the Startup tab goes here (for example `DISCORD_CLIENT_SECRET`, `PANEL_PUBLIC_URL`). The dashboard port is the server's port, by itself.
5. Start it again. From then on every start updates the bot from GitHub, installs new Node packages when needed, and keeps `yt-dlp` up to date.

Updates follow `AUTO_UPDATE`: the egg's Startup variable of that name when it has one (Pterodactyl's Node.js egg calls it **Auto Update**, set it to `1`), else `AUTO_UPDATE=` in `.env`; when neither says, it updates. Likewise `GIT_ADDRESS` and `BRANCH`, defaulting to this repo's `main`.

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

## Dashboard https

On the panel the dashboard uses https by itself (**Dashboard https** = `auto`). The bot makes its own certificate on first start (`data/tls/selfsigned-*.pem`), renews it before it expires, and prints its SHA-256 fingerprint in the console.

- **The warning:** the certificate isn't from a company browsers trust, so they warn once ("Your connection is not private"). Click **Advanced > Proceed**. The connection is encrypted either way.
- **Use the server's IP address**, e.g. `https://203.0.113.5:25570`. If the panel's domain forces https (HSTS), browsers don't offer "Proceed" for any port on that domain.
- **Sign-in:** set **Dashboard public URL** to that same address and add `<that URL>/api/auth/discord/callback` in the Developer Portal. The certificate also covers the public URL's address.
- **`http://` links** on the same port are redirected to `https://`, so there's no "SSL protocol error".
- **Your own certificate:** upload `data/tls/cert.pem` and `data/tls/key.pem` (PEM). The bot uses them as they are and never replaces them.
- A trusted (padlock) certificate can't be made by the bot: Let's Encrypt needs port 80 or 443, which the panel server doesn't have. For that, put the dashboard behind the host's web server (nginx) on a subdomain.

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
  - `data/`, `cookies/`, `bin/` and `.env` are kept.
  - If GitHub can't be reached, the bot starts with the code it already has.
- The rest of each start is `deploy/pterodactyl/start.sh` in the repo:
  - it updates yt-dlp;
  - it starts the bot.
  
  Because the script lives in the repo, you can change it without re-importing the egg.
- After changing `install.sh` or the variables, rebuild the egg with `node deploy/pterodactyl/build-egg.js`.
