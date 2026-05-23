# MaowCore Control Panel

A cosmic-themed desktop dashboard for the Discord music bot. Shows live now-playing,
queue, command logs, and lets you control everything without opening Discord.

## Setup

1. Make sure you have Python 3.9+.
2. From this folder, install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
3. Start the bot first (`npm start` in the project root) — it now boots a local
   WebSocket server on `127.0.0.1:8765`.
4. Launch the panel:
   ```powershell
   python control_panel.pyw
   ```
   On Windows you can also just **double-click** `control_panel.pyw` and it will
   open without a console window.

## What you get

- **◆ Now Transmitting** — current song, requester, volume, loop state, filters,
  pause indicator, live progress bar
- **✦ Transmission Queue** — up to 30 upcoming songs
- **⌬ Live Log** — every slash command + DisTube event in real time
- **Controls** — play (URL or search), pause/resume toggle, skip, stop, shuffle,
  loop cycle, leave, volume slider (debounced)

## Notes

- The panel auto-reconnects every 2s if the bot restarts.
- `Play` from the panel works as long as the bot is currently in a voice channel.
  If it isn't, use `/play` once from Discord to dock the bot, then the panel
  takes over.
- Volume changes from the panel persist (same as `/volume`).
- To change the port, set `CONTROL_PORT` in `.env` (and update `WS_URL` at the
  top of `control_panel.pyw`).
- Only listens on `127.0.0.1` — the panel can't be reached from other machines
  unless you change the host in `lib/control-server.js`.
