// No-code custom slash commands for v2.6.0.
//
// Each entry: { id, guildId, name (slug), description, template, role?, embed? }
// `template` supports tokens: {user}, {server}, {arg1}..{arg5}, {random:a,b,c}
//
// Custom commands are NOT registered as actual Discord slash commands (that
// would require redeploy per change). Instead the dashboard exposes them as
// runnable buttons on a dedicated page, and the existing /tag command can
// trigger them by name. Future v3 milestone: full slash registration with
// dynamic redeploy via /commands/reload.

const fs = require('node:fs');
const path = require('node:path');

const PATH = path.join(__dirname, '..', 'data', 'custom-commands.json');
let state = { guilds: {} };

const load = () => {
  try { state = JSON.parse(fs.readFileSync(PATH, 'utf8')); if (!state.guilds) state.guilds = {}; }
  catch (e) { if (e.code !== 'ENOENT') console.warn('[custom-cmds] load failed:', e.message); }
};
const save = () => {
  try {
    fs.mkdirSync(path.dirname(PATH), { recursive: true });
    const tmp = `${PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, PATH);
  } catch (e) { console.warn('[custom-cmds] save failed:', e.message); }
};

const newId = () => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 32);

const listFor = (guildId) => Object.values(state.guilds[guildId]?.cmds || {});
const find = (guildId, name) => listFor(guildId).find((c) => c.name === name) || null;

const add = (guildId, { name, description, template, role, embed }) => {
  const slug = slugify(name);
  if (!slug) throw new Error('name required');
  if (!template) throw new Error('template required');
  if (!state.guilds[guildId]) state.guilds[guildId] = { cmds: {} };
  if (state.guilds[guildId].cmds[slug]) throw new Error(`Already exists: /${slug}`);
  const cmd = {
    id: newId(),
    guildId,
    name: slug,
    description: String(description || '').slice(0, 100),
    template: String(template).slice(0, 2000),
    role: role || null,
    embed: !!embed,
    createdAt: Date.now(),
    runCount: 0,
  };
  state.guilds[guildId].cmds[slug] = cmd;
  save();
  return cmd;
};

const remove = (guildId, name) => {
  const slug = slugify(name);
  const g = state.guilds[guildId];
  if (!g?.cmds?.[slug]) return false;
  delete g.cmds[slug];
  save();
  return true;
};

// Render a template against the given context. Supports:
//   {user}, {server}, {arg1}…{arg5}, {random:a,b,c}
const render = (template, ctx = {}) => {
  let out = String(template || '');
  out = out.replace(/\{user\}/g, ctx.user || '');
  out = out.replace(/\{server\}/g, ctx.server || '');
  for (let i = 1; i <= 5; i++) {
    out = out.replace(new RegExp(`\\{arg${i}\\}`, 'g'), ctx.args?.[i - 1] || '');
  }
  out = out.replace(/\{random:([^}]+)\}/g, (_, choices) => {
    const arr = choices.split(',').map((s) => s.trim()).filter(Boolean);
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : '';
  });
  return out;
};

const noteRun = (guildId, name) => {
  const c = find(guildId, name);
  if (c) { c.runCount++; save(); }
};

load();
module.exports = { listFor, find, add, remove, render, noteRun, slugify };
