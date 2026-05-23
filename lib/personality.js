// Bot tone presets. Use `phrase(guildId, key)` to look up a localized string.
const { getGuild } = require('./config');

const PHRASES = {
  cosmic: {
    nothingPlaying: '◌ No active transmission.',
    queueEmpty: '◌ Queue is empty.',
    notInVoice: '◌ Board a voice channel first — cannot transmit into the void.',
    paused: '⏸  Transmission suspended.',
    resumed: '▶  Transmission resumed.',
    skipped: '⏭  Warping to next signal',
    stopped: '⏹  Engines offline. Queue jettisoned into the void.',
    shuffled: '✦  Cargo manifest scrambled.',
    leaving: '⌬  Disengaging — returning to the void.',
  },
  formal: {
    nothingPlaying: 'No active queue.',
    queueEmpty: 'The queue is empty.',
    notInVoice: 'Please join a voice channel before issuing this command.',
    paused: 'Playback paused.',
    resumed: 'Playback resumed.',
    skipped: 'Skipped to next track',
    stopped: 'Playback stopped and queue cleared.',
    shuffled: 'Queue has been shuffled.',
    leaving: 'Disconnecting from voice channel.',
  },
  chatty: {
    nothingPlaying: "There's nothing playing right now! 🎵",
    queueEmpty: 'Queue is super empty! 😅',
    notInVoice: 'Hop into a voice channel first so I can join you! 🎤',
    paused: 'Paused! 🤫 Hit resume when ready.',
    resumed: 'And we are back! 🎶',
    skipped: 'Skipping ahead! ⏭️ Next up',
    stopped: "Alright, stopping for now! 👋 Queue's gone.",
    shuffled: 'Shuffled it up for you! 🔀',
    leaving: "Heading out — see ya! 👋",
  },
  meme: {
    nothingPlaying: 'bro nothing is playing 💀',
    queueEmpty: 'queue is mad empty fr',
    notInVoice: 'where are u tho. join vc first 😭',
    paused: 'paused. respectfully.',
    resumed: 'we back gang',
    skipped: 'next ⏭️ no thoughts',
    stopped: 'stopped. queue is gone. mid track anyway',
    shuffled: 'shuffled the whole vibe',
    leaving: 'ima head out',
  },
};

const phrase = (guildId, key) => {
  const tone = getGuild(guildId)?.tone || 'cosmic';
  return PHRASES[tone]?.[key] || PHRASES.cosmic[key] || key;
};

module.exports = { phrase, TONES: Object.keys(PHRASES) };
