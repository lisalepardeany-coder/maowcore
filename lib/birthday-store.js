// Birthdays: one place to read and write them.
//
// /birthday and /community birthday used to save into the same setting
// (`birthdays`) in two different shapes, so each ignored the other's birthdays
// and `/community birthday list` showed junk entries ("people", "channelId").
// Two daily checks could also both post. Now everything uses one shape:
//
//   birthdays: { people: { <userId>: { d, m } }, channelId, roleId, lastRun, roleGiven }
//
// Older /community data (people at the top level) and its channel/role
// settings (birthdayChannelId / birthdayRoleId, also set by /setup) are still
// read, and saved in the new shape the next time anything changes.
const { getGuild, updateGuild } = require('./config');

const isEntry = (k, v) => /^\d{5,25}$/.test(k) && !!v && typeof v === 'object' && Number.isInteger(v.d) && Number.isInteger(v.m);

// Pure (tested): any stored form → the one shape. `g` = the guild's settings.
const norm = (raw, g = {}) => {
  const b = raw && typeof raw === 'object' ? raw : {};
  const people = {};
  for (const [k, v] of Object.entries(b)) if (isEntry(k, v)) people[k] = { d: v.d, m: v.m };
  for (const [k, v] of Object.entries(b.people || {})) if (isEntry(k, v)) people[k] = { d: v.d, m: v.m };
  return {
    people,
    // "in": /birthday setup with no channel turns wishes off (null) and must stay off.
    channelId: 'channelId' in b ? b.channelId || null : g.birthdayChannelId || null,
    roleId: 'roleId' in b ? b.roleId || null : g.birthdayRoleId || null,
    lastRun: b.lastRun || null,
    roleGiven: Array.isArray(b.roleGiven) ? b.roleGiven : [],
  };
};

const get = (gid) => { const g = getGuild(gid); return norm(g.birthdays, g); };
const save = (gid, data) => updateGuild(gid, { birthdays: norm({ ...data, people: data.people }) });
const update = (gid, fn) => { const data = get(gid); fn(data); save(gid, data); return data; };

module.exports = { norm, get, save, update };
