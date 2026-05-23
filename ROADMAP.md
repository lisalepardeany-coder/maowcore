# MaowCore Roadmap

**83 features** picked across multiple brainstorming sessions — 55 bot/system features + 28 dashboard design enhancements. Organized by tier (effort vs. impact). Tier 1 is the recommended next batch.

| Size | Meaning |
|---|---|
| **S** | Small — under ~100 LOC, single file, <30 min |
| **M** | Medium — a few files, 1–3 hours focused work |
| **L** | Large — new subsystem, half-day to full day |
| **XL** | Extra-large — significant infra investment or research |

---

## Tier 1 — Quick wins (do these next)

High impact, low effort. ~26 features, achievable in 2–3 focused sessions if batched well.

### 🎵 Music & audio
| Feature | Size | Approach |
|---|---|---|
| **Smart shuffle** | S | Replace `queue.shuffle()` with one that avoids back-to-back same-artist tracks. |
| **A-B loop** | S | `/loopab <start> <end>` — setTimeout that `queue.seek(start)` when `currentTime >= end`. |
| **Speed/pitch control** | M | `/speed <0.5-2>`, `/pitch <-12-+12>` via FFmpeg `atempo` and `asetrate` filters. |
| **Sleep timer** | S | `/sleep <minutes>` — stops + leaves after N min, optional 15s fadeout via volume taper. |
| **Karaoke / vocal removal** | S | `/karaoke` adds FFmpeg `pan=stereo|c0=c0-c1|c1=c1-c0` for center-channel subtraction. |
| **Show BPM / key / energy** | S | Call Spotify `audio-features` endpoint on URL resolve; display in `/nowplaying` + dashboard. |

### 🖥 Dashboard
| Feature | Size | Approach |
|---|---|---|
| **Theme selector** | S | Multiple CSS palettes (cosmic / synthwave / cyberpunk / minimal) swappable via `data-theme`. |
| **Search panel page** | M | New sidebar tab — input box, calls `client.youtubePlugin.search`, shows 10 results with queue/play-next buttons. |
| **Listening history** | M | Append plays to `data/history.json` (capped at 500/server). Page with table + replay buttons. |
| **PWA install** | S | `public/manifest.json` + tiny service worker; "Install app" prompt on phone & desktop. |
| **Reduced motion mode** | S | Honor `prefers-reduced-motion` + manual toggle; disables gauges/gradients/transitions. |
| **High-contrast / a11y theme** | S | WCAG-AA palette + larger fonts + ARIA labels on every control. |
| **Color-blind safe palettes** | S | Deuteranopia / Protanopia / Tritanopia variants alongside Cosmic. Selectable in Settings. |

### ⚡ Power features
| Feature | Size | Approach |
|---|---|---|
| **Radio station presets** | S | `lib/radio.js` with hardcoded list (LoFi Girl, ChillHop FM, etc.); `/radio <name>` plays the stream. |
| **Internet radio directory** | M | Wraps Radio-Browser.info free API; search by genre/country in the dashboard. |
| **SoundCloud source** | S | Add `@distube/soundcloud` plugin to the plugins array. URLs + search work for free. |
| **Stats & analytics** | M | Reuses `history.json`. Dashboard page with line + bar charts (pure SVG, no Chart.js). |
| **Vote-skip / DJ role** | M | Per-server config: `djRoleId` + `voteSkipRatio` (default 0.5). DJ skips instantly; others vote via button. |
| **Auto-start on PC boot** | S | `scripts/install-startup.ps1` — registers Windows scheduled task that runs `npm start` on user logon. |
| **Anonymous requests** | S | `/anonymous <query>` — hides requester in messages; max 1/user/hour rate limit. |
| **DJ request notes** | S | Extra `note` field on songs (`/dedicate ... for: ...`); shown in Now Transmitting. |
| **Vibe check ratings** | S | Button row on Now Transmitting (1–5 stars) → store per user+song in JSON. `/toprated`, `/lowestrated`. |

### 🛠 Infra
| Feature | Size | Approach |
|---|---|---|
| **Hot-reload commands** | S | `/reload` (owner-only) — clears `require.cache` for `commands/*.js` and re-loads them. |
| **Health endpoint** | S | Add `/health` GET route on control-server returning JSON (uptime, mem, current song, latency). |
| **Backup / restore** | M | `/backup` zips `data/`, attaches to DM. `/restore <attachment>` extracts and reloads config. |
| **Custom command aliases** | S | Per-guild alias map: `aliases.bops → 'play <my-default-playlist>'`. Resolves before dispatch. |

---

## Tier 2 — Medium-effort polish

Strong UX wins, more code. ~16 features, ~2–3 sessions.

### 🎵 Music & audio
| Feature | Size | Approach |
|---|---|---|
| **Volume normalization** | M | FFmpeg `loudnorm` filter on output. Optional pre-analyse pass for two-pass accuracy. |
| **Lyrics translation** | S | "Translate" button on lyrics embed → Google Translate free endpoint → side-by-side display. |
| **Synced karaoke lyrics** | L | Use lrclib.net (free LRC source). Parse timestamps; highlight + auto-scroll in dashboard; throttled embed edits in Discord. |
| **10-band graphic EQ** | M | FFmpeg `equalizer` filter, one per band. Draggable sliders in dashboard. Save presets per server. |
| **Pomodoro mode** | M | State machine: focus (25m) ↔ break (5m) playlists. Push notification (Discord embed + browser push) on cycle change. |

### 🖥 Dashboard
| Feature | Size | Approach |
|---|---|---|
| **Drag-drop queue** | M | HTML5 `draggable` on rows → WS `queue_move` action → splice `queue.songs`. Right-click context menu. |
| **Album-art dynamic theme** | M | Canvas palette extractor (~40 LOC, no deps). Animate `--cosmic` to dominant color with 1s transition. |
| **Bot personality presets** | M | Centralize all response strings in a template module with `cosmic | formal | chatty | meme` variants. Setting per server. |
| **Dashboard layout editor** | L | Drag-drop dashboard panels (mini-player, queue, log, stats). Persist layout per browser via localStorage. |

### ⚡ Power features
| Feature | Size | Approach |
|---|---|---|
| **TTS song announcements** | M | gTTS-generated MP3 prepended to voice connection before each song. Per-server toggle. |
| **TTS chat reader** | M | Hook `messageCreate`; if channel matches "voice TTS" config, generate TTS and queue it (interrupt/duck music). |
| **Reaction controls** | M | `messageReactionAdd` listener on Now Transmitting message — map ❤️/⏭️/🔁/🔇 to actions. |
| **Music meme generator** | M | Pillow on bot side — fetch album art, overlay top/bottom text, send as attachment. |
| **Soundboard** | M | Upload short MP3/WAV via dashboard → stored in `data/sounds/`. `/sb <name>` plays in voice (ducks music). |
| **Custom hotkey editor** | S | Tkinter dialog in Python GUI — remap F8/F9/etc.; persist to `gui/hotkeys.json`. |
| **Podcast RSS feeds** | M | Parse RSS via existing `undici`. Store subscriptions per server. `/podcast play <name>` queues latest episode; track progress. |

---

## Tier 3 — Bigger lifts

Real subsystems. ~8 features. Each ~half-day to full day.

| Feature | Size | Approach |
|---|---|---|
| **Crossfade between tracks** | L | Either fork DisTubeVoice for overlapping stream playback OR use FFmpeg `acrossfade` at boundary. The first is cleaner but more invasive. |
| **Mini-player overlay** | L | `window.open()` with `?mode=mini` for a slim variant. True always-on-top needs Electron/Tauri wrapper (recommended). |
| **Natural-language playlist** | L | `/vibe <description>` — LLM call returns 10 titles → search YouTube/Spotify → queue. Needs API key, ~$0.01/call. |
| **Cross-server playlists** | L | Short codes (e.g. `XKLM-92`). Storage: tiny shared HTTP service OR GitHub Gist sync. Simplest: JSON file import/export. |
| **Music quiz game** | L | State machine per channel: lobby → 10s clip → guess window → score. `queue.seek` to song middle. Score table per server. |
| **Game-aware ducking** | L | Poll focused window every 2s via PowerShell child process. Match against game executable list. Duck via `setVolume(v * 0.5)`. |
| **Concert / tour finder** | M | Bandsintown free API. `/tours` returns upcoming events for current artist near a configured location. |
| **Local files / NAS / Plex** | L | Plex API integration (token-based). Dashboard browser for libraries + tracks. Stream local file URLs through DisTube. |
| **Listening parties (cross-server sync)** | XL | Requires shared state across guilds — bot maintains a "party room" with synced `queue.seek()` heartbeats. Hard to get right. |
| **Multi-user dashboard auth** | L | Discord OAuth flow → JWT cookie. Roles: viewer / DJ / admin. Required for any public deployment. |
| **Localization (i18n)** | L | Wrap all response strings in `t()`. Locale files for en/es/fr/de/ja/pt. Detect via Discord locale or per-user override. |

---

## Tier 4 — Speculative / R&D

Experimental — heavy infra investment, may not be worth it for a personal bot.

| Feature | Size | Notes |
|---|---|---|
| **Live audio waveform** | XL | Tee PCM stream → second consumer → transcode to MP3 → HTTP endpoint → dashboard WebAudio analyzer. ~150 LOC + several footguns. Very cool factor. |
| **Voice command listening** | XL | Capture users' Opus via VoiceReceiver → Vosk local model → intent parsing. Privacy + always-on overhead. Heavy. |

---

---

# 🎨 Dashboard Design & Polish

28 enhancements focused purely on how the dashboard looks, feels, and flows. Most are visual-only (CSS + small JS) which makes them surprisingly cheap relative to the impact. Grouped by category, then prioritized.

## Layout & structure

| Feature | Size | Approach |
|---|---|---|
| **Bento-grid layout** | M | Restructure Overview + Performance pages with asymmetric `grid-template-areas`. Hero card spans 2×2, small tiles fill gaps. Apple/Linear style. |
| **Floating mini-player dock** | M | New sticky component at viewport bottom — album art, title, transport buttons, progress bar. Visible on every page. Slides up on song start, collapses to a thin bar when idle. |
| **Command palette (Cmd+K)** | M | Modal overlay with fuzzy search across commands, songs, pages, settings. ~100 LOC of vanilla JS, no library. Keyboard-first UX. |
| **Customizable widgets** | L | Drag-drop tiles on Overview using HTML5 native DnD. Each widget is a registered component (mini-player, queue, log, stat). Layout JSON persists to localStorage. |

## Background & texture

| Feature | Size | Approach |
|---|---|---|
| **Animated star field** | S | Three layered `::before`/`::after` divs with `radial-gradient` star patterns, each scrolling at different speeds (parallax). Pure CSS animation, GPU-cheap. |
| **Aurora gradients** | S | 3-4 large blurred color blobs (`filter: blur(120px)`) drifting on a slow `@keyframes` loop. Subtle depth without distraction. |
| **Album-art ambient bg** | M | Canvas extract dominant color from current art → animate `--bg-tint` CSS variable. Add a 50%-opacity blurred album-art layer to the body background. UI hue subtly shifts to match the song. |
| **Cyberpunk grid / scanlines** | S | Optional theme variant: `repeating-linear-gradient` for scanlines + perspective floor grid via CSS transform. Tron meets Blade Runner aesthetic. |

## Motion & effects

| Feature | Size | Approach |
|---|---|---|
| **Spectrum visualizer** | XL | Needs real audio stream from bot to dashboard (see Tier 4: live audio waveform). Alternative: decorative-only bars that loosely react to beat detection from song metadata — much cheaper at M. |
| **Animated counters** | S | Helper `tweenNumber(el, from, to, duration)` using `requestAnimationFrame`. Applied to uptime, ping, song count, etc. Odometer-style transitions. |
| **Hover album-art previews** | M | On row hover, position a floating card (`position: fixed`) next to cursor showing full album art, duration, uploader, request time. ~50 LOC vanilla JS. |
| **Holographic shimmer** | S | Track cursor position with `mousemove`; apply a `linear-gradient` overlay to cards that follows the cursor, simulating reflective sheen. Disable on `prefers-reduced-motion`. |

## Now Playing redesign

| Feature | Size | Approach |
|---|---|---|
| **Fullscreen mode** | M | Press F → swap to a layout with huge centered album art, large title, minimal controls. Mouse-inactive cursor hides; controls fade out after 3s. ESC to exit. |
| **Lyrics overlay on art** | M | When synced lyrics are available, render scrolling lyrics positioned over a darkened gradient on top of the album art. Current line at center, dim others. |
| **Visualizer behind art** | XL | Same dependency as spectrum visualizer (needs audio source). Decorative-only fallback (loose beat-following) is M. |
| **Background album-art blur** | S | On Now Playing page, set body background to `url(thumbnail)` with `filter: blur(60px) saturate(180%) brightness(0.5)`. Transitions smoothly between songs. |

## Data visualization

| Feature | Size | Approach |
|---|---|---|
| **Calendar heatmap** | M | Compute plays-per-day from `history.json`. Render SVG grid (53 weeks × 7 days), color cells by intensity. Hover shows date + count. |
| **Genre donut chart** | M | Needs genre data — fetch via Spotify audio-features endpoint per song (cache per URL). Render animated SVG donut with click-to-filter. |
| **Sparklines everywhere** | M | Reusable `<sparkline>` web component (50 LOC). Mini SVG line chart. Add inline next to ping, uptime, listening time, plays-today, etc. |
| **Real-time line graphs** | M | On Performance page, keep a 5-minute rolling buffer of CPU/RAM/ping. Render scrolling SVG line with smooth Bezier interpolation. |

## Polish & detail

| Feature | Size | Approach |
|---|---|---|
| **Sound design** | S | A handful of short MP3s (click, hover, success, error). HTML `<audio>` triggered on key interactions. Master toggle + volume in Settings. |
| **Skeleton loaders** | S | Shimmer placeholders sized like real content. CSS `linear-gradient` + `@keyframes` shimmer. Show during initial WS connect. |
| **Toast notifications** | S | Bottom-right slide-in container. `toast(message, level)` helper. Auto-dismiss after 4s; stackable. |
| **Easter eggs** | S | Konami code unlocks a hidden theme. Logo click counter (7×) triggers persona swap. Type `/matrix` in console for fake terminal. `/help-secret` hidden command. |

## New pages

| Feature | Size | Approach |
|---|---|---|
| **Profile page** | M | Aggregate stats from `history.json`: top 10 artists, top 10 songs all-time, listening streak, current obsession (most-played this week), genre breakdown, taste graph. |
| **Discover page** | L | Recommendation engine. Either: (a) Spotify recs based on top-played tracks (uses existing API); (b) "you also liked" via collaborative simple ML. Click to queue. |
| **Activity feed** | M | Timeline view of all events with filter chips (plays / commands / errors / settings). Reuses log stream + history. Like a developer console for music. |
| **Onboarding tour** | M | First-visit overlay highlights each panel with arrow callouts. Five-step walkthrough: nav → now-playing → controls → console → settings. `localStorage.tourCompleted` flag; relaunch from Help menu. |

---

## Dashboard implementation order

If you want me to just batch them:

1. **Visual quick wins** (1 session) — animated star field, aurora gradients, album-art blur bg, holographic shimmer, animated counters, skeleton loaders, toast notifications. All S-sized, mostly CSS.
2. **Layout overhaul** (1 session) — bento grid, floating mini-player dock, command palette, cyberpunk theme variant.
3. **Now Playing overhaul** (1 session) — fullscreen mode, lyrics overlay, background album-art blur. Adds the spectrum visualizer as decorative-only.
4. **Data viz session** (1 session) — calendar heatmap, sparklines, real-time line graphs, genre donut (requires Spotify features fetch).
5. **New pages + polish** (1 session) — profile page, activity feed, onboarding tour, sound design, easter eggs.
6. **Big lifts** — customizable widgets (L), discover page (L). One per session.

---

## Suggested implementation order

If you want me to just keep going:

1. **Tier 1 batch A (music + audio basics)** — smart shuffle, A-B loop, sleep timer, karaoke vocal-removal, BPM/key/energy, speed/pitch. *~1 session.*
2. **Tier 1 batch B (dashboard polish)** — theme selector, PWA, search panel, listening history, reduced-motion + a11y + color-blind themes. *~1 session.*
3. **Tier 1 batch C (power + infra)** — radio presets + radio directory, SoundCloud, stats charts, vote-skip/DJ, auto-start, anonymous + DJ notes + vibe ratings, hot-reload + health + backup + aliases. *~1 session.*
4. **Tier 2 batch** — pick favorites (lyrics translation, drag-drop queue, album-art theme, TTS announcements, EQ, soundboard). *~1–2 sessions.*
5. **Tier 3 cherry-pick** — only what excites you most. Crossfade, natural-language playlist, and game-aware ducking are the most fun.
6. **Tier 4** — only if you really want them.

Tell me which tier or batch to start, and I'll knock it out.
