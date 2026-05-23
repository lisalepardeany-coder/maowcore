// Persistent reminders. Stored on disk, reloaded on startup.
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'data', 'reminders.json');

let state = { reminders: [] };

const load = () => {
  try {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!Array.isArray(state.reminders)) state.reminders = [];
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[reminders] load failed:', e.message);
  }
};

const save = () => {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, FILE);
  } catch (e) { console.warn('[reminders] save failed:', e.message); }
};

const add = (entry) => {
  state.reminders.push({ id: Date.now() + Math.random(), ...entry });
  save();
};
const remove = (id) => {
  state.reminders = state.reminders.filter((r) => r.id !== id);
  save();
};
const due = (now = Date.now()) => state.reminders.filter((r) => r.fireAt <= now);
const all = () => state.reminders.slice();

load();
module.exports = { add, remove, due, all };
