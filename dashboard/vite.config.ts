import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// During `vite dev` (port 5173) proxy the API + WebSocket to the running bot's
// control server on :8765 so the new dashboard hot-reloads against live data.
const BOT = process.env.BOT_ORIGIN || 'http://127.0.0.1:8765';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BOT, changeOrigin: true },
      '/library': { target: BOT, changeOrigin: true },
      '/sounds': { target: BOT, changeOrigin: true },
      '/ws': { target: BOT, ws: true, changeOrigin: true },
    },
  },
});
