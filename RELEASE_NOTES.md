# MaowCore 3.5.0: one bot again

MaowCore had grown in two places at once: on the home PC and here on GitHub.
3.5.0 puts both together, so every feature from either side is in this release.

## Highlights

- **Runs on Pterodactyl.** Import `deploy/pterodactyl/egg-maowcore.json`, fill in
  the bot token and application ID, and start. The server keeps itself up to date
  from GitHub on every start.
- **YouTube works on servers too.** Drop a `cookies.txt` in the `cookies/` folder
  (or upload it in the Control room) when YouTube asks you to sign in.
- **Both dashboards.** The new dashboard is at `/`, and the classic one with the
  Control room, listen room and themes is at `/dashboard.html`.
- **Everything from both sides:** automod v2 with scam and raid protection,
  leveling, economy, community features, modmail, setup templates, plus pets,
  routines, reminders, mood DJ, song radio, ambience, the status monitor and
  MaowCore Portable.

## Upgrading

- **Pterodactyl:** update the egg (Admin > Nests > MaowCore > Update egg),
  make sure **Update on start** is `1` on your server, then restart.
- **Windows / MaowCore Portable:** pull or download this version and run
  `npm install`.
- **Docker:** `git pull && docker compose up -d --build`.

Your `data/` folder, `.env` and cookies are not touched by updating.

## Good to know

- There are 117 slash commands. Discord allows 100 per server, so the rest are
  registered globally (servers only). They can take a few minutes to appear
  the first time.
- Automod settings saved by either version keep working. If you set up both
  warning punishments (the escalation ladder and `/warn rules`), only one acts
  per warning.

Full list of changes: see CHANGELOG.md.
