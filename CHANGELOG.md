# Changelog

All notable changes to MaowCore are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] — 2026-05-25

Maintenance + quality-of-life release. Three review passes turned up 22 real
bugs across commands, lib modules, and the dashboard; this release fixes them
all, adds three new operator-friendly features, and ships a 48-test suite so
regressions can't sneak back in.

### Added

- **Self-generated invite link** (`lib/invite.js`, `commands/invite.js`)
  - OAuth2 URL builder centralized so the console banner, `/invite` slash
    command, and dashboard button all stay in sync.
  - Permissions bitfield enumerates the 22 specific perms the bot uses;
    Administrator is explicitly NOT requested.
  - Surfaces in **four** places: console banner on startup, `/invite` slash
    command (ephemeral reply with clickable button), dashboard Settings →
    Invite link card (Copy + Open ↗ buttons), Cmd+K palette entry.
  - New `/api/invite` REST endpoint returns `{ url, botTag }`.
- **Auto-deploy slash commands** (`lib/command-deploy.js`)
  - Discord global commands can take up to 1 hour to propagate to newly
    joined servers. We now push to the guild-scoped endpoint on `ClientReady`
    and on every `GuildCreate` — commands appear **instantly**.
  - SHA-256 hash of the commands payload is cached per-guild on disk
    (`data/command-deploy.json`) so unchanged restarts skip redundant API
    calls.
  - `GuildDelete` drops the guild's hash to keep the cache tidy.
  - Opt out with `AUTO_DEPLOY_COMMANDS=false` in `.env`.
- **Graceful shutdown** (`index.js`)
  - `SIGINT` (Ctrl+C) and `SIGTERM` (`kill <pid>` on Unix) now leave voice
    channels and call `client.destroy()` cleanly. Discord receives a proper
    WebSocket close frame and marks the bot offline **immediately**,
    instead of waiting ~30–45s for the heartbeat to time out.
  - 5-second hard-timeout fallback so a hung close can't block forever.
  - Caveat on Windows: `Stop-Process` / Task Manager are equivalent to
    `kill -9` and bypass these handlers. **Use Ctrl+C in the bot's terminal**
    to trigger graceful shutdown on Windows.
- **48-test suite** (`test/`)
  - Uses Node's built-in `node:test` runner — no devDependency.
  - Runs in ~2 seconds via `npm test`.
  - Coverage: lib helpers, control-server validation, invite URL,
    command-deploy cache, ytsr patch idempotence.

### Fixed

#### Audio pipeline

- **`eq` / `pitch` / `speed`**: filter strings now stored under per-guild
  slots (`_eq_${guildId}` etc.). Pre-fix they used a single global slot, so
  two guilds with different EQ presets clobbered each other.
- **`sleep-timer cancel()`**: also clears the `fadeKickoff` setTimeout.
  Pre-fix, canceling before the fade kicked off left an orphan that would
  later trigger a mysterious volume drop on a queue the user thought was
  cleared.

#### Commands

- **`/dedicate`**: dedication passed via DisTube `metadata` and hoisted onto
  the song in `addSong` / `playSong`. Pre-fix it attached to
  `queue.songs[last]` after `play()` resolved, which was racy when other
  plays interleaved.
- **`/lock all` / `/unlock all`**: `deferReply` so iterating 50+ channels
  doesn't blow past Discord's 3-second interaction window.
- **`/radiosearch`**: stream URLs are now stashed in a per-message Map
  keyed by short ID (`r0`..`r9`). Pre-fix, URLs >100 chars (Discord's
  option-value limit) caused the interaction reply to reject entirely
  with error 50035.
- **`/reactionrole`**: validates role hierarchy + rejects `@everyone` +
  rejects managed roles, with clear error messages.
- **`/share`**: playlist names sanitized to filesystem-safe characters for
  the attachment filename.
- **`/quiz`**: four `interaction.channel.send()` calls now have `.catch()`.
  Pre-fix, rate-limit rejections surfaced as `UnhandledPromiseRejection`.

#### Lib modules

- **`automod` link filter**: matches **every** URL in a message via `/g` +
  `matchAll`. Pre-fix, `[allowed.com] [malware]` passed because only the
  first URL was inspected.
- **`config.getGuild()` / `updateGuild()`**: guard against `null`/
  `undefined` IDs. Pre-fix, JS coerced them to string keys (`'null'`,
  `'undefined'`) that got persisted to disk forever.
- **`reminders.load()`**: resets `state` on a `JSON.parse` returning `null`,
  matching the defensive pattern in `config`/`history`/`session`.
- **`sponsorblock` cache**: bounded FIFO at 300 entries with recency bump on
  re-insert. Pre-fix was unbounded — months of unique videos grew the map
  forever.
- **`spotify-features`**: failed fetches cached with 30-minute TTL. Spotify
  removed `/v1/audio-features` for new apps in late 2024; pre-fix every
  play hammered the dead endpoint.
- **`tts`**: `lang` validated against a BCP-47 subset regex; garbage values
  fall back to `en` and are URL-encoded. Pre-fix `lang=en&foo=bar` injected
  raw into the query string.
- **`undo`**: the TTL `setTimeout` removes its own entry from `TIMERS` when
  it fires naturally — was leaving dead Map entries that accumulated over
  months.

#### Dashboard

- **6 XSS gaps**: raw thumbnail / icon URLs interpolated into `innerHTML`
  now run through `escapeHtmlSafe`. Defense-in-depth — a quote in a URL
  no longer breaks out of the `src` attribute.
- **Multi-guild routing**: `firstQueue()` returns the queue for the
  dashboard-selected server (was always `state.queues[0]`); `send()` pins
  the `guildId` so transport commands target the right guild.
- **Fullscreen hotkey**: accepts both `f` and `F`. Pre-fix only Shift+F
  triggered fullscreen.
- **`safeNum()`** guards on `volume` / `seek` / `loop` / `queue_move` —
  rejects `NaN`, clamps to valid ranges. Pre-fix, `queue_move` with `NaN`
  would `splice(0, 1)`, yanking the currently-playing song.
- **`set_config` allowlist**: only 11 specific keys writable via the
  generic dashboard action (`stay247`, `sponsorblock`, etc.). Pre-fix,
  the action accepted any key — including `automod`, `playlists`, etc.

#### Index / event handlers

- **5 missing `.catch()`** on DisTube event-handler `textChannel.send()`
  calls — rate-limit rejections no longer surface as
  `UnhandledPromiseRejection`.
- **`automod.checkRaid()`** called with correct arity (was passing
  `(guild, member)` to a `(guild)` function — second arg silently ignored).
- **Console banner** updated with a "Press Ctrl+C to stop cleanly" hint.

#### Build / postinstall

- **`@distube/ytsr 2.0.4`** patched in postinstall (`scripts/patch-ytsr.js`)
  to add optional chaining on `browseEndpoint` in `lib/parseItem.js`.
  YouTube's current response shape sometimes omits that field for certain
  channel types, causing every `/play` search to crash with
  `Cannot read properties of undefined (reading 'canonicalBaseUrl')`.
  Patch is idempotent — re-running on patched source is a no-op.

### Removed

- The unfinished synced-karaoke scaffolding (`lib/lrclib.js` deleted;
  `lrclib` mentions stripped from the `help` footer and README credits).

### Upgrade

```bash
git pull
npm install   # postinstall reapplies the ytsr patch
npm start     # auto-deploys commands to every guild
```

If you previously ran `npm run deploy` with `GUILD_ID` set, your bot was
missing commands in every other server. Auto-deploy fixes that the next
time you start the bot — no manual action needed.

[Unreleased]: https://github.com/lisalepardeany-coder/maowcore/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/lisalepardeany-coder/maowcore/compare/136eea4...v1.1.0
