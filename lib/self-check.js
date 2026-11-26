'use strict';
// lib/self-check.js — a quick check after every start: is the bot really
// working, not just running? Discord connection, database, the data folder,
// and whether Discord has the slash commands we expect.
//
// All good: one log line (and a ✓ line in the update DM after an update).
// Something wrong: a health alert DM to the main owner right away.

const fs = require('node:fs');
const path = require('node:path');

let last = null;

const DATA = path.join(__dirname, '..', 'data');

async function check(name, fn) {
  try {
    const detail = await fn();
    return { name, ok: true, detail: detail || '' };
  } catch (e) {
    return { name, ok: false, detail: e?.message || String(e) };
  }
}

async function run(client, deps = {}) {
  const db = deps.db || require('./db');
  const deploy = deps.deploy || require('./command-deploy');
  const dataDir = deps.dataDir || DATA;
  const checks = await Promise.all([
    check('Discord', async () => {
      if (!client.isReady?.()) throw new Error('not connected');
      const ping = Math.round(client.ws?.ping ?? -1);
      return `${client.guilds.cache.size} server${client.guilds.cache.size === 1 ? '' : 's'}${ping >= 0 ? `, ${ping} ms` : ''}`;
    }),
    check('Database', async () => {
      if (!db.isAvailable) {
        if (db.loadError) throw new Error(`not loaded: ${db.loadError.message || db.loadError}`);
        return 'not used (JSON files)';
      }
      db.raw.prepare('SELECT 1').get();
      return 'readable';
    }),
    check('Data folder', async () => {
      const probe = path.join(dataDir, `.write-test-${process.pid}`);
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return 'writable';
    }),
    check('Slash commands', async () => {
      const guild = client.guilds.cache.first();
      if (!guild) return 'no server to check';
      const want = deploy.buildCommandsArray(client).length;
      const have = (await guild.commands.fetch()).size;
      if (have < want) throw new Error(`${guild.name} has ${have} of ${want}; run \`npm run deploy\` or check AUTO_DEPLOY_COMMANDS`);
      return `${have} in ${guild.name}`;
    }),
  ]);
  last = { at: Date.now(), ok: checks.every((c) => c.ok), checks };
  return last;
}

/** Pure: one short line per check, for logs and the update DM. */
const summary = (r) => r.checks.map((c) => `${c.ok ? '✓' : '✕'} ${c.name}${c.detail ? `: ${c.detail}` : ''}`).join('\n');

module.exports = { run, summary, last: () => last };
