# Public status page (Cloudflare Workers, free plan)

This puts the status page online and sends a Discord alert when the bot or PC
stops responding, even with the PC off. Cloudflare checks every 5 minutes.

From this folder, after making a free Cloudflare account:

1. Sign in: `npx wrangler login`
2. Make the storage: `npx wrangler kv namespace create STATUS`, then paste the
   id it prints into `wrangler.toml`.
3. Copy the page: `copy ..\..\public\status.html public\status.html`
4. Set a secret. Make up a long random password when asked:
   `npx wrangler secret put PUSH_SECRET`
5. Optional, for outage alerts: create a webhook in your Discord channel, then
   `npx wrangler secret put DISCORD_WEBHOOK_URL`
6. Publish: `npx wrangler deploy`, and note the address it prints.
7. Add to the bot's `.env`, then restart it from the panel:
   ```
   STATUS_PUSH_URL=https://YOUR-ADDRESS.workers.dev/push
   STATUS_PUSH_SECRET=the password from step 4
   ```

The bot sends an update every 2 minutes, which stays inside the free limit of
1000 storage writes a day. Only the status page's public data is sent. Manual
changes still happen on the bot's own status controls page.
