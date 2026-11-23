// ===== Start-up safety checks =====
// Settings mistakes that don't crash anything but leave the bot exposed or
// quietly switch features off. Checked once at start: printed in the console
// and the dashboard log, and DM'd to the owner when there is one.
//
//   open-dashboard  the dashboard listens beyond this computer (a hosting panel,
//                   CONTROL_HOST=0.0.0.0) and nothing stops strangers: no working
//                   Discord sign-in lock and no CONTROL_TOKEN
//   lock-broken     PANEL_REQUIRE_LOGIN=1 but Discord sign-in isn't set up, so
//                   the lock is silently off
//   no-owner        OWNER_USER_ID missing: no warning DMs, no backups, no /backup
const LOOPBACK = /^(127\.\d+\.\d+\.\d+|localhost|::1)$/i;

// Pure (tested): the problems in a set of settings.
const findProblems = (env = process.env) => {
  const out = [];
  const exposed = !!env.P_SERVER_UUID || !LOOPBACK.test(env.CONTROL_HOST || '127.0.0.1');
  const signInReady = !!((env.DISCORD_CLIENT_ID || env.CLIENT_ID) && env.DISCORD_CLIENT_SECRET);
  const lockWanted = env.PANEL_REQUIRE_LOGIN === '1';
  const lockOn = lockWanted && signInReady;
  if (lockWanted && !signInReady) {
    out.push({ id: 'lock-broken', level: 'error', text: 'PANEL_REQUIRE_LOGIN=1 is set, but Discord sign-in isn\'t set up (DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET), so the sign-in lock is OFF.' });
  }
  if (exposed && !lockOn && !env.CONTROL_TOKEN) {
    out.push({ id: 'open-dashboard', level: 'error', text: 'The dashboard can be reached from other computers, and nothing stops strangers from using it (no sign-in lock, no CONTROL_TOKEN). Anyone who finds the address can control the bot. Fix: set PANEL_REQUIRE_LOGIN=1 plus DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in .env (or set up sign-in on the dashboard\'s Login page).' });
  }
  if (!env.OWNER_USER_ID) {
    out.push({ id: 'no-owner', level: 'warn', text: 'OWNER_USER_ID isn\'t set, so there are no warning DMs, no backup DMs and /backup is off. Add your Discord user ID to .env as OWNER_USER_ID.' });
  }
  return out;
};

// Run once Discord is ready. `log(text, level)` = the dashboard log.
const run = (client, log = () => {}) => {
  const problems = findProblems();
  for (const p of problems) {
    const line = `${p.level === 'error' ? '▲▲ SAFETY' : '▲ Note'}: ${p.text}`;
    (p.level === 'error' ? console.error : console.warn)(`\n${line}\n`);
    try { log(line, p.level); } catch { /* */ }
    if (p.level === 'error') {
      try { require('./health-alerts').alert(`safety:${p.id}`, 'Please check a setting', p.text, { color: 0xef4444, icon: '🔓' }); } catch { /* */ }
    }
  }
  return problems;
};

module.exports = { findProblems, run };
