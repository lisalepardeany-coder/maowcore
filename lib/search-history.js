// Dashboard search-query history. Per-guild (since the dashboard is single-user).
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'data', 'searches.json');
const MAX = 100;

let state = { searches: [] };
let saveTimer = null;

const load = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    state = parsed && typeof parsed === 'object' ? parsed : { searches: [] };
    if (!Array.isArray(state.searches)) state.searches = [];
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[search-history] load failed:', e.message);
  }
};

const save = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, FILE);
    } catch (e) { console.warn('[search-history] save failed:', e.message); }
  }, 1000);
};

const record = (query, resultCount) => {
  if (!query?.trim()) return;
  // Deduplicate: if the same query was just searched, move it to top instead.
  state.searches = state.searches.filter((s) => s.query !== query);
  state.searches.unshift({ query, resultCount: Number(resultCount) || 0, ts: Date.now() });
  if (state.searches.length > MAX) state.searches.length = MAX;
  save();
};

const list = (limit = 50) => state.searches.slice(0, limit);

const clear = () => { state.searches = []; save(); };

load();

module.exports = { record, list, clear };
