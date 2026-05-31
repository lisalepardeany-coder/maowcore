# Changelog

All notable changes to MaowCore are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.1.3] — 2026-06-01

The bottom mini-dock is gone — replaced entirely by the topbar chip.

### Changed

- **Removed the bottom-right floating mini-dock.** The topbar now-playing
  chip from v3.1.2 covers the same need without the duplication. Old
  dock DOM stays (force-hidden via `.mini-dock { display: none !important }`)
  so any legacy JS that pokes `dock-title` / `dock-thumb` / `dock-bar`
  still no-ops cleanly.
- **Topbar chip is bigger.** Was 36 px tall and 320 px max; now 42 px
  and 380 px max (440 px when sidebar collapsed). Title font bumped
  from 12 → 13 px, thumb from 26 → 32 px. Reads at a glance instead
  of looking like a footnote.
- **Hairline progress bar** across the bottom edge of the chip — same
  info as the old dock's bar but unobtrusive. 600 ms `transition: width`
  so it animates smoothly between state ticks.

## [3.1.2] — 2026-06-01

Persistent now-playing chip in the topbar — see what's playing from any
page without having to navigate back to Home.

### Added

- **Topbar now-playing chip** — appears next to the MaowCore brand
  whenever a song is playing. Shows ▶/⏸ icon, 26×26 thumbnail (when
  available), song title (truncated with ellipsis), and requester +
  duration sub-line. Click to jump to Home.
- Hard width cap (320 px desktop, 220 px tablet, 160 px mobile) so the
  chip can't shove the rest of the topbar (instance picker, diag chip,
  server select, login button) off-screen.
- Responsive shrinking: the sub-line hides under 1100 px viewport,
  the thumbnail hides under 800 px. With the sidebar collapsed, the
  chip gets a wider 360 px cap since the topbar has more room.
- Auto-hides when nothing's in the queue (no awkward placeholder).
- Pause state gets a subtle 70% opacity dim + ⏸ icon swap.

### Notes

- Reuses the existing `state.queues[].currentSong` data that already
  flows over WebSocket — no new backend work, no extra payload.
- The mini-dock at the bottom-right still works as before; the topbar
  chip is an addition for at-a-glance visibility on every page.

## [3.1.1] — 2026-06-01

In-dashboard DB browser + a pre-existing date-bucket bug fix exposed
by the new SQLite test suite.

### Added

- **Database browser** on the Developer page (`⌨ Developer`).
  - Left column: list of tables with row counts. Click to load the
    table's first 100 rows.
  - Right column: SQL textarea + Run button + result table.
  - **Read-only by default.** Mutating SQL is gated behind a confirm
    dialog that warns about WAL-lock conflicts when the bot is running.
  - Results capped at 1000 rows so a runaway SELECT can't ship gigs.
  - `Ctrl+Enter` runs the query.
- Two new endpoints: `GET /api/dev/db/tables`, `POST /api/dev/db/query`.
- `scripts/db-shell.js` — CLI alternative (interactive SQL REPL).
  Run with `npm run db-shell`.

### Fixed

- **`history.byDay` was using `toISOString()` for date keys** but
  `today.setHours(0,0,0,0)` for the bucket-start times. Mixing UTC date
  strings with local-time midnight produced wrong day labels for
  anyone not in UTC (e.g., a Berlin user's "today" bucket landed on
  yesterday's UTC date). Now uses consistent local-time YYYY-MM-DD
  formatting via a `dateKey()` helper. Affects the Listening heatmap
  on the Insights page.

## [3.1.0] — 2026-06-01

**SQLite migration** — economy, social, sessions, and history now back to
a real database (`better-sqlite3`). Fixes race conditions, gives indexed
queries on leaderboards/heatmaps, and adds proper transactions. Fully
backward-compatible: JSON files auto-migrate on first boot, and the bot
falls back to JSON if `better-sqlite3` fails to compile.

### Added

- **`lib/db.js`** — single shared SQLite connection at `data/maow.db`
  (override via `DB_PATH` env). WAL mode for concurrent readers,
  `synchronous=NORMAL` for the durability sweet spot, versioned
  schema migrations stored in `_meta.schema_version`.
- **Schema v1** — 12 tables covering guild config, history, sessions,
  economy users + shop, social profiles + ratings, crons, webhooks,
  rules, custom commands, playlist subs. Proper indexes on the hot
  query paths (history by `(guild_id, ts DESC)`, ratings by song
  name, economy leaderboard by `(guild_id, level DESC, xp DESC)`).
- **Auto-migrator** (`scripts/migrate-to-sqlite.js`) — runs on first
  boot, imports legacy JSON files into SQLite inside one transaction,
  renames old files to `*.json.pre-v3.1` (NOT deleted — easy rollback).
  Idempotent: skips tables that already have data.
- **`better-sqlite3`** as optional dependency. If native compile fails,
  every refactored module falls back to its v2.x JSON path
  automatically. No breakage on hosts without build tools.
- **`db.tx(fn)`** — wrap any callback in a transaction; rolls back on
  throw. Used by `economy.award`/`spend` to fix concurrent-write races.
- **`db.backup()`** — uses better-sqlite3's online backup API.
- **`backup.js` snapshot format v2** — now includes the SQLite db
  base64-encoded under `binaries['maow.db']`. v1 snapshots still
  restore correctly (db file just isn't restored).

### Changed

- **`lib/economy.js`** — SQLite path uses transactions for `award` +
  `spend`, eliminating the concurrent-write race that could lose
  half a user's coins under load. Leaderboard now uses
  `ORDER BY ... LIMIT` against an index (O(log n) instead of O(n)
  load + sort + slice).
- **`lib/social.js`** — `topRated` uses SQL `GROUP BY` + indexed
  aggregation. Big servers with thousands of ratings: orders of
  magnitude faster.
- **`lib/history.js`** — `record` is now an indexed insert + trim;
  `list` is an indexed range scan; `byDay` is a `WHERE ts >= ?`
  scan instead of loading the whole guild's history.
- **`lib/dashboard-auth.js`** — sessions read/write to SQLite when
  available; capping logic uses `DELETE … ORDER BY created_at`.

### Notes

- 9 new tests for the DB layer + module SQLite paths (94 total,
  85 passing in current env — 9 skipped because better-sqlite3 isn't
  installed in the test environment yet). Tests use a temp DB so they
  never touch operator data.
- Modules NOT migrated this release (still JSON):
  `automation`, `custom-commands`, `playlist-subs`. Empty SQLite
  tables exist for future v3.2+ — migrating them now without a
  matching runtime would create two sources of truth.
- Rollback path: stop the bot, `mv data/*.json.pre-v3.1 data/`,
  `rm data/maow.db`, restart. Bot reverts to v3.0 JSON behavior.
- Run `npm run install-native` to get the native libs compiled if you
  haven't already.

## [3.0.0] — 2026-06-01

**Major version — production polish.** Pulls the loose ends together
into a self-hosted-ready release.

### Added

- **Observability + alerting** (`lib/observability.js`) — every
  error-level log entry feeds an in-memory error budget (default:
  ≤10 errors per 5-min window). Set `ALERT_WEBHOOK_URL` to a Discord
  webhook URL and budget breaches POST a styled embed there with
  top categories + recent samples. Cooldown: 5 min between alerts
  to avoid flooding.
- New endpoints: `GET /api/observability/status` (budget +
  burn-rate), `POST /api/observability/alert` (fire a manual alert).
- New env vars: `ALERT_WEBHOOK_URL`, `ERROR_BUDGET_5MIN` (default 10).

### Notes

PWA shell, service worker, install-as-app, multi-bot, OAuth,
moderation suite, library install, automation, economy, server
templates — everything we built across v1.6.0–v2.7.0 ships as a
coherent self-hosted product. See the version-by-version notes below
for what each tag adds.

This is a logical milestone, not a breaking change. v2.x setups work
unchanged; the new alert pipeline is opt-in via `ALERT_WEBHOOK_URL`.

## [2.7.0] — 2026-06-01

Game night minigames + server templates.

### Added

- `lib/game-night.js` — in-memory game sessions: quiz (multiple-choice
  questions with score tracking), name-that-tune (random library
  songs + plausible distractor choices), submit/next/end controls.
- `lib/server-templates.js` — full guild-config export/import as a
  single portable JSON. Includes welcome / automod / reaction-roles /
  quick-playlists / modlog channel / locale / custom commands / shop
  items. Channel IDs are opt-in (they're server-specific by default).
- `🎮 Game night` and `⌬ Server template` sidebar pages.
- Endpoints: `GET /api/game/sessions`, `GET /api/templates/build`,
  `POST /api/templates/apply`.

## [2.6.0] — 2026-06-01

Engagement features — server economy + no-code custom commands.

### Added

- `lib/economy.js` — per-server currency (coins), XP/level system
  (quadratic curve), shop items, achievements. Award/spend/leaderboard
  APIs.
- `lib/custom-commands.js` — no-code command template editor. Tokens:
  `{user}`, `{server}`, `{arg1}…{arg5}`, `{random:a,b,c}`. Stored
  per-guild, runnable from the dashboard (Discord registration
  reserved for v3.0).
- `◈ Economy & levels` page — leaderboard, shop with add/remove,
  per-user stats.
- `⚒ Custom commands` page — list / create / delete / run-to-test.
- Endpoints: `/api/economy/{leaderboard,me,shop,spend,shop/add,
  shop/remove}` and `/api/custom-cmds/{list,add,remove,run}`.

## [2.5.0] — 2026-06-01

Power-user automation — cron + webhooks + conditional rules.

### Added

- `lib/automation.js` — single module covering all three primitives:
  - **Cron actions** with 5-field expressions (`m h dom mon dow`,
    steps `*/5`, ranges `1-5`, lists `0,15,30,45`). Tick every 20s.
  - **Incoming webhooks** — each gets a 32-char secret. POST to
    `/api/automation/hook/<secret>` fires the configured action.
  - **Event-based rules** — `voice-join`, `voice-leave`, `play-end`,
    `queue-empty`. (Wiring of rule triggers to DisTube/voice events
    arrives as the actions surface in the codebase; module ready now.)
- `⏰ Automation` page — three cards (crons / webhooks / rules) with
  add / toggle / remove flows.
- Action types: `{ type: 'console', line: '...' }` runs a dashboard
  console command (the same flow that powers `/play`, `/skip`, etc.).
- Endpoints: `/api/automation/{list,cron/add,cron/remove,cron/toggle,
  webhook/add,webhook/remove,rule/add,rule/remove,hook/:secret}`.

## [2.4.0] — 2026-06-01

Music Wrapped — Spotify-Wrapped-style yearly summary.

### Added

- `lib/wrapped.js` — pure aggregation over history: total plays,
  listening hours, unique tracks/artists, discovery percentage,
  longest day-streak, peak hour-of-day + day-of-week, top tracks &
  artists, per-month breakdown.
- `★ Music Wrapped` page — six-tile summary header + Top Tracks /
  Top Artists side-by-side. Year selector (auto-populates from
  history) with "Last 365 days" as the default.
- Endpoints: `GET /api/wrapped?guildId=…&year=…`,
  `GET /api/wrapped/years?guildId=…`.

## [2.3.0] — 2026-06-01

Disaster recovery + community sharing.

### Added

- **Backup system** (`lib/backup.js`) — daily auto-snapshots (5 min
  after boot, then every 24h, retains last 14). Snapshot is a single
  JSON file under `data/backups/` containing manifest, config,
  history, sessions, social, subscriptions, library config. One-click
  restore + delete + manual snapshot from the dashboard.
- **Marketplace** (`lib/marketplace.js`) — portable JSON bundles of
  playlists / automod rules / welcome templates. Export current config
  to a downloadable file, import from URL, save locally for re-use.
  Local-first: no central server, share however you want (Discord
  file, gist, pastebin).
- **⎘ Backup & Share** sidebar page (under System) with both
  snapshot list and marketplace bundle list, plus actions.
- 9 new endpoints: `/api/backup/{list,create,restore,delete}` +
  `/api/market/{list,export,save,import,delete,fetch}`.

### Notes

- Snapshots do NOT include audio files (too large). They reference
  them by filename so restored manifests will list any orphans the
  operator needs to re-download.
- Restore overwrites current state — bot restart strongly recommended
  after.
- Bundles use `bundleVersion: 1` schema. Future versions will preserve
  back-compat.

## [2.2.0] — 2026-06-01

External integrations + i18n + dev tooling.

### Added

- **Last.fm scrobbling** — `lib/integrations.js`. Set `LASTFM_API_KEY` +
  `LASTFM_API_SECRET` + `LASTFM_SESSION_KEY` to enable. Updates Now
  Playing on every track start, scrobbles after the track is halfway.
- **Cross-service search URLs** for any track on YouTube Music,
  Spotify, Apple Music, SoundCloud, Bandcamp, Last.fm.
- **Plugin loader** (`lib/plugin-loader.js`) — drops in
  `plugins/<name>/index.js` exporting `{ id, name, version,
  slashCommands?, wsActions?, httpRoutes?, onLoad? }`. Loaded
  automatically at boot.
- **⌨ Developer page** — REST API endpoint catalog with filter,
  loaded-plugin list, integration status grid.
- **Dashboard i18n** — EN / ES / FR / DE language picker in the
  topbar. `t(key)` helper for translatable strings. Reloads on
  change for simplicity.
- **High-contrast theme** — body class `high-contrast` for an
  accessibility-friendly black-on-white style.
- 4 new endpoints: `/api/integrations/status`,
  `/api/integrations/search-urls`, `/api/dev/endpoints`,
  `/api/dev/plugins`.

## [2.1.0] — 2026-06-01

Social features (Discord OAuth) + library cleanup wizard.

### Added

- **Discord OAuth** — `Sign in with Discord` button in topbar. Set
  `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` env vars to enable.
  Sessions persist 30 days, stored in `data/sessions.json`. Without
  config, login UI silently hides.
- **♥ Social page** — top listeners leaderboard (derived from
  history), top-rated tracks, your editable profile (bio + favorite
  song).
- **Song rating** API (1–5 stars + optional note) backed by
  `lib/social.js`. Stored per-guild, per-user, per-song name.
- **🧹 Cleanup page** — scan finds: orphan files on disk not in
  manifest, duplicates by source URL or display name, unplayed
  >180 days, missing durations. Storage breakdown by format.
  Show + confirm-each model: nothing gets deleted without an
  explicit click + confirm. Re-probe button for missing durations.
- New modules: `lib/dashboard-auth.js`, `lib/social.js`,
  `lib/library-cleanup.js`.
- 9 new endpoints: `/api/auth/discord/start|callback`, `/api/auth/me`,
  `/api/auth/logout`, `/api/social/{profile,leaderboard,top-rated,
  ratings,rate}`, `/api/library/cleanup/{scan,delete-orphans,probe-missing}`.

## [2.0.0] — 2026-06-01

**Major version — multi-bot platform.** MaowCore can now drive multiple
bot instances from a single dashboard. Each instance runs the same
code with its own `.env`; the dashboard is the hub, routing every API
call to the active instance via Bearer-token authentication.

### Breaking-ish

- Control server now **honors `CONTROL_TOKEN` env var**. When set,
  every API + WS request requires `Authorization: Bearer <token>`
  (or `?token=…` query param for WS). Without the env var, the
  server runs in **legacy open mode** — existing v1.x setups keep
  working unchanged. Static dashboard files always serve un-authed
  so the operator can load the dashboard and configure instances.
- Static-file 404 fallback unaffected. The `fetchJson` client-side
  helper recognizes 401 responses and shows a clear "wrong token"
  message instead of a JSON parse error.

### Added

- **Instance registry** — dashboard stores configured instances in
  `localStorage` (`maow.instances`): each entry has id / name /
  control-server URL / Bearer token. Default on first load: one
  "This bot" instance pointing at `location.origin` with no token
  (= legacy single-bot behavior).
- **Topbar instance picker** — chip showing the active instance with
  a live health dot (green/amber/red). Clicking it opens a popover
  list of all configured instances with per-instance health, switch
  on click, inline ✎ Edit, "+ Add instance" footer.
- **Instance add/edit modal** — name + URL + Bearer token form with
  a **⚡ Test connection** button that calls the new `/api/health`
  endpoint, verifies the token works against an auth'd endpoint,
  and shows a friendly status (✓ ok / ▲ wrong token / ▲ unreachable).
- **⊞ Fleet sidebar page** — grid of cards, one per configured
  instance, each showing bot tag, version, latency, health status.
  Click a card to switch the dashboard to that instance.
- **`/api/health` un-authed endpoint** — returns `{ name, botTag,
  version, startedAt, authRequired }` so the dashboard can probe
  liveness without holding a token yet.
- **CORS headers** on every response so cross-instance dashboard
  requests work across origins.
- **Per-instance health probes** — dashboard probes every configured
  instance every 15s via `/api/health`, caches status + latency,
  surfaces results in both the picker and the Fleet page.
- **Visual polish pass** — page-fade transition on instance switch
  (180ms opacity), skeleton-loader `.skel` class with shimmer
  animation available for future loading states, animated instance-
  picker chip dot.
- **Reliability pass** — `fetchJson` now retries once on transient
  network failure (400ms delay between attempts) so brief instance
  restarts don't blow up the UI. 401 responses produce a clear
  "Check the Bearer token on this instance" error.

### Notes

- 83 tests still pass — no new tests for the multi-bot UI (browser-
  state + cross-origin behavior).
- Sidebar gains a `⊞ Fleet` entry between Home and the Content group.
- To wire up a second bot: set `CONTROL_TOKEN=<some-secret>` in each
  bot's `.env`, expose its port, then on the dashboard click the
  topbar instance chip → + Add instance → name + URL + token →
  Test connection → Save.
- The bot itself doesn't change behavior in single-instance mode —
  same code, same defaults. v2.0.0 is additive: existing operators
  can ignore the multi-bot features and everything works as before.

## [1.9.0] — 2026-06-01

A server-admin polish + music-UX release — surface the welcome/farewell
and reaction-roles backends with proper visual editors, add a listening
heatmap and auto-subscribed playlists, and make the queue panel
properly interactive (drag-reorder, remove, save-as-playlist).

### Added

- **Welcome / Farewell builder** (`✦ Welcome` sidebar item) — channel
  picker, message templates with `{user}` and `{server}` token
  substitution, join/leave sound URL fields, and a **live preview**
  that renders the same embed shape as Discord would, updated as you
  type. Save persists to per-guild config; Revert reloads.
- **Reaction roles editor** (`❉ Reaction roles`) — visual editor for
  the existing `/reactionrole` backend. Create new mappings with
  channel + role + emoji + title pickers; the bot posts the embed and
  reacts with the emoji. Active mappings list shows the message ID,
  bot-side role/color, and a stale flag if the role was deleted.
  Inline ✕ Remove.
- **Listening heatmap** on Insights — GitHub-contribution-graph-style
  365-day grid colored by plays per day. Cell tooltips show the date
  and play count; legend at the bottom. Derived from existing
  `lib/history.js` data via a new `byDay()` helper.
- **Auto-subscribed playlists** — new `lib/playlist-subscriptions.js`
  module that polls subscribed YouTube/SoundCloud/Bandcamp playlist
  URLs on a configurable interval (1–168 h) and auto-installs new
  tracks via the existing install pipeline. UI on the Library →
  Uploads tab: list, add (URL + name + format + interval), force-sync,
  remove. Last sync time, next sync time, and last error are shown
  per subscription. State persists to `<LIBRARY_DIR>/_subs.json`.
- **Queue editor enhancements** on the Home page:
  - **Per-row ✕ remove** button (appears on hover)
  - **💾 Save as playlist** toolbar above the queue (saves all upcoming
    URLs as a named playlist under your Discord user ID, persisted to
    localStorage for next time)
  - Existing drag-to-reorder still works — backend now accepts both
    legacy `queue_move` and new `queue_reorder` action names
  - Drag handle visually indicated by `⋮⋮` on the left of each row
- **8 new API endpoints** + 3 new WS actions:
  - `GET  /api/admin/welcome?guildId=…`
  - `POST /api/admin/welcome`
  - `GET  /api/admin/reaction-roles?guildId=…`
  - `POST /api/admin/reaction-roles/create`
  - `POST /api/admin/reaction-roles/delete`
  - `GET  /api/admin/playlist-subs`
  - `POST /api/admin/playlist-subs/{add,update,remove,sync}`
  - `GET  /api/admin/heatmap?guildId=…&days=…`
  - WS actions: `queue_remove { index }`, `queue_reorder { from, to }`,
    `queue_save_as_playlist { name, userId }`

### Changed

- The control-server constructor now boots a **background scheduler**
  for playlist subscriptions — ticks every 5 minutes, kicks off due
  syncs. The timer is `unref`'d so it doesn't prevent process exit.
- Sidebar `Servers` group gains two new entries (Welcome, Reaction
  roles) under the existing Overview/Members/Channels/Roles.

### Notes

- 83 tests pass — no new tests added for the network-bound endpoints.
- The auto-subscription scheduler kicks off ~10s after boot to give
  the bot time to settle; subsequent ticks run every 5 minutes
  regardless of how many subscriptions exist.

## [1.8.0] — 2026-05-31

A server-admin upgrade — three new dashboard pages for browsing members,
channels, and roles with execute-grade actions, a restructured sidebar
with collapsible categories, and an on-demand speedtest on the Network
panel.

### Added

- **Sidebar restructure** — nav items grouped under collapsible category
  headers (Content / Servers / System) with `Home` and `Moderation`
  staying flat. Collapsed state is per-category and persisted to
  localStorage so each user keeps the structure they prefer. Sub-page
  nav items are visually nested and a tick tighter than the top-level
  entries.
- **Members page** (`👥 Members`) — paginated guild member browser:
  search by tag / display name / ID, 25/50/100 per page with smart
  pagination, role badges per row colored by role color, voice-channel
  indicator (🔊) when the member is connected, bot tag for bots, and
  three inline mod actions per row (⏱ Timeout / 👢 Kick / ⊘ Ban) with
  confirm dialogs and reason prompts. Reads from the `GuildMembers`
  intent cache; shows a banner when the cache is smaller than
  `guild.memberCount` so you know which members aren't loaded.
- **Channels page** (`# Channels`) — list grouped by category in
  Discord's display order. Per-channel symbols (#, 🔊, 🗂, 📢) by type,
  inline NSFW / slowmode badges, and an **✎ Edit** button that walks
  through name → topic → slowmode (0–21600s clamp) → NSFW prompts
  and patches the channel via discord.js.
- **Roles page** (`▦ Roles`) — list ordered by position with color
  swatches, member count, `managed` tag for bot/integration roles.
  **+ Create role** + **✎ Edit role** modal with name + color picker
  + hoist + mentionable toggles + a **permission editor** with the 21
  most-used permission bits. Delete button hidden for managed roles
  (Discord forbids it). All mutations go through new admin endpoints.
- **Speedtest** on the Network panel — **⚡ Run speedtest** button
  spawns `librespeed-cli` (preferred, MIT-licensed) and falls back to
  `speedtest-cli` if available. Results stream back over WebSocket
  and render as download / upload / ping tiles with tool + server +
  ISP metadata. Cached between runs; a "no speedtest tool found"
  message appears on hosts without either binary installed.
- **9 new admin API endpoints**:
  - `GET  /api/admin/members?guildId=…&page=…&perPage=…&search=…`
  - `GET  /api/admin/channels?guildId=…`
  - `POST /api/admin/channel-edit` `{ channelId, name, topic, slowmode, nsfw }`
  - `GET  /api/admin/roles?guildId=…`
  - `POST /api/admin/role-create` `{ name, color, hoist, mentionable, permissions }`
  - `POST /api/admin/role-edit` `{ roleId, … }`
  - `POST /api/admin/role-delete` `{ roleId }` (rejects managed roles)
  - `GET  /api/admin/speedtest` (cached result)
  - `POST /api/admin/speedtest` (run a fresh test, broadcasts result via WS)

### Notes

- 83 tests pass — no new tests added for the admin endpoints since they're
  network-bound to Discord and the speedtest depends on host binaries.
- Sidebar collapse state is independent of the existing
  `sidebar-collapsed` icon-rail mode (which still works the same way).
- Channel-edit slowmode is clamped to Discord's limits server-side
  (0–21600 seconds = 0 to 6 hours).

## [1.7.0] — 2026-05-31

A moderation suite — a dashboard-side replacement for typing `/ban`,
`/kick`, `/timeout`, `/warn` repeatedly. Every action confirms before
firing, hits the Discord API, and posts to the configured modlog
channel + the diagnostics console.

### Added

- **New `⚖ Moderation` sidebar page** with six tabs:
  - **Bans** — live guild ban list (`guild.bans.fetch()`), search by tag /
    ID / reason, inline `↺ Unban` (confirmed), `+ Ban a user` modal (user
    ID + reason + days of recent messages to delete).
  - **Kicks / Timeouts** — quick-action form: user ID, action picker
    (kick or timeout), preset durations (1m / 5m / 1h / 1d / 7d), reason.
    Timeout duration is hidden when "Kick" is selected.
  - **Warns** — fetches all members with warnings from
    `lib/warnings.js`, shows last 10 reasons each, with an inline Clear
    button per user.
  - **Automod** — toggle UI for the six rules backed by the existing
    `lib/automod.js`: enabled, anti-spam, anti-links, anti-invites,
    anti-caps, anti-mass-mention. Save button persists to per-guild config.
  - **Modlog stream** — live view of mod actions from the diagnostics
    log, filtered to the active server, with a type filter (all / ban /
    kick / timeout / warn / purge) and TSV export.
  - **Audit Log** — wraps `guild.fetchAuditLogs()` with a type filter
    covering bans, kicks, timeouts, role updates, channel CRUD, message
    deletes, etc.
- **New mod API surface** in `lib/control-server.js`:
  - `GET  /api/mod/bans?guildId=…`
  - `POST /api/mod/ban` `{ guildId, userId, reason, deleteMessageSeconds }`
  - `POST /api/mod/unban` `{ guildId, userId }`
  - `POST /api/mod/kick` `{ guildId, userId, reason }`
  - `POST /api/mod/timeout` `{ guildId, userId, durationMs, reason }`
  - `GET  /api/mod/warns?guildId=…` `→ { users: [...] }`
  - `POST /api/mod/warn-clear` `{ guildId, userId }`
  - `GET  /api/mod/automod?guildId=…`
  - `POST /api/mod/automod` `{ guildId, enabled, antiSpam, … }`
  - `GET  /api/mod/modlog-config?guildId=…`
  - `GET  /api/mod/audit?guildId=…&type=…&limit=…`
  Every mutation logs through `control.log(text, level, 'command', { ... })`
  with `meta.action` so it shows up in the Modlog stream and the
  Diagnostics console with proper categorization.
- **Modlog mirroring** — `/api/mod/ban` and friends post to the
  configured modlog channel via the existing `lib/modlog.js` helper
  (whatever channel `/setup modlog` pointed at).
- **Topbar sidebar entry** for Moderation (`⚖`) added between Settings
  and Diagnostics.

### Notes

- All mod actions require a guild to be selected via the existing
  server-picker dropdown. The dashboard rejects malformed user IDs
  (15–25 digit numeric check) before round-tripping to Discord.
- Discord timeouts are capped at 28 days (2,419,200,000 ms) — the
  backend enforces this clamp.
- 83 tests pass (no new tests for the mod API since it's network-bound
  to Discord; manual verification recommended for ban/kick before
  pointing at a busy server).

## [1.6.0] — 2026-05-31

A speed + scale upgrade — install whole playlists in the background, cap
bandwidth so a 500-song queue doesn't saturate your line, swap the bot icon,
and watch live network metrics from the Diagnostics page.

### Added

- **Playlist install** — paste a YouTube / SoundCloud / Bandcamp playlist URL
  into the install field and the dashboard probes it (`yt-dlp
  --flat-playlist --dump-single-json`), shows `X songs detected — install all?`
  with a sample of titles, and starts a **background job** when confirmed.
  Single-song URLs keep their existing flow.
- **Background download queue** — a floating chip bottom-right (`⬇ 12/47 ·
  3 active`) appears whenever a job is running. Click to expand: per-job
  progress bar, ✓/↩/✕ counts, currently-downloading titles, per-job and
  "Cancel all" buttons. Jobs survive page navigation; finished jobs stay
  visible for context (capped at 20 in memory).
- **Bandwidth limiter + concurrency** — inline `⚙ Download settings`
  collapse on the install panel:
  - **Parallel downloads** slider (1–50, default 5)
  - **Per-stream rate cap** select (Unlimited / 500K / 1M / 5M / 10M / 50M /
    100M per second), wired through `yt-dlp --limit-rate`
  - Live summary shows the aggregate cap (`5 × 10M = up to 50 MB/s`)
  - Persisted to `<LIBRARY_DIR>/_config.json` so it travels with the library
- **Network & bandwidth panel** on Diagnostics:
  - Active downloads + observed combined throughput
  - Bytes downloaded in last hour + total since boot
  - Voice bandwidth estimate (≈256 kbps × active connections)
  - Public IP behind a `Show` button (gated so it doesn't leak into
    screenshots by default)
  - Current rate cap + concurrency from the saved config
- **Topbar cleanup** — dropped the `connected · MaowCore#9293` subtitle.
  The diagnostics health chip (previously bottom-right floating) now lives
  in the topbar, right side, with the same expand-to-tail-console behavior.
- **Icon picker** — click the topbar icon to choose from 16 presets
  (✦ ◆ ⌘ ♫ ◐ ⌬ ⚡ ⌖ ⧉ ⧗ ◉ ✧ 🎵 🎧 🐱 🌙). Persisted to localStorage.
- **Cancellation** — `runYtDlp` now accepts an `AbortSignal`. Cancelling a
  playlist job kills every in-flight yt-dlp subprocess via SIGTERM.
- **8 new tests** covering `loadConfig`/`saveConfig` clamping + round-trip
  and the rejected "undefined"/"null" playlist names. Total: **83 passing**.

### Fixed

- **"undefined / undefined / undefined" in chat** — the now-playing embed
  added 3 fields from `song.features` (tempo / key / energy) unconditionally;
  when Spotify lookup partially succeeded the fields would render the
  literal string "undefined". Each field is now added only if its value is
  actually present.
- **Library autocomplete** is now defensive — manifest entries without a
  valid `name`/`id` are filtered out before being shown in the dropdown, and
  any thrown error responds with an empty list instead of leaking through.
- **Playlist autocomplete** (`/load`, `/deleteplaylist`) filters falsy and
  literal "undefined" keys defensively. `playlists.sanitize` now rejects
  `undefined`, `null`, and the literal strings `"undefined"` / `"null"` so a
  malformed save can no longer pollute the manifest.

### API additions

- `POST /api/library/probe-playlist` → `{ playlistName, count, sample }`
- `POST /api/library/install-playlist` → `{ jobId }` (work happens async;
  progress streamed via WebSocket `{ type: 'install_job', job }`)
- `POST /api/library/install-jobs/:id/cancel`
- `GET  /api/library/install-jobs` → `{ jobs: [...] }`
- `GET  /api/library/config` → `{ concurrency, limitRate }`
- `POST /api/library/config` → persists + returns the saved config

## [1.5.0] — 2026-05-30

A debugging upgrade — full **Diagnostics** page with a live subsystem health
diagram, boot timeline, categorized console, and a floating mini-panel that's
visible on every page so silent failures stop being invisible.

### Added

- **Diagnostics page** in the sidebar (`⌗`). Renders four panels on top of a
  new diagnostics module:
  - **Event-flow diagram** — Discord → DisTube → yt-dlp → ffmpeg → Voice
    plus HTTP/WS and Library off to the side. Each node is **green** (healthy),
    **amber** (warnings in last 5 min), or **red** (errors in last 5 min,
    with a pulsing dot). Health for each subsystem is derived from
    categorized logs + recent errors.
  - **Startup timeline** — every boot step (env, ffmpeg, yt-dlp, DisTube,
    plugins, library, control server, Discord login, ready) recorded with
    ✓ / ✕ / ⏱ / − and duration in ms. If startup hangs, the timeline shows
    exactly which step it stuck on.
  - **Live metrics grid** — rolling 1-min and 5-min counters for errors,
    warnings, commands, plays, searches, voice events, installs, uploads.
    Error / warning tiles glow red/amber when non-zero.
  - **Recent errors per subsystem** — last ~10 errors per subsystem grouped
    so you can see what most recently broke without scrolling through logs.
  - **Full categorized console** — 480px tall, color-coded by category with
    chip filters (Startup · Discord · Commands · Search · Play · Voice ·
    Install · Upload · Library · HTTP · WS · System) plus "Errors only" /
    "Warnings only" toggles. Live search filters by text. **Pause / Clear /
    Export** controls — Export downloads the buffer as a timestamped `.log`
    file for sharing or post-mortem analysis. Filter + search state persists
    across reloads.
- **Floating mini-panel** bottom-right, visible on every page:
  - Collapsed: a chip showing overall health (● *healthy* / ▲ *N warnings in
    5m* / ✕ *N errors in 5m*). The chip pulses red when something is down.
  - Expanded: a 240px tail-style console showing the last 30 entries. A
    "Open full →" link jumps to the Diagnostics page.
  - **Nav badge** on the Diagnostics sidebar item shows unseen error count
    until you visit the page.
- **Categorized logging** — every internal `control.log()` call now carries a
  `category`, a `subsystem`, and optional structured `meta` (hover a console
  row to see it). All existing free-form callers keep working — categories
  are inferred heuristically when not explicitly set.
- **Silent failures now surface in the dashboard**:
  - Discord client events: `error`, `warn`, `shardError`,
    `shardDisconnect`, `shardReconnecting`, `shardResume`, `rateLimit`.
  - DisTube `error` and `initQueue` events.
  - `unhandledRejection` and `uncaughtException` now also route through the
    dashboard (with stack traces in meta), instead of only printing to
    stdout.
- **Slash-command tracing** — each `/command` run logs start + outcome
  (`✓ ok (12ms)` or `✕ failed (450ms): <message>`) with user, guild, and
  duration. The command counter on the metrics grid reflects real
  throughput.

### Changed

- `/api/library` and the live `state` snapshot both now include a
  `diagnostics` payload (boot timeline, counters, health, recent errors).
- `control.log(text, level)` extended to
  `control.log(text, level, category, { subsystem, meta })`. Old call sites
  are backward-compatible — a heuristic guesses the category from the text.
- Sidebar version footer bumped to **v1.5.0**.

### Notes

- The diagnostics module ships with **11 new tests** (75 total, all green)
  covering boot lifecycle, rolling counters, error capping, subsystem health
  derivation, and boot-failure cascading.
- No environment changes required. Existing setups inherit the new page for
  free on first dashboard reload.

## [1.4.0] — 2026-05-30

A library upgrade — install songs straight from a URL, point the library at any
disk you want, search and paginate through it, and pick from five output
formats (with honesty about which ones are really lossless).

### Added

- **Install from URL** — new `/library install <url> [format]` slash command
  and a matching panel on the **Library → Your library** dashboard tab. Paste
  any yt-dlp-supported link (YouTube, SoundCloud, Bandcamp, direct file, …)
  and it lands in your library. Duplicates by source URL are detected and
  return the existing entry instead of re-downloading.
- **Five output formats** for installs, picked per-call:
  - `Original` *(default)* — no re-encode, smallest file, same fidelity as the
    source. The smart pick for ~90% of cases.
  - `MP3 320 kbps` — universally compatible.
  - `Opus 256 kbps` — smaller than MP3 at similar quality.
  - `FLAC` / `WAV` — lossless containers. **The UI is honest:** YouTube etc.
    serve lossy audio, and wrapping a lossy source in FLAC just makes a bigger
    file with the same audio. The dashboard shows a warning note up front, and
    any song installed this way gets a `lossy source` badge in the library
    list.
- **`LIBRARY_DIR` environment variable** — point the library at an external
  drive, a mounted volume, or anywhere with room to grow. Defaults to
  `data/library` for backward compatibility. The manifest also moves into the
  library directory (`_manifest.json`) so the whole library is portable —
  copy the folder to a new machine and it just works. Existing setups using
  the legacy `data/library.json` manifest are auto-migrated on first start.
- **Library search bar** — live, case-insensitive, debounced (120 ms) match on
  song name. Pagination resets to page 1 on a new query.
- **Sort options** — Most recent / Oldest / Name A→Z / Name Z→A / Largest /
  Smallest / Longest / Shortest. Choice persists across reloads.
- **Pagination** — 25 / 50 / 100 / All per page, with a smart page strip that
  keeps the first, last, and a window around the current page visible
  (e.g. `‹ 1 … 6 7 [8] 9 10 … 42 ›`). Page choice persists across reloads.
- **Storage summary line** under the controls — `Showing 1–50 of 327 songs ·
  4.2 GB · 22h 14m · stored in /data/library` — so you can see what's
  filtered, what it costs in disk, and where it lives.
- **yt-dlp availability check** — the dashboard disables Install and shows a
  clear warning if the bot can't find a `yt-dlp` binary, instead of failing
  silently when you click.

### Changed

- `/api/library` response now includes `dir`, `totalBytes`, `totalSec`,
  `formats`, and `ytDlpAvailable` so the dashboard can render an honest
  summary without a second round-trip.
- Manifest entries for installed songs carry `source: 'install'`, `sourceUrl`,
  source codec/bitrate, and a `losslessInLossyContainer` flag for the UI.

### Notes for upgraders

- **No data migration needed.** If you have an existing `data/library.json`
  manifest from 1.3.x, it's auto-detected and rewritten as
  `data/library/_manifest.json` on first start. Songs themselves don't move.
- **Docker users**: the bundled image already ships `yt-dlp` + `ffmpeg`, so
  Install works out of the box. Mount `/data` (or wherever you point
  `LIBRARY_DIR`) as a named volume to keep installs across container
  rebuilds.

## [1.3.1] — 2026-05-29

Reliability patch — fixes YouTube playback in Docker, an inaccurate ping
reading, and a set of robustness bugs found in a deep review of the upload
code.

### Fixed

- **YouTube "song removed immediately" on Linux/Docker** — the container now
  uses **system `ffmpeg`** + a freshly-downloaded **standalone `yt-dlp`**
  instead of the fragile bundled binaries. `index.js` honors `FFMPEG_PATH`,
  and the Dockerfile sets `YTDLP_DIR`/`YTDLP_FILENAME` so `@distube/yt-dlp`
  uses the system one. Startup now logs which ffmpeg + yt-dlp are in use.
- **Inaccurate ping** — `client.ws.ping` (gateway heartbeat) is often `-1` on
  discord.js v14, which the dashboard rendered as a misleading `0 ms`. The bot
  now measures a real REST round-trip to Discord every 10s and shows that when
  the heartbeat is unavailable; Advanced diagnostics shows both numbers.
- **Crash risk in the file-serve routes** — `/library/<file>` and
  `/sounds/<file>` streamed with no `'error'` handler; a mid-stream read error
  or a client/yt-dlp aborting a range request (e.g. a skip) could take down the
  whole process. Both now have error handling and destroy the read stream when
  the client disconnects. (A global `uncaughtException`/`unhandledRejection`
  backstop was also added.)
- **Range-request handling** — over-large/open-ended `end` values are now
  clamped to the last byte instead of being 416-rejected (library) or sending
  a wrong `Content-Length` that hangs the client (sounds).
- **500 MB uploads no longer buffer in memory** — the upload streams straight
  to disk with backpressure + size-cap enforcement, instead of holding the
  whole file (and a copy) in RAM and blocking the event loop on a sync write.
- **Uploaded-song display names** preserve spaces/punctuation again
  (`My Song (Remix).mp3` → "My Song (Remix)", not "My Song Remix").
- **Dashboard delete** now surfaces failures instead of silently swallowing
  them; **duration probe** uses a larger stderr buffer.

### Tests

- 3 new library tests (streaming upload target/commit, display-name
  preservation). Suite: **64/64**.

## [1.3.0] — 2026-05-29

Local song uploads, a real fix for local-file playback, and Docker support.

### Added

- **Upload your own songs** — a new **Uploads** tab in the dashboard Library
  with drag-and-drop. Files are stored in `data/library/` and play instantly.
  - Formats: mp3, wav, ogg, m4a, flac, opus, aac, webm
  - **No song-count limit** (was capped) and **500 MB per file**
  - **Play now** (insert next + skip) vs **+ Queue** (append) buttons, plus
    in-browser **Preview** and delete
  - Real track **duration** shown — probed with ffmpeg on upload and
    backfilled on startup (yt-dlp can't measure an HTTP stream, so the
    embed used to show 00:00)
- **`/library play|list|remove`** slash command with autocomplete.
- **Docker support** — multi-stage `Dockerfile`, `docker-compose.yml`, and
  `.dockerignore` for one-command deployment on a Linux host. Builds Linux
  -native binaries inside the container, runs non-root, has a healthcheck,
  and persists data in a named volume.

### Fixed

- **Local-file playback never worked** — `/sb` soundboard (and the new
  uploads) handed DisTube a local file *path*, but yt-dlp reads `C:/…` as an
  unsupported URL scheme and fails. Both now **stream over the control
  server's HTTP endpoint** (`/library/<file>`, `/sounds/<file>`, with Range
  support), which yt-dlp resolves correctly.
- **Uploaded-song display** — shows the friendly name (not the yt-dlp-derived
  filename) and the correct duration instead of `00:00`.
- **Graceful Discord login failure** — a bad/expired `DISCORD_TOKEN` no longer
  hard-crashes the whole process. The dashboard + library server stay up and
  print a clear "reset your token" message, so you can still reach the UI.

### Tests

- 12 new library tests (add/list/remove/rename, format + size rejection,
  path-traversal sanitization, ffmpeg duration probe). Suite: **61/61**.

### Upgrade

```bash
git pull
npm install        # postinstall reapplies patches
npm start
# — or with Docker —
docker compose up -d --build
```

Restart required: the running bot has the old code in memory.

## [1.2.0] — 2026-05-26

Dashboard restructure release. The biggest visual change since the bot
launched — the funky cosmic-themed dashboard is replaced with a clean
Discord-native layout and three switchable alternates. Plus a critical
fix for `/play` that was crashing on certain YouTube searches.

### Added

- **4 switchable dashboard themes** with a picker in Settings:
  - **Discord** (default) — blurple, dark, Inter, rounded
  - **Linear** — pure black, sharp edges, minimal, no animations
  - **Spotify** — green accent, big circular play button, music-app feel
  - **Glass** — frosted blur cards over a purple/pink ambient gradient
- **Consolidated 5-page IA** (down from 10): Home, Library, Insights,
  Server, Settings — fewer pages, denser, more focused
- **Library page** with tabs for Search / History / Favorites / Recent
  searches — replaces 3 separate pages
- **Insights page** unifying stats + profile + activity feed in one view
- **Settings → Advanced** accordion containing the old Performance,
  Console, and Diagnostics pages (collapsed by default — they're devtool
  views, not daily-use)
- **Persistent top bar** with brand, connection dot, server selector,
  Cmd+K trigger, and notification bell
- **Collapsible left sidebar**
- **`scripts/kill-stuck-gits.ps1`** — Windows utility to clear leaked
  `git.exe` processes that Claude Code occasionally piles up. Safe to
  run anytime; only kills read-only `git ls-files` queries.

### Changed

- Default theme migrated from `cosmic` to `discord`. Existing users on
  any legacy theme (cosmic / synthwave / cyberpunk / minimal /
  high-contrast / colorblind) auto-migrate to `discord` on first load.
- Cosmic-flavored copy on the dashboard ("Now Transmitting", "Subspace
  scan", "Cargo manifest", ✦ ◇ ⌬ glyphs) replaced with neutral copy.
  Discord embed and slash-command response copy left untouched.
- Cmd+K palette action list updated for the new 5-page IA.
- All native `<select>` elements get `color-scheme: dark` so Chrome's
  OS-painted dropdown popups match the theme on Windows.

### Fixed

- **`@distube/ytsr` patched twice more** (`scripts/patch-ytsr.js`):
  - `prepImg(...)[0].url` — videos with no thumbnails crashed the parser
  - `commandMetadata.webCommandMetadata.url` — some channels omit the
    full metadata block, breaking `_parseAuthor` / `_parseOwner`

  Surface symptom: `/play <search>` failed with `Cannot read properties
  of undefined (reading 'url')` on certain queries (live streams
  especially). All three patches are idempotent; postinstall reapplies
  them on every `npm install`.
- **`commands/play.js`** defensive filter — drops null/incomplete ytsr
  results before they reach Discord's select-menu builder.
- **`renderPerformance`** TypeError on every state tick — was reaching
  for `proc-up` (bot uptime) which didn't exist in the old HTML. Added
  to the new Diagnostics grid.
- **Insights page** now includes `prof-hours`, `prof-songs`, and
  `prof-topusers` slots so all profile renderers complete cleanly.
- **Glass theme dropdown** opacity — Chrome was rendering the popup with
  Windows light colors against translucent topbar; forced opaque-enough
  `<select>` bg + explicit `color-scheme: dark` on the element.

### Removed

- **Onboarding tour** — was friction more than help. Can be added back
  later if anyone misses it.

### Upgrade

```bash
git pull
npm install   # postinstall reapplies all patches
npm start
```

Hard-refresh the dashboard (`Ctrl+F5`) after upgrading so it loads the
new CSS instead of cached old styles.

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

[Unreleased]: https://github.com/lisalepardeany-coder/maowcore/compare/v1.3.1...HEAD
[1.3.1]: https://github.com/lisalepardeany-coder/maowcore/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/lisalepardeany-coder/maowcore/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/lisalepardeany-coder/maowcore/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/lisalepardeany-coder/maowcore/compare/136eea4...v1.1.0
