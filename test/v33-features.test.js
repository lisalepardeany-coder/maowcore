// v3.3 features: reminders, stats, moods, ambience, backup tidy, health alerts,
// profiles and the new panel permission rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-v33-'));
process.env.DB_PATH = path.join(tmpDir, 'v33.db');
const db = require('../lib/db');

// ===== Reminders =====
const reminders = require('../lib/reminders');
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

test('reminders: understands durations, clock times and "tomorrow"', () => {
  const now = at(2026, 11, 9, 20, 0);   // Monday 20:00
  assert.equal(reminders.parseWhen('30min', now), now + 30 * 60000);
  assert.equal(reminders.parseWhen('2h30m', now), now + 150 * 60000);
  assert.equal(reminders.parseWhen('21:30', now), at(2026, 11, 9, 21, 30));
  assert.equal(reminders.parseWhen('9:00', now), at(2026, 11, 10, 9, 0), 'past time today → tomorrow');
  assert.equal(reminders.parseWhen('9am', now), at(2026, 11, 10, 9, 0));
  assert.equal(reminders.parseWhen('9:15pm', now), at(2026, 11, 9, 21, 15));
  assert.equal(reminders.parseWhen('tomorrow 9:00', now), at(2026, 11, 10, 9, 0));
  assert.equal(reminders.parseWhen('12am', now), at(2026, 11, 10, 0, 0));
  assert.equal(reminders.parseWhen('nonsense', now), 0);
  assert.equal(reminders.parseWhen('25:00', now), 0);
});

test('reminders: repeats skip to the next slot, weekdays skip weekends', () => {
  const fri9 = at(2026, 11, 13, 9, 0);
  assert.equal(reminders.nextFire(fri9, 'daily', fri9), at(2026, 11, 14, 9, 0));
  assert.equal(reminders.nextFire(fri9, 'weekdays', fri9), at(2026, 11, 16, 9, 0));
  assert.equal(reminders.nextFire(fri9, 'weekly', fri9), at(2026, 11, 20, 9, 0));
  assert.equal(reminders.nextFire(fri9, 'hourly', fri9), fri9 + 3600000);
  // Bot was off for 3 days: don't fire 3 times, just move to the next one.
  assert.equal(reminders.nextFire(fri9, 'daily', at(2026, 11, 16, 12, 0)), at(2026, 11, 17, 9, 0));
});

test('reminders: one-shot → snooze brings it back; repeat stays scheduled', () => {
  reminders._reset();
  const now = Date.now();
  const one = reminders.add({ userId: 'u1', what: 'water', fireAt: now - 1 });
  const rep = reminders.add({ userId: 'u1', what: 'meds', fireAt: now - 1, repeat: 'daily' });
  assert.equal(reminders.due(now).length, 2);
  reminders.markFired(one, now); reminders.markFired(rep, now);
  assert.equal(reminders.forUser('u1').length, 1, 'only the repeating one is left');
  assert.ok(reminders.forUser('u1')[0].fireAt > now);
  assert.equal(reminders.snooze(one.id, 'someone-else', 600000, now), null, 'cannot snooze others');
  const back = reminders.snooze(one.id, 'u1', 600000, now);
  assert.equal(back.fireAt, now + 600000);
  assert.equal(reminders.snooze(one.id, 'u1', 600000, now), null, 'snooze works once');
  assert.equal(reminders.cancel(back.id, 'u2'), false);
  assert.equal(reminders.cancel(back.id, 'u1'), true);
  assert.equal(reminders.stopRepeat(rep.id, 'u1'), true);
  assert.equal(reminders.forUser('u1').length, 0);
});

// ===== Stats =====
test('stats: counts plays, time, top songs and respects the range', () => {
  const stats = require('../lib/music-stats');
  const now = Date.now();
  const e = (name, artist, user, ago, duration = 200) => ({ name, artist, user, ts: now - ago, duration, url: name });
  const s = stats.compute([
    e('A', 'X', 'hazel', 1000), e('A', 'X', 'hazel', 2000), e('B', 'Y', 'sam', 3000), e('Old', 'Z', 'sam', 40 * 86400000),
  ], 'week', now);
  assert.equal(s.plays, 3);
  assert.equal(s.seconds, 600);
  assert.deepEqual(s.songs[0], ['A', 2]);
  assert.deepEqual(s.listeners[0], ['hazel', 2]);
  assert.equal(stats.compute([], 'week').plays, 0);
  const card = stats.card('Test', s);
  assert.match(card.description, /3\*\* plays/);
  assert.equal(stats.card('Test', stats.compute([], 'week')).fields.length, 0);
  assert.match(stats.weekKey(new Date(2026, 10, 9)), /^2026-W\d+$/);
});

// ===== Moods =====
test('moods: plan mixes your artists, favourites and mood fill', () => {
  const moods = require('../lib/moods');
  const fixed = () => 0.42;
  const entries = [{ artist: 'Radiohead' }, { artist: 'Radiohead' }, { artist: 'Bjork' }];
  const p = moods.plan('chill', entries, [{ url: 'https://y/1', name: 'fav', avg: 4.5 }, { url: 'https://y/2', avg: 2 }], { size: 6, rnd: fixed });
  assert.equal(p.items.length, 6);
  assert.ok(p.items.some((i) => i.url === 'https://y/1'), 'includes a 4★+ favourite');
  assert.ok(!p.items.some((i) => i.url === 'https://y/2'), 'skips low ratings');
  assert.ok(p.items.some((i) => /Radiohead/.test(i.query || '')), 'uses your artists');
  assert.equal(moods.plan('spooky', [], [], { size: 4 }).items.length, 4, 'works with no history');
  assert.throws(() => moods.plan('nope', []), /Unknown mood/);
});

// ===== Ambience =====
test('ambience: every preset renders a calm, seamless loop', () => {
  const a = require('../lib/ambience');
  for (const k of Object.keys(a.PRESETS)) {
    const s = a.render(k, 3, 8000);
    assert.equal(s.length, 3 * 8000, k);
    let peak = 0; for (const v of s) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak > 0.3 && peak <= 0.5001, `${k} peak ${peak}`);
    assert.ok(Math.abs(s[0] - s[s.length - 1]) < 0.2, `${k} loops without a jump`);
  }
  const wav = a.toWav(new Float32Array([0, 0.5, -0.5]), 8000);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.length, 44 + 6);
  assert.equal(a.presetForTheme('isolation', 'Horror · Space'), 'hum');
  assert.equal(a.presetForTheme('neuralnet', 'AI & Tech'), 'server');
  assert.equal(a.presetForTheme('pizzeria', 'Horror · Games'), 'fan');
});

// ===== Backup tidy =====
test('backup tidy: keeps 5 plain, gzips older, removes past 14', () => {
  const backup = require('../lib/backup');
  const dir = backup.BACKUP_DIR;
  assert.ok(dir.startsWith(os.tmpdir()), 'tests use a temp backup folder');
  fs.mkdirSync(dir, { recursive: true });
  const now = Date.now();
  for (let i = 0; i < 16; i++) {
    const f = path.join(dir, `snapshot-test-${i}.json`);
    fs.writeFileSync(f, JSON.stringify({ version: 1, files: { a: 'x'.repeat(5000) } }));
    const t = new Date(now - i * 3600000); fs.utimesSync(f, t, t);
  }
  try {
    const r = backup.tidy({ now });
    assert.equal(r.deleted, 2);
    assert.equal(r.compressed, 9);
    const after = backup.list();
    assert.equal(after.length, 14);
    assert.equal(after.filter((s) => s.name.endsWith('.gz')).length, 9);
    assert.ok(after[0].createdAt >= after[13].createdAt, 'order kept');
    assert.equal(backup.restore(after[13].name, { dryRun: true }).planned.length, 1, 'gz snapshots can be restored');
  } finally {
    for (const f of fs.readdirSync(dir)) if (f.startsWith('snapshot-test-')) fs.unlinkSync(path.join(dir, f));
  }
});

// ===== Health alerts =====
test('health alerts: crash detection and 30-minute cooldown', () => {
  const h = require('../lib/health-alerts');
  assert.equal(h.wasCrash({ code: 1 }), true);
  assert.equal(h.wasCrash({ code: 0 }), false);
  assert.equal(h.wasCrash({ code: null, signal: 'SIGTERM' }), false);
  assert.equal(h.wasCrash(null), false);
  const m = new Map();
  assert.equal(h.shouldSend('music', 1000, m), true);
  assert.equal(h.shouldSend('music', 1000 + 60000, m), false);
  assert.equal(h.shouldSend('crash', 1000 + 60000, m), true, 'other kinds are separate');
  assert.equal(h.shouldSend('music', 1000 + 31 * 60000, m), true);
});

// ===== Profiles =====
test('profiles: create, edit, fronting, per-user isolation', { skip: !db.isAvailable }, () => {
  const profiles = require('../lib/profiles');
  const a = profiles.save('u1', { name: 'Hazel', emoji: '🩶', color: '#aabbcc', prefs: { 'maow.theme': 'pizzeria' } });
  const b = profiles.save('u1', { name: 'Sam', color: 'not-a-colour' });
  assert.equal(b.color, '#5865f2');
  profiles.save('u2', { name: 'Other' });
  assert.equal(profiles.list('u1').length, 2);
  assert.equal(profiles.list('u1')[0].prefs['maow.theme'], 'pizzeria');
  assert.equal(profiles.setFront('u1', b.id).id, b.id);
  assert.equal(profiles.setFront('u1', a.id).id, a.id);
  assert.equal(profiles.list('u1').filter((p) => p.fronting).length, 1, 'only one fronts');
  assert.throws(() => profiles.setFront('u2', a.id), /not found/, "can't front someone else's");
  assert.equal(profiles.remove('u2', a.id), false, "can't delete someone else's");
  const edited = profiles.save('u1', { id: a.id, name: 'Hazel 🩶', favorites: [{ name: 'Song', url: 'https://youtu.be/x' }, { url: 'javascript:alert(1)' }] });
  assert.equal(edited.name, 'Hazel 🩶');
  assert.equal(edited.favorites.length, 1, 'non-http favourites dropped');
  assert.throws(() => profiles.save('u1', { name: '' }), /name/);
});

// ===== Permissions for the new routes =====
test('panel ranks: guests only get the listen room', () => {
  const x = require('../lib/panel-extras');
  assert.equal(x.requiredRank('GET', '/api/listen/state'), 'guest');
  assert.equal(x.requiredRank('POST', '/api/listen/add'), 'guest');
  assert.equal(x.requiredRank('GET', '/api/profiles'), 'member');
  assert.equal(x.requiredRank('POST', '/api/reminders/add'), 'member');
  assert.equal(x.requiredRank('POST', '/api/ambience/play'), 'moderator');
  assert.equal(x.requiredRank('GET', '/api/health-alerts'), 'admin');
  assert.equal(x.requiredRank('POST', '/api/health-alerts/test'), 'owner');
  assert.equal(x.requiredRank('POST', '/api/backup/tidy'), 'admin');
  assert.equal(x.rankAtLeast('guest', x.requiredRank('GET', '/api/history')), false);
});
