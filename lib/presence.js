const { ActivityType } = require('discord.js');
const { truncate } = require('./format');

const IDLE = { name: 'cosmic transmissions · /help', type: ActivityType.Listening };
const NAME_MAX = 110;

const apply = (client, activity) => {
  try {
    client.user?.setActivity(activity.name, { type: activity.type });
  } catch (e) {
    console.warn('Failed to set presence:', e.message);
  }
};

const setIdle = (client) => apply(client, IDLE);

const setPlaying = (client, song, paused = false) => {
  const name = truncate(song?.name || 'unknown signal', NAME_MAX);
  apply(client, { name: `${paused ? '⏸ ' : ''}${name}`, type: ActivityType.Listening });
};

const refresh = (client, queue) => {
  if (!queue?.songs?.length) return setIdle(client);
  setPlaying(client, queue.songs[0], queue.paused);
};

module.exports = { setIdle, setPlaying, refresh };
