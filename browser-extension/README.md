# MaowCore Browser Extension

Adds a "Queue in MaowCore" entry to your right-click menu on links + selected text + supported pages.

## Install (Chrome/Edge/Brave)

1. Visit `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this `browser-extension/` folder
5. Click the extension icon and set your bot URL (default `http://127.0.0.1:8765`)

## Install (Firefox)

1. Visit `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select the `manifest.json` file

## What you get

- Right-click a YouTube / Spotify / SoundCloud link anywhere on the web → "Queue in MaowCore"
- Select any text → right-click → "Search & queue in MaowCore: '<text>'"
- On YouTube/Spotify/SoundCloud tabs themselves → right-click the page → queue the current URL

A desktop notification confirms each successful queue.

## Configuration

Click the extension icon → enter your bot's URL.

If you're using Docker with `CONTROL_HOST=0.0.0.0`, you can point at your LAN IP (e.g. `http://192.168.1.50:8765`) to queue from any device on your network.
