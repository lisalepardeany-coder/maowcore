# ◆ MaowCore

[![CI](https://github.com/lisalepardeany-coder/maowcore/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/lisalepardeany-coder/maowcore/actions/workflows/ci.yml)

A cosmic-themed Discord bot with **86 slash commands**, a **futuristic web dashboard**, a **Python desktop control panel**, a **Vencord plugin**, and a **browser extension**.

Music + moderation + auto-setup + smart features + multi-source streaming — all in one self-hostable bot.

---

## ✨ What it does

| Category | Highlights |
|---|---|
| 🎵 **Music** | Plays YouTube, Spotify, SoundCloud, internet radio, podcasts. Lyrics (synced + translation), audio filters (EQ, karaoke, speed/pitch, normalization), crossfade, queue persistence |
| 🛡 **Moderation** | `/setup` auto-creates channels + roles + audit log. Kick / ban / unban / softban / purge / lock / slowmode / warn / modlog. Automod with anti-spam, anti-raid, invite/link/word filters |
| 🪐 **Auto-setup** | One command creates the full server structure: cosmic-themed category, modlog, welcome, suggestions, voice rooms with stats counters, DJ + Moderator + Muted roles |
| 🎙 **Voice rooms** | Join "➕ Create Room" → auto-spawns a temp voice channel; deletes when empty |
| 📊 **Dashboard** | Self-hosted web UI at `http://127.0.0.1:8765/` with 12 pages: now-playing, queue, history, profile, stats, performance, console, settings, server, search, favorites, activity feed |
| 🪟 **Python GUI** | Cosmic-themed desktop control panel with album art, system tray, global hotkeys |
| 🧩 **Vencord plugin** | Now-playing widget inside Discord + right-click → "Queue in MaowCore" context menu |
| 🌐 **Browser extension** | Right-click any YouTube/Spotify/SoundCloud link → queue in MaowCore |
| 🎨 **Themes** | 6 dashboard palettes: Cosmic / Synthwave / Cyberpunk / Minimal / High-Contrast / Color-Blind Safe |

---

## ⚡ Quick start

### Option A — Docker (recommended; works on Linux, macOS, Windows)

```bash
# 1. Clone
git clone https://github.com/lisalepardeany-coder/maowcore.git
cd maowcore

# 2. Configure
cp .env.example .env
# Edit .env — fill in DISCORD_TOKEN, CLIENT_ID, and (optional) other tokens

# 3. Run
docker compose up -d

# 4. Visit the dashboard
# http://127.0.0.1:8765/
```

Logs: `docker compose logs -f` · Stop: `docker compose down` · Update: `git pull && docker compose up -d --build`

### Option B — Native install (Node.js + ffmpeg required)

#### Linux (Debian / Ubuntu / Fedora / Arch)

```bash
# Install Node 22+ and ffmpeg
sudo apt update && sudo apt install -y nodejs npm ffmpeg python3
# (Fedora: sudo dnf install nodejs npm ffmpeg python3)
# (Arch:   sudo pacman -S nodejs npm ffmpeg python)

git clone https://github.com/lisalepardeany-coder/maowcore.git
cd maowcore
cp .env.example .env
nano .env                  # fill in tokens
npm install
npm run deploy             # register slash commands
npm start

# Optional: auto-start on login via systemd user service
chmod +x scripts/install-startup.sh
./scripts/install-startup.sh
```

#### macOS

```bash
brew install node ffmpeg python3
git clone https://github.com/lisalepardeany-coder/maowcore.git
cd maowcore
cp .env.example .env       # then edit
npm install
npm run deploy
npm start
```

#### Windows

```powershell
# Install Node 22+:    https://nodejs.org
# Install ffmpeg:      winget install Gyan.FFmpeg
# (Optional) Python:   winget install Python.Python.3.12  # for the desktop GUI

git clone https://github.com/lisalepardeany-coder/maowcore.git
cd maowcore
Copy-Item .env.example .env
notepad .env               # fill in tokens
npm install
npm run deploy
npm start

# Optional: auto-start at logon via Task Scheduler
.\scripts\install-startup.ps1
```

---

## 🔑 Setting up credentials

You need **one required** + **three optional** API credentials, all free.

### Required: Discord bot token

1. Go to <https://discord.com/developers/applications>
2. **New Application** → name it
3. **Bot** tab → **Reset Token** → copy to `DISCORD_TOKEN` in `.env`
4. **Bot** tab → enable **MESSAGE CONTENT INTENT**, **SERVER MEMBERS INTENT**
5. **General Information** → copy **Application ID** to `CLIENT_ID` in `.env`
6. **OAuth2 → URL Generator** → check `bot` + `applications.commands`. Bot permissions: at minimum `Send Messages`, `Connect`, `Speak`, `Manage Channels`, `Manage Roles`, `Kick Members`, `Ban Members`, `Moderate Members`, `Manage Messages`. Use the generated URL to invite the bot.

### Optional: Spotify (for `/play <spotify-url>` and audio features)

<https://developer.spotify.com/dashboard> → Create app → copy **Client ID** + **Client Secret**.

### Optional: Genius (for `/lyrics`)

<https://genius.com/api-clients> → New app → "Generate Access Token" → copy to `GENIUS_TOKEN`.

### Optional: `GUILD_ID`

Set to your test server's ID for **instant** slash-command deployment. Without it, global deploys take up to 1 hour to propagate.

---

## 🧙 First-time setup

After the bot is online in your server:

```
/setup
```

This single command auto-creates:
- A **✦ MaowCore** category with `🎵-music`, `◆-now-transmitting`, `⌬-modlog`, `✧-welcome`, `💡-suggestions` channels
- A **🎙 Voice** category with a `➕ Create Room` trigger + 3 auto-updating stats voice channels
- Three roles: **DJ**, **Moderator**, **Muted**
- Wires the channel IDs into the bot's config so welcome embeds, modlog, stats, suggestions, and auto-voice-rooms all just work

Then:

```
/play <url or search>
```

…and you're rolling.

---

## 📊 The web dashboard

Open <http://127.0.0.1:8765/> in any browser.

| Page | What it shows |
|---|---|
| **Overview** | Live stats, mini-player, recent activity feed |
| **Now Playing** | Full album art, transport, queue with drag-drop, audio visualizer |
| **Search** | Type query → 10 YouTube results with thumbnails, Queue/Play-now buttons |
| **History** | Last 500 songs played with replay buttons |
| **Searches** | Every dashboard search you've made; one-click re-search |
| **Favorites** | Songs you've starred with `/favorite add` |
| **Server** | Channel browser (text grouped by category, voice with live member lists) |
| **Settings** | Theme picker, motion, 24/7, sponsorblock, default volume, idle timer, hide-requester, custom background, QR phone access |
| **Console** | Type slash-style commands directly (`play foo`, `skip`, `volume 80`) |
| **Performance** | CPU/RAM/Disk gauges, real-time line graph, system + process info, Discord cache stats, event loop lag |
| **Stats** | Top songs/artists, plays-by-hour, genre donut, time-range filters (All / Month / Week / Today) |
| **Profile** | Listening streak, current obsession, top requesters, 365-day heatmap |
| **Activity** | Filtered live log (info / plays / warnings / errors) |

Press **Cmd/Ctrl+K** anywhere for a command palette. **F** toggles fullscreen Now Playing.

### Phone access

By default the dashboard binds to `127.0.0.1`. To access from another device on the same network:

```bash
# in .env
CONTROL_HOST=0.0.0.0
```

Then point your phone browser at `http://<your-pc-LAN-IP>:8765/`, or scan the QR code in the dashboard's Settings page.

---

## 🪟 The Python desktop GUI (optional)

A standalone cosmic-themed control panel with system tray + global hotkeys.

```bash
cd gui
pip install -r requirements.txt
python control_panel.pyw       # or just double-click on Windows
```

Works on Windows, Linux, macOS. Closing the window minimizes to tray. Global hotkeys: F8 = pause/resume, F9 = skip, Ctrl+F10/F11 = volume −/+.

**Linux note:** the `keyboard` library needs root for global hotkeys. Either run as root or remove `keyboard` from `gui/requirements.txt` (rest still works).

---

## 🧩 Vencord plugin (optional)

Adds a floating Now Playing widget + right-click "Queue in MaowCore" inside the official Discord client.

```bash
# In your local Vencord checkout:
cp -r maowcore/vencord-plugin <vencord>/src/userplugins/maowcore
pnpm build
# Inject Vencord, restart Discord, enable in Vencord Settings → Plugins
```

Settings cog lets you change the WebSocket URL and toggle status sync.

---

## 🌐 Browser extension (optional)

Right-click any YouTube/Spotify/SoundCloud link on the web → "Queue in MaowCore".

**Chrome / Edge / Brave:**
1. Visit `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `browser-extension/` folder
4. Click the extension icon → set your bot URL

**Firefox:**
1. Visit `about:debugging` → **This Firefox** → **Load Temporary Add-on**
2. Select `browser-extension/manifest.json`

---

## 🐧 Linux deployment tips

- **Systemd:** the `scripts/install-startup.sh` script installs MaowCore as a **user** systemd service. To keep it running even when not logged in: `loginctl enable-linger $USER`.
- **Docker:** the included Dockerfile uses `node:22-bookworm-slim` and installs FFmpeg + Python. `CONTROL_HOST=0.0.0.0` is set automatically in the container so you can map the port however you like.
- **Logs:** `journalctl --user -u maowcore -f` for the native service, or `docker compose logs -f` for the container.
- **Working dir:** the bot reads/writes `./data/` for history, favorites, ratings, sessions. Mount it as a volume when using Docker so state persists across container rebuilds.
- **Reverse proxy:** point Nginx/Caddy at port 8765 if you want public dashboard access. **Don't expose it without auth** — the bot trusts WebSocket clients.

---

## 🛠 Commands

86 slash commands. `/help` lists them all inside Discord. Highlights:

- **Playback:** `/play /pause /resume /skip /previous /seek /stop /leave /247 /sleep /restore /undo`
- **Sources:** `/radio /radiosearch /podcast /sb /say /announce`
- **Queue:** `/queue /nowplaying /remove /shuffle /loop /favorite /timemachine /event`
- **Playlists:** `/save /load /myplaylists /deleteplaylist /share /importpl /quickset`
- **Audio:** `/volume /filter /eq /speed /pitch /karaoke /normalize /crossfade /autoplay /sponsorblock`
- **Intelligence:** `/lyrics /rate /tours`
- **Moderation:** `/kick /ban /unban /softban /timeout /warn /modlog /purge /lock /unlock /slowmode /role /nick`
- **Automod:** `/automod`
- **Server setup:** `/setup /welcome /welcomesound /statschannels /reactionrole`
- **Utility:** `/userinfo /serverinfo /avatar /poll /tag /suggest /remind`
- **Bot config:** `/dj /alias /personality /language /backup /import /reload`

---

## 📦 Project structure

```
maowcore/
├── index.js              # main bot entry
├── deploy-commands.js    # registers slash commands with Discord
├── commands/             # 86 slash command modules
├── events/               # Discord client event handlers
├── lib/                  # shared modules (config, history, automod, etc.)
├── public/               # web dashboard (HTML, CSS, JS, service worker)
├── gui/                  # Python desktop control panel
├── vencord-plugin/       # Vencord plugin source
├── browser-extension/    # Chrome/Firefox extension
├── scripts/              # install-startup scripts (Linux + Windows)
├── data/                 # runtime state (gitignored)
├── Dockerfile
├── docker-compose.yml
└── .env.example          # template for your secrets
```

---

## 🩹 Troubleshooting

**"Failed to find any playable formats"** — yt-dlp is outdated. Run `node scripts/patch-ytsr.js` or reinstall with `npm install` (the postinstall hook auto-patches).

**"Cannot connect to the voice channel after 30 seconds"** — usually missing FFmpeg or libsodium. The bot ships with `ffmpeg-static` + `libsodium-wrappers` so this should be rare. If it persists, install system FFmpeg.

**Dashboard says "connecting…" forever** — Hard-refresh (Ctrl+Shift+R). If still stuck, open DevTools → Application tab → **Clear site data** (kills the stale service worker).

**Bot can't moderate users** — Make sure the bot's role is positioned **above** the roles it needs to moderate, and that the OAuth invite included the required permissions.

**`MaxListenersExceededWarning` on startup** — fixed (the bot calls `setMaxListeners(30)` on DisTube). If you still see it, something's hooking events outside `index.js`.

**Slash commands don't appear** — Re-run `npm run deploy`. If you set `GUILD_ID`, they appear instantly in that guild only. Without `GUILD_ID`, global deploy takes up to 1 hour.

---

## 📜 License

MIT. Do whatever — fork, modify, deploy. Attribution appreciated but not required.

---

## 💜 Credits

Built with [discord.js](https://discord.js.org), [DisTube](https://distube.js.org), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [lrclib.net](https://lrclib.net), [SponsorBlock](https://sponsor.ajay.app), [Genius](https://genius.com), and [Bandsintown](https://www.bandsintown.com).

Made with cosmic violet and electric cyan. ✦
