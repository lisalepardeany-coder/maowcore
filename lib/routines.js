// One-press routines: a list of steps run in order. Some steps run in the bot
// (music, ambience, volume, checklists); some in the panel (theme, Gentle
// mode). Stored per user in data/routines.json; three starters are made the
// first time someone looks.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = process.env.NODE_TEST_CONTEXT
  ? path.join(require('node:os').tmpdir(), `maow-routines-${process.pid}.json`)
  : path.join(__dirname, '..', 'data', 'routines.json');

const SERVER_STEPS = ['mood', 'radio', 'ambience', 'volume', 'stop', 'checklist'];
const PANEL_STEPS = ['theme', 'gentle'];
const STARTERS = [
  { name: 'Morning', emoji: '☀️', steps: [{ type: 'gentle', on: false }, { type: 'theme', id: 'springbloom' }, { type: 'mood', mood: 'happy' }, { type: 'volume', value: 60 }, { type: 'checklist', match: 'morning' }] },
  { name: 'Wind down', emoji: '🌙', steps: [{ type: 'gentle', on: true }, { type: 'theme', id: 'kawaiinight' }, { type: 'ambience', preset: 'rain' }, { type: 'volume', value: 35 }] },
  { name: 'Gaming', emoji: '🎮', steps: [{ type: 'gentle', on: false }, { type: 'theme', id: 'arcadenight' }, { type: 'mood', mood: 'hype' }, { type: 'volume', value: 80 }] },
];

let state = null;
const load = () => {
  if (state) return state;
  try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { state = { users: {} }; }
  state.users = state.users || {};
  return state;
};
const save = () => {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(state)); fs.renameSync(`${FILE}.tmp`, FILE); }
  catch (e) { console.warn('[routines] save failed:', e.message); }
};
const newId = () => crypto.randomBytes(4).toString('hex');

// Pure (tested): keep only steps we understand, with safe values.
const cleanSteps = (steps) => (Array.isArray(steps) ? steps : []).slice(0, 12).map((s) => {
  const t = String(s?.type || '');
  if (t === 'theme' && /^[a-z0-9]{2,30}$/.test(s.id || '')) return { type: t, id: s.id };
  if (t === 'gentle') return { type: t, on: !!s.on };
  if (t === 'mood' && /^[a-z]{2,12}$/.test(s.mood || '')) return { type: t, mood: s.mood };
  if (t === 'radio' && /^[a-z0-9-]{2,30}$/.test(s.station || '')) return { type: t, station: s.station };
  if (t === 'ambience' && /^[a-z]{2,12}$/.test(s.preset || '')) return { type: t, preset: s.preset };
  if (t === 'volume') return { type: t, value: Math.max(5, Math.min(150, Math.round(Number(s.value) || 50))) };
  if (t === 'stop') return { type: t };
  if (t === 'checklist') return { type: t, match: String(s.match || '').slice(0, 40) };
  return null;
}).filter(Boolean);

const list = (userId) => {
  load();
  const uid = String(userId);
  if (!state.users[uid]) { state.users[uid] = STARTERS.map((r) => ({ id: newId(), ...JSON.parse(JSON.stringify(r)) })); save(); }
  return state.users[uid];
};
const saveRoutine = (userId, r) => {
  const all = list(userId);
  const name = String(r?.name || '').trim().slice(0, 30);
  if (!name) throw new Error('Give the routine a name.');
  const steps = cleanSteps(r.steps);
  if (!steps.length) throw new Error('Add at least one step.');
  const existing = r.id ? all.find((x) => x.id === r.id) : null;
  if (existing) Object.assign(existing, { name, emoji: String(r.emoji || existing.emoji || '⚡').slice(0, 8), steps });
  else { if (all.length >= 12) throw new Error('Up to 12 routines.'); all.push({ id: newId(), name, emoji: String(r.emoji || '⚡').slice(0, 8), steps }); }
  save();
  return existing || all[all.length - 1];
};
const remove = (userId, id) => { const all = list(userId); const n = all.length; state.users[String(userId)] = all.filter((x) => x.id !== id); save(); return state.users[String(userId)].length < n; };
const find = (userId, idOrName) => list(userId).find((r) => r.id === idOrName || r.name.toLowerCase() === String(idOrName || '').toLowerCase()) || null;

// Run the bot-side steps. `voice` may be null (then music steps are skipped).
const runServer = async (client, { guild, voice, userId, routine, textChannel }) => {
  const done = []; const skipped = [];
  for (const s of routine.steps) {
    if (!SERVER_STEPS.includes(s.type)) continue;
    try {
      if (s.type === 'checklist') {
        const lists = require('./checklists');
        const l = lists.forUser(userId).find((x) => !s.match || x.name.toLowerCase().includes(s.match.toLowerCase()));
        if (!l) { skipped.push('checklist (none found)'); continue; }
        const user = await client.users.fetch(userId);
        await user.send(lists.message(l));
        done.push(`☑️ ${l.name}`);
        continue;
      }
      if (!voice) { skipped.push(`${s.type} (join voice first)`); continue; }
      const q = () => client.distube.getQueue(guild.id);
      if (s.type === 'stop') { await q()?.stop().catch(() => {}); done.push('⏹ stopped'); }
      if (s.type === 'volume') { if (q()) { q().setVolume(s.value); done.push(`🔊 ${s.value}%`); } else skipped.push('volume (nothing playing yet)'); }
      if (s.type === 'ambience') { await q()?.stop().catch(() => {}); const p = await require('./ambience').playIn(client, voice, s.preset, { volume: 35, textChannel }); done.push(`${p.emoji} ${p.label}`); }
      if (s.type === 'radio') {
        const st = require('./radio').PRESETS.find((x) => x.name === s.station);
        if (!st) { skipped.push(`radio ${s.station}`); continue; }
        await q()?.stop().catch(() => {});
        await client.distube.play(voice, st.url, { textChannel, metadata: { localName: `📻 ${st.title}` } });
        done.push(`📻 ${st.title}`);
      }
      if (s.type === 'mood') {
        const moods = require('./moods');
        const plan = moods.forGuild(s.mood, guild.id, { size: 8 });
        const tracks = await moods.resolve(client.youtubePlugin, plan);
        if (!tracks.length) { skipped.push(`mood ${s.mood}`); continue; }
        if (q()?.songs?.[0]?.metadata?.ambience) await q().stop().catch(() => {});
        const pl = await client.distube.createCustomPlaylist(tracks.map((t) => t.url), { parallel: true, name: `${plan.mood.emoji} ${plan.mood.label} mix`, metadata: { quiet: true } });
        await client.distube.play(voice, pl, { textChannel, metadata: { quiet: true } });
        done.push(`${plan.mood.emoji} ${plan.mood.label} mix`);
      }
    } catch (e) { skipped.push(`${s.type}: ${e.message}`); }
  }
  return { done, skipped, panel: routine.steps.filter((s) => PANEL_STEPS.includes(s.type)) };
};

const _reset = () => { state = { users: {} }; };

module.exports = { list, saveRoutine, remove, find, runServer, cleanSteps, SERVER_STEPS, PANEL_STEPS, _reset };
