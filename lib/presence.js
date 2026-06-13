const { ActivityType, PresenceUpdateStatus } = require('discord.js');
const { truncate } = require('./format');
const fs = require('node:fs');
const path = require('node:path');

// Persisted custom-presence config (set from the dashboard). When enabled it
// overrides the idle text + online status; with staticMode it also overrides
// the dynamic now-playing presence.
const FILE = path.join(__dirname, '..', 'data', 'presence.json');
const DEFAULT_IDLE = { name: 'cosmic transmissions · /help', type: ActivityType.Listening };
const NAME_MAX = 110;

const TYPE_MAP = {
  Playing: ActivityType.Playing, Listening: ActivityType.Listening,
  Watching: ActivityType.Watching, Competing: ActivityType.Competing, Custom: ActivityType.Custom,
};
const STATUS_MAP = {
  online: PresenceUpdateStatus.Online, idle: PresenceUpdateStatus.Idle,
  dnd: PresenceUpdateStatus.DoNotDisturb, invisible: PresenceUpdateStatus.Invisible,
};

const getConfig = () => {
  try {
    const c = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return {
      enabled: !!c.enabled, status: c.status || 'online',
      type: c.type || 'Listening', text: c.text || '', staticMode: !!c.staticMode,
    };
  } catch {
    return { enabled: false, status: 'online', type: 'Listening', text: '', staticMode: false };
  }
};

const setConfig = (c) => {
  const next = {
    enabled: !!c.enabled,
    status: ['online', 'idle', 'dnd', 'invisible'].includes(c.status) ? c.status : 'online',
    type: TYPE_MAP[c.type] !== undefined ? c.type : 'Listening',
    text: String(c.text || '').slice(0, 128),
    staticMode: !!c.staticMode,
  };
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(next)); }
  catch (e) { console.warn('[presence] save failed:', e.message); }
  return next;
};

const customIdle = () => {
  const c = getConfig();
  if (c.enabled && c.text) return { name: c.text, type: TYPE_MAP[c.type] ?? ActivityType.Listening };
  return DEFAULT_IDLE;
};

const apply = (client, activity) => {
  try {
    const c = getConfig();
    const status = c.enabled && STATUS_MAP[c.status] ? STATUS_MAP[c.status] : undefined;
    client.user?.setPresence({
      activities: [{ name: activity.name, type: activity.type }],
      ...(status ? { status } : {}),
    });
  } catch (e) {
    console.warn('Failed to set presence:', e.message);
  }
};

const setIdle = (client) => apply(client, customIdle());

const setPlaying = (client, song, paused = false) => {
  const c = getConfig();
  if (c.enabled && c.staticMode && c.text) return setIdle(client); // static override
  const name = truncate(song?.name || 'unknown signal', NAME_MAX);
  apply(client, { name: `${paused ? '⏸ ' : ''}${name}`, type: ActivityType.Listening });
};

const refresh = (client, queue) => {
  const c = getConfig();
  if (c.enabled && c.staticMode && c.text) return setIdle(client);
  if (!queue?.songs?.length) return setIdle(client);
  setPlaying(client, queue.songs[0], queue.paused);
};

// Re-apply the configured/idle presence immediately (dashboard editor + on ready).
const applyNow = (client) => setIdle(client);

module.exports = { setIdle, setPlaying, refresh, getConfig, setConfig, applyNow };
