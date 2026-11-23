// Fun (v3.4): virtual pets, daily coins, built-in shop items, inventory.
// State lives in the guild config under `fun`; coins use lib/economy.js.
const { getGuild, updateGuild } = require('./config');

const SPECIES = {
  cat: { emoji: '🐱', name: 'Cat', faces: ['😿', '🐱', '😺', '😸'] },
  dog: { emoji: '🐶', name: 'Dog', faces: ['🥺', '🐶', '🐕', '🦮'] },
  dragon: { emoji: '🐉', name: 'Dragon', faces: ['🥀', '🐉', '🔥', '🌋'] },
  slime: { emoji: '🟢', name: 'Slime', faces: ['💧', '🟢', '💚', '✨'] },
  ghost: { emoji: '👻', name: 'Ghost', faces: ['🕯', '👻', '🫥', '🌙'] },
  bunny: { emoji: '🐰', name: 'Bunny', faces: ['🥕', '🐰', '🐇', '🌸'] },
  axolotl: { emoji: '🦎', name: 'Axolotl', faces: ['🫧', '🦎', '💗', '🌊'] },
};

// Built-in shop items (in every server, next to anything mods add in the panel).
const ITEMS = {
  treat: { name: '🍪 Pet treat', cost: 15, desc: 'Fills your pet\'s hunger a lot', use: { hunger: 45 } },
  toy: { name: '🧸 Pet toy', cost: 20, desc: 'Makes your pet very happy', use: { happy: 45 } },
  bed: { name: '🛏 Cosy bed', cost: 25, desc: 'Your pet wakes up fully rested', use: { energy: 60 } },
  potion: { name: '🧪 Sparkle potion', cost: 40, desc: '+30 to everything', use: { hunger: 30, happy: 30, energy: 30 } },
  bow: { name: '🎀 Bow', cost: 60, desc: 'A cute accessory shown on your pet card', wear: '🎀' },
  crown: { name: '👑 Tiny crown', cost: 150, desc: 'For royalty. Shown on your pet card', wear: '👑' },
  title: { name: '🏷 Custom title', cost: 100, desc: 'Pick a title shown on your pet card (/shop title)', title: true },
};

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const store = (guildId) => {
  const f = getGuild(guildId).fun || {};
  return { pets: f.pets || {}, inv: f.inv || {}, daily: f.daily || {}, titles: f.titles || {}, wear: f.wear || {} };
};
const save = (guildId, s) => updateGuild(guildId, { fun: s });

// ===== Pets (pure parts unit tested) =====
const DECAY = { hunger: 30, happy: 40, energy: 50 };   // minutes per point lost
const decay = (pet, now = Date.now()) => {
  const mins = Math.max(0, (now - (pet.updatedAt || now)) / 60000);
  const p = { ...pet };
  for (const [k, per] of Object.entries(DECAY)) p[k] = clamp((p[k] ?? 80) - mins / per);
  p.updatedAt = now;
  return p;
};
const moodOf = (p) => {
  const avg = (p.hunger + p.happy + p.energy) / 3;
  return avg < 25 ? 0 : avg < 50 ? 1 : avg < 80 ? 2 : 3;
};
const MOOD_TEXT = ['needs you right now', 'is a bit down', 'is doing fine', 'is super happy'];
const COOLDOWN = { feed: 20 * 60000, play: 10 * 60000, sleep: 60 * 60000 };
const act = (pet, action, now = Date.now()) => {
  let p = decay(pet, now);
  const last = (p.cool || {})[action] || 0;
  if (COOLDOWN[action] && now - last < COOLDOWN[action]) {
    const mins = Math.ceil((COOLDOWN[action] - (now - last)) / 60000);
    return { pet: p, ok: false, msg: `${p.name} isn't ready for that yet — try again in ${mins} min.` };
  }
  let msg;
  if (action === 'feed') { if (p.hunger >= 95) return { pet: p, ok: false, msg: `${p.name} is already full.` }; p.hunger = clamp(p.hunger + 30); msg = `You fed ${p.name}. Nom nom.`; }
  if (action === 'play') { if (p.energy < 15) return { pet: p, ok: false, msg: `${p.name} is too tired to play. Let them sleep.` }; p.happy = clamp(p.happy + 25); p.energy = clamp(p.energy - 12); msg = `You played with ${p.name}!`; }
  if (action === 'sleep') { p.energy = clamp(p.energy + 45); msg = `${p.name} had a good nap. Zzz…`; }
  p.cool = { ...(p.cool || {}), [action]: now };
  p.care = (p.care || 0) + 1;
  p.level = 1 + Math.floor(p.care / 10);
  p = { ...p, updatedAt: now };
  return { pet: p, ok: true, msg };
};
const newPet = (name, species, now = Date.now()) => ({ name: String(name).slice(0, 24), species, hunger: 80, happy: 80, energy: 80, care: 0, level: 1, born: now, updatedAt: now, cool: {} });

const getPet = (guildId, userId) => { const s = store(guildId); const p = s.pets[userId]; return p ? decay(p) : null; };
const setPet = (guildId, userId, pet) => { const s = store(guildId); if (pet) s.pets[userId] = pet; else delete s.pets[userId]; save(guildId, s); };

// ===== Inventory =====
const inventory = (guildId, userId) => store(guildId).inv[userId] || {};
const addItem = (guildId, userId, id, n = 1) => { const s = store(guildId); const inv = s.inv[userId] || {}; inv[id] = (inv[id] || 0) + n; s.inv[userId] = inv; save(guildId, s); return inv[id]; };
const takeItem = (guildId, userId, id) => {
  const s = store(guildId); const inv = s.inv[userId] || {};
  if (!inv[id]) return false;
  inv[id] -= 1; if (!inv[id]) delete inv[id];
  s.inv[userId] = inv; save(guildId, s); return true;
};
const useItem = (guildId, userId, id) => {
  const item = ITEMS[id];
  if (!item) throw new Error('Unknown item.');
  if (item.title) throw new Error('Use `/shop title` to set your title.');
  if (item.wear) {
    if (!takeItem(guildId, userId, id)) throw new Error(`You don't have a ${item.name}. Buy one with /shop buy.`);
    const s = store(guildId); s.wear[userId] = item.wear; save(guildId, s);
    return `${item.name} equipped!`;
  }
  const pet = getPet(guildId, userId);
  if (!pet) throw new Error('You need a pet first: /pet adopt');
  if (!takeItem(guildId, userId, id)) throw new Error(`You don't have a ${item.name}. Buy one with /shop buy.`);
  for (const [k, v] of Object.entries(item.use)) pet[k] = clamp(pet[k] + v);
  setPet(guildId, userId, pet);
  return `${pet.name} loved the ${item.name}!`;
};

// ===== Daily coins (pure streak logic tested) =====
const dayNum = (ts) => Math.floor((ts - new Date(ts).getTimezoneOffset() * 60000) / 86400000);
const dailyReward = (last, streak, now = Date.now()) => {
  const today = dayNum(now);
  if (last != null && dayNum(last) === today) return { ok: false };
  const s = last != null && dayNum(last) === today - 1 ? (streak || 0) + 1 : 1;
  return { ok: true, streak: s, coins: 50 + Math.min(100, (s - 1) * 10) };
};
const claimDaily = (guildId, userId) => {
  const s = store(guildId);
  const d = s.daily[userId] || {};
  const r = dailyReward(d.last, d.streak);
  if (!r.ok) return r;
  s.daily[userId] = { last: Date.now(), streak: r.streak };
  save(guildId, s);
  require('./economy').award(guildId, userId, r.coins, 'daily');
  return r;
};

const setTitle = (guildId, userId, title) => { const s = store(guildId); s.titles[userId] = String(title).slice(0, 40); save(guildId, s); };
const profileBits = (guildId, userId) => { const s = store(guildId); return { title: s.titles[userId] || null, wear: s.wear[userId] || null }; };

// Small coin rewards from games (never throws).
const reward = (guildId, userId, coins, source) => {
  try { if (guildId && coins > 0) require('./economy').award(guildId, userId, coins, source); } catch { /* economy unavailable */ }
};

module.exports = {
  SPECIES, ITEMS, decay, act, moodOf, MOOD_TEXT, newPet, getPet, setPet,
  inventory, addItem, takeItem, useItem, dailyReward, claimDaily, setTitle, profileBits, reward, clamp,
};
