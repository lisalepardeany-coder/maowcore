'use strict';
// lib/announcement-presets.js
// Preset templates for /serverannouncement. Each is a ready-made embed the
// poster can drop in and optionally customise (message / title / link / image).
//
// Fields:
//   id, label, emoji, color, title, body
//   defaultPing : 'none' | 'here' | 'everyone'  (overridable per-post)
//   links?      : default link block for partnership-style presets
//   hint?       : usage hint shown in the ephemeral confirmation

const PRESETS = [
  {
    id: 'general', label: 'General Announcement', emoji: '📢', color: 0x5865F2,
    title: '📢 Announcement', defaultPing: 'none',
    body: 'Hey everyone! 👋',
    hint: 'Add your announcement text with the `message` option.',
  },
  {
    id: 'important', label: 'Important / PSA', emoji: '🚨', color: 0xED4245,
    title: '🚨 Important Notice', defaultPing: 'here',
    body: 'Please read the following carefully:',
    hint: 'Put the notice in `message`.',
  },
  {
    id: 'event', label: 'Event', emoji: '🎪', color: 0xEB459E,
    title: '🎪 Upcoming Event', defaultPing: 'here',
    body: ['We\'ve got an event coming up — don\'t miss it!', '',
      '> 📅 **When:** (add the date/time)', '> 📍 **Where:** (channel / platform)', '> 🎯 **What:** (describe it)'].join('\n'),
    hint: 'Use `message` for details; edit the When/Where/What lines after posting if you like.',
  },
  {
    id: 'giveaway', label: 'Giveaway', emoji: '🎉', color: 0xFEE75C,
    title: '🎉 GIVEAWAY 🎉', defaultPing: 'here',
    body: ['We\'re giving something away! 🎁', '',
      '> 🏆 **Prize:** (what they win)', '> 🎟️ **How to enter:** react with 🎉 below', '> ⏰ **Ends:** (when)', '> 👤 **Winners:** (how many)'].join('\n'),
    hint: 'Tip: for a real timed/auto-drawn giveaway use `/giveaway` instead.',
  },
  {
    id: 'maintenance', label: 'Maintenance / Downtime', emoji: '🔧', color: 0xFFA500,
    title: '🔧 Scheduled Maintenance', defaultPing: 'here',
    body: ['Heads up — some scheduled maintenance is happening.', '',
      '> 🕐 **When:** (date/time + timezone)', '> ⏳ **Expected downtime:** (duration)', '> 📋 **What\'s affected:** (services)'].join('\n'),
    hint: 'Add specifics in `message`.',
  },
  {
    id: 'rules', label: 'Rules Update', emoji: '📜', color: 0x57F287,
    title: '📜 Rules Updated', defaultPing: 'here',
    body: ['Our server rules have been updated. Please give them a read in the rules channel.', '',
      '**What changed:**'].join('\n'),
    hint: 'List the changes in `message`.',
  },
  {
    id: 'partnership', label: 'Partnership (generic)', emoji: '🤝', color: 0x00B0F4,
    title: '🤝 New Partnership!', defaultPing: 'here', links: {},
    body: ['We\'re excited to announce a new partnership! 🎉', '',
      'Go show our partner some love — drop a follow and say hi.'].join('\n'),
    hint: 'Pass `partner` for the name and `twitch`/`youtube`/`discord`/`website` for links.',
  },
  {
    // The one you asked for — partnership with ErroxSystems / Errox.
    id: 'errox', label: 'ErroxSystems Partnership', emoji: '⭐', color: 0x9146FF,
    title: '⭐ Official Partnership — ErroxSystems', defaultPing: 'here',
    // Verified YouTube; add twitch/discord via options (or tell me to bake them in).
    links: { youtube: 'https://www.youtube.com/@Erroxsystem' },
    partner: 'ErroxSystems',
    footer: 'Partnership',
    body: ['We\'re proud to announce an official partnership with **ErroxSystems**! 🤝✨', '',
      'We\'re teaming up with **Errox / ErroxSystems** — go show them some love, drop a follow, and join the community. Expect collabs, events, and good times ahead.', '',
      'Welcome to the family! 💜'].join('\n'),
    hint: 'Override the links with `twitch:` / `youtube:` / `discord:` / `website:` if these defaults are wrong.',
  },
  {
    // German version of the ErroxSystems partnership announcement.
    id: 'errox-de', label: 'ErroxSystems Partnerschaft', emoji: '🇩🇪', color: 0x9146FF,
    title: '⭐ Offizielle Partnerschaft — ErroxSystems', defaultPing: 'here',
    links: { youtube: 'https://www.youtube.com/@Erroxsystem' },
    partner: 'ErroxSystems', footer: 'Partnerschaft',
    body: ['Wir freuen uns, eine offizielle **Partnerschaft mit ErroxSystems** bekanntzugeben! 🤝✨', '',
      'Wir tun uns mit **Errox / ErroxSystems** zusammen — schaut unbedingt vorbei, lasst ein Abo da und werdet Teil der Community. Es erwarten euch Collabs, Events und jede Menge gute Vibes.', '',
      'Willkommen in der Familie! 💜'].join('\n'),
    hint: 'Links per `twitch:` / `discord:` ergänzen, falls gewünscht.',
  },
  {
    id: 'live', label: 'Going Live', emoji: '🔴', color: 0xFF3B30,
    title: '🔴 WE\'RE LIVE!', defaultPing: 'here', links: {},
    body: ['The stream is starting now — come hang out! 🎮', '', 'Drop a follow and bring your friends.'].join('\n'),
    hint: 'Pass the stream URL via `link` or `twitch`.',
  },
  {
    id: 'video', label: 'New Video', emoji: '📹', color: 0xFF0000,
    title: '📹 New Video Out Now!', defaultPing: 'here', links: {},
    body: ['A new video just dropped — go watch, like, and comment! ▶️'].join('\n'),
    hint: 'Pass the video URL via `link` or `youtube`.',
  },
  {
    id: 'poll', label: 'Community Poll / Vote', emoji: '🗳️', color: 0x3498DB,
    title: '🗳️ Community Vote', defaultPing: 'here',
    body: ['We want your opinion! Vote by reacting below. 👇', '', '**The question:**'].join('\n'),
    hint: 'Put the question + options in `message`; react with the option emojis after posting.',
  },
  {
    id: 'milestone', label: 'Milestone / Celebration', emoji: '🎯', color: 0xFFD700,
    title: '🎯 Milestone Reached!', defaultPing: 'everyone',
    body: ['We just hit a huge milestone — and it\'s all thanks to YOU. 🥳🎉', '', 'Thank you for being part of this community! 💖'].join('\n'),
    hint: 'Say which milestone in `message` (e.g. "1,000 members!").',
  },
  {
    id: 'update', label: 'Server Update', emoji: '🆕', color: 0x8B5CF6,
    title: '🆕 Server Update', defaultPing: 'none',
    body: ['We\'ve made some changes around the server. Here\'s what\'s new:'].join('\n'),
    hint: 'List the changes in `message`.',
  },
  {
    id: 'welcome', label: 'Welcome / Read First', emoji: '👋', color: 0x57F287,
    title: '👋 Welcome!', defaultPing: 'none',
    body: ['Welcome to the server! We\'re glad you\'re here. 💫', '',
      '> 📜 Read the rules', '> 🎭 Grab your roles', '> 💬 Say hi in general', '', 'Have fun! ✦'].join('\n'),
    hint: 'Customise with `message`.',
  },
];

const byId = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
const getPreset = (id) => byId[id] || null;
const presetChoices = PRESETS.map((p) => ({ name: `${p.emoji} ${p.label}`, value: p.id }));

module.exports = { PRESETS, getPreset, presetChoices };
