# MaowCore Vencord Plugin

Adds a Now Playing indicator, quick-queue context menu, and optional status sync to Vencord. Talks to your MaowCore bot's WebSocket on `ws://127.0.0.1:8765/`.

## Install (user plugin)

Vencord supports loading external plugins from your local filesystem:

1. Make sure you have Vencord set up for development (`pnpm install` in the Vencord repo).
2. Copy this folder into your Vencord `src/userplugins/maowcore/` directory.
3. Run `pnpm build` and inject Vencord into Discord.
4. Restart Discord and enable **MaowCore** in Vencord Settings → Plugins.

## Without building (faster)

You can also paste `index.js` into the Vencord QuickCSS / theme system, but functionality is limited.

## What it does

- **Now Playing indicator** — a floating cosmic-themed widget bottom-right showing what the bot is playing. Click ⏸ ⏭ ⏹ to control.
- **Quick-queue context menu** — right-click any link in Discord → "Queue in MaowCore".
- **Auto-status sync** — your Discord Custom Status mirrors what the bot is playing (off by default).

## Configuration

Open Vencord Settings → Plugins → MaowCore → cog icon:

- `wsUrl` — defaults to `ws://127.0.0.1:8765/`. Change if your bot runs on a different host.
- `statusSync` — whether to push the current song to your Discord Custom Status.
- `showNowPlaying` — toggle the floating widget.
