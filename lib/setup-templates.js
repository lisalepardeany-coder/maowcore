'use strict';
// lib/setup-templates.js
// Declarative server templates consumed by lib/setup-engine.js.
//
// Role flags the engine understands:
//   admin · mod · vip · sub · member · muted · selfAssign · ping
// Channel flags:
//   perm (preset name) · voice · topic · config (save id to this guild-config key)
//   rules · roleSelect · verify · info · stats (members|bots|channels|roles|boosts)

// ── shared role builders ─────────────────────────────────────────────────────
const owner   = (name, color) => ({ name, color, hoist: true, mentionable: true, admin: true });
const member  = (name, color) => ({ name, color, member: true });
const vip     = (name, color) => ({ name, color, hoist: true, vip: true });
const sub     = (name, color) => ({ name, color, hoist: true, sub: true });
const modr    = (name, color, perms) => ({ name, color, hoist: true, mentionable: true, mod: true, ...(perms ? { perms } : {}) });

// Standard staff ladder reused by every template.
const STAFF = [
  { name: '🔴 Admin', color: 0xED4245, hoist: true, mentionable: true, admin: true },
  modr('🟠 Head Mod', 0xFFA500),
  modr('🟡 Moderator', 0xFEE75C),
  modr('🟢 Trial Mod', 0x57F287, ['ManageMessages', 'ModerateMembers', 'ManageThreads', 'ViewAuditLog']),
];

// Self-assignable + ping roles. 🔔 Bot Updates is what /announceupdate pings.
const SELF = [
  { name: '🔔 Bot Updates', color: 0x5865F2, mentionable: true, selfAssign: true, ping: true, emoji: '🔔', desc: 'Get pinged when the MaowCore bot updates.' },
  { name: '🔴 Live Notifs', color: 0xFF3B30, mentionable: true, selfAssign: true, live: true, emoji: '🔴', desc: 'Get pinged when we go live / post new content.' },
  { name: '🎉 Events', color: 0xEB459E, mentionable: true, selfAssign: true, emoji: '🎉', desc: 'Get notified for events & giveaways.' },
  { name: '🎮 Gamer', color: 0x43B581, selfAssign: true, emoji: '🎮', desc: 'Tag yourself for LFG / game nights.' },
];
const MUTED = { name: '🔇 Muted', color: 0x6B7280, muted: true };

// ── shared rule sets ─────────────────────────────────────────────────────────
const BASE_RULES = [
  { t: 'Be respectful', d: 'No harassment, hate speech, slurs, racism, sexism, or personal attacks. Treat everyone with kindness.' },
  { t: 'No spam', d: 'No spam, mass pings, emoji walls, or repeated messages. Keep channels readable.' },
  { t: 'Use the right channels', d: 'Keep topics where they belong — read each channel’s description before posting.' },
  { t: 'Keep it SFW', d: 'No NSFW, gore, or shock content anywhere. This is a public community.' },
  { t: 'No advertising / DM spam', d: 'No unsolicited self-promo, server invites, or DM advertising without staff permission.' },
  { t: 'No drama, doxxing, or threats', d: 'Never share anyone’s personal info. Threats, raids, or doxxing = instant ban.' },
  { t: 'Follow Discord’s ToS', d: 'You must be 13+. All Discord Terms of Service & Community Guidelines apply here.' },
  { t: 'Listen to staff', d: 'Staff have the final say. Disagree with a decision? Open a ticket — don’t argue in chat.' },
];

// ── shared category builders ─────────────────────────────────────────────────
const head = (go) => ([
  { name: '📢 INFORMATION', perm: 'readOnly', channels: [
    { name: '📜-rules', rules: true },
    { name: '📣-announcements', perm: 'announce', config: 'announcementsChannelId', topic: 'Official announcements.' },
    go,
    { name: '🔔-bot-updates', perm: 'announce', config: 'updatesChannelId', topic: 'MaowCore bot changelogs & update notes.' },
    { name: '❓-faq', perm: 'readOnly', topic: 'Frequently asked questions.' },
  ] },
  { name: '👋 WELCOME', perm: 'public', channels: [
    { name: '✅-verify', perm: 'readOnly', verify: true, topic: 'React ✅ to agree to the rules and unlock the server.' },
    { name: '🎭-pick-roles', perm: 'readOnly', roleSelect: true, topic: 'React to assign yourself roles.' },
    { name: '✧-welcome', perm: 'announce', config: 'welcomeChannelId', topic: 'Member join messages.' },
    { name: '👋-introductions', topic: 'Introduce yourself!' },
  ] },
]);
const BOT_CAT = { name: '🤖 BOT', perm: 'public', channels: [
  { name: '🎵-music', config: 'musicChannelId', topic: '/play · /skip · /queue · /nowplaying' },
  { name: '🤖-commands', topic: 'Use bot commands here.' },
  { name: '🎤-song-requests', topic: 'Request songs for the queue — Song · Artist [URL].' },
] };
const STAFF_CAT = { name: '🛡️ STAFF', perm: 'staffOnly', channels: [
  { name: '💼-staff-chat', topic: 'Private staff discussion.' },
  { name: '⌬-mod-log', config: 'modlogChannelId', topic: 'Automated moderation log.' },
  { name: '🚨-reports', topic: 'User reports land here.' },
  { name: '📋-staff-log', config: 'staffLogsChannelId', topic: 'Audit + action history.' },
] };
const voice = (extra = []) => ({ name: '🔊 VOICE', perm: 'voicePublic', voice: true, channels: [
  { name: '➕ Create Room', config: 'autoVoiceRoomId' },
  { name: '🎙️ Hangout 1' }, { name: '🎙️ Hangout 2' },
  ...extra,
  { name: '🎧 Music Lounge' },
  { name: '🛡️ Staff Voice', perm: 'staffVoice' },
  { name: '💤 AFK' },
] });
const STATS_CAT = { name: '📊 STATS', perm: 'stats', voice: true, channels: [
  { name: '👥 Members: —', stats: 'members' },
  { name: '🚀 Boosts: —', stats: 'boosts' },
] };

// Assemble a template's role list: owner + staff + creator extras + member + self + muted.
const roles = (ownerDef, extras, memberDef) => [ownerDef, ...STAFF, ...extras, memberDef, ...SELF, MUTED];

// ── templates ────────────────────────────────────────────────────────────────
const TEMPLATES = [
  // 1 ── Twitch streamer ──────────────────────────────────────────────────────
  {
    id: 'twitch', label: 'Twitch Streamer', emoji: '🟣', accent: 0x9146FF,
    blurb: 'A server for a Twitch streamer & their community',
    roles: roles(
      owner('👑 Broadcaster', 0x9146FF),
      [
        { name: '✏️ Editor', color: 0x9146FF, hoist: true, mentionable: true, mod: true, perms: ['ManageChannels', 'ManageMessages', 'ManageEvents', 'ManageThreads'] },
        vip('💎 VIP', 0x00CED1), sub('💜 Subscriber', 0xA970FF),
        { name: '📢 Content Creator', color: 0xFF4500 },
      ],
      member('👤 Viewer', 0x9aa0a6),
    ),
    categories: [
      ...head({ name: '🔴-go-live', perm: 'announce', config: 'liveChannelId', topic: 'Go-live pings — grab 🔴 Live Notifs in pick-roles.' }),
      { name: '💬 COMMUNITY', perm: 'public', channels: [
        { name: '💬-general' }, { name: '🎲-off-topic' }, { name: '😂-memes' },
        { name: '🖼️-media' }, { name: '📢-self-promo', topic: 'Share your own content — once per day.' },
      ] },
      { name: '🟣 STREAM', perm: 'public', channels: [
        { name: '📅-schedule', perm: 'announce', topic: 'Streaming schedule.' },
        { name: '🎬-vods', perm: 'announce', topic: 'Past broadcasts & uploads.' },
        { name: '✂️-clip-it', topic: 'Submit your best stream clips.' },
        { name: '💜-sub-lounge', perm: 'subOnly', topic: 'Subscribers-only chat. 💜' },
        { name: '💎-vip-lounge', perm: 'vipOnly', topic: 'VIP-only chat.' },
        { name: '🎁-giveaways', perm: 'announce', topic: 'Sub giveaways & drops.' },
      ] },
      BOT_CAT, STAFF_CAT,
      voice([{ name: '🔴 Stream Chat' }, { name: '🎮 Gaming' }, { name: '💜 Sub Voice', perm: 'subVoice' }]),
      STATS_CAT,
    ],
    rules: [...BASE_RULES, { t: 'No backseating / spoilers', d: 'Don’t backseat-game or spoil during streams unless the streamer asks. Keep chat fun.' }],
  },

  // 2 ── YouTube creator ───────────────────────────────────────────────────────
  {
    id: 'youtube', label: 'YouTube Creator', emoji: '📹', accent: 0xFF0000,
    blurb: 'A server for a YouTube creator & their subscribers',
    roles: roles(
      owner('🎬 Creator', 0xFF0000),
      [
        { name: '✏️ Editor', color: 0xFF0000, hoist: true, mentionable: true, mod: true, perms: ['ManageChannels', 'ManageMessages', 'ManageThreads'] },
        sub('🌟 Channel Member', 0xFFD700), vip('💎 OG', 0x00CED1),
        { name: '📢 Fellow Creator', color: 0xFF4500 },
      ],
      member('👤 Subscriber', 0x9aa0a6),
    ),
    categories: [
      ...head({ name: '📹-new-videos', perm: 'announce', config: 'liveChannelId', topic: 'New uploads & premieres — grab 🔴 Live Notifs.' }),
      { name: '💬 COMMUNITY', perm: 'public', channels: [
        { name: '💬-general' }, { name: '🎲-off-topic' }, { name: '😂-memes' },
        { name: '🎨-fan-art', topic: 'Fan art & edits — credit original artists.' }, { name: '📢-self-promo' },
      ] },
      { name: '📹 VIDEOS', perm: 'public', channels: [
        { name: '🎞️-premieres', perm: 'announce', topic: 'Premiere watch-alongs.' },
        { name: '💬-video-discussion', topic: 'Discuss the latest videos.' },
        { name: '💡-video-ideas', topic: 'Suggest video ideas.' },
        { name: '🌟-members-only', perm: 'subOnly', topic: 'Channel members only. 🌟' },
        { name: '🎁-giveaways', perm: 'announce' },
      ] },
      BOT_CAT, STAFF_CAT,
      voice([{ name: '🎥 Watch Party' }, { name: '🌟 Members Voice', perm: 'subVoice' }]),
      STATS_CAT,
    ],
    rules: [...BASE_RULES, { t: 'No comment-section drama', d: 'Keep YouTube comment beef off the server. Be cool to fellow subs.' }],
  },

  // 3 ── Variety / multi-platform streamer ─────────────────────────────────────
  {
    id: 'variety', label: 'Variety Streamer', emoji: '🎲', accent: 0x7C4DFF,
    blurb: 'Multi-platform creator (Twitch + YouTube + Kick)',
    roles: roles(
      owner('🌟 Creator', 0x7C4DFF),
      [
        { name: '✏️ Editor', color: 0x7C4DFF, hoist: true, mentionable: true, mod: true, perms: ['ManageChannels', 'ManageMessages', 'ManageThreads'] },
        vip('💎 VIP', 0x00CED1), sub('💜 Supporter', 0xA970FF),
        { name: '📢 Content Creator', color: 0xFF4500 },
      ],
      member('👤 Community', 0x9aa0a6),
    ),
    categories: [
      ...head({ name: '🔴-now-live', perm: 'announce', config: 'liveChannelId', topic: 'Live across all platforms.' }),
      { name: '💬 COMMUNITY', perm: 'public', channels: [
        { name: '💬-general' }, { name: '🎲-off-topic' }, { name: '😂-memes' }, { name: '🖼️-media' }, { name: '📢-self-promo' },
      ] },
      { name: '📡 PLATFORMS', perm: 'readOnly', channels: [
        { name: '🟣-twitch', perm: 'announce', topic: 'Twitch links & schedule.' },
        { name: '📹-youtube', perm: 'announce', topic: 'YouTube uploads.' },
        { name: '🟢-kick', perm: 'announce', topic: 'Kick streams.' },
        { name: '🌐-other-socials', perm: 'announce', topic: 'TikTok, X, Instagram, etc.' },
      ] },
      { name: '🎬 CONTENT', perm: 'public', channels: [
        { name: '🎬-vods-and-clips' }, { name: '💜-supporter-lounge', perm: 'subOnly' },
        { name: '💎-vip-lounge', perm: 'vipOnly' }, { name: '🎁-giveaways', perm: 'announce' },
      ] },
      BOT_CAT, STAFF_CAT, voice([{ name: '🔴 Stream Chat' }, { name: '🎮 Gaming' }, { name: '💜 Supporter Voice', perm: 'subVoice' }]), STATS_CAT,
    ],
    rules: [...BASE_RULES],
  },

  // 4 ── Kick streamer ─────────────────────────────────────────────────────────
  {
    id: 'kick', label: 'Kick Streamer', emoji: '🟩', accent: 0x53FC18,
    blurb: 'A server for a Kick streamer & their community',
    roles: roles(
      owner('👑 Broadcaster', 0x53FC18),
      [
        { name: '✏️ Mod Team', color: 0x53FC18, hoist: true, mentionable: true, mod: true },
        vip('💎 VIP', 0x00CED1), sub('💚 Subscriber', 0x53FC18),
        { name: '📢 Content Creator', color: 0xFF4500 },
      ],
      member('👤 Viewer', 0x9aa0a6),
    ),
    categories: [
      ...head({ name: '🟢-going-live', perm: 'announce', config: 'liveChannelId', topic: 'Kick go-live pings.' }),
      { name: '💬 COMMUNITY', perm: 'public', channels: [
        { name: '💬-general' }, { name: '🎲-off-topic' }, { name: '😂-memes' }, { name: '🖼️-media' }, { name: '📢-self-promo' },
      ] },
      { name: '🟩 STREAM', perm: 'public', channels: [
        { name: '📅-schedule', perm: 'announce' }, { name: '🎬-vods' }, { name: '✂️-clips' },
        { name: '💚-sub-lounge', perm: 'subOnly' }, { name: '💎-vip-lounge', perm: 'vipOnly' }, { name: '🎁-giveaways', perm: 'announce' },
      ] },
      BOT_CAT, STAFF_CAT, voice([{ name: '🟢 Stream Chat' }, { name: '🎮 Gaming' }, { name: '💚 Sub Voice', perm: 'subVoice' }]), STATS_CAT,
    ],
    rules: [...BASE_RULES],
  },

  // 5 ── VTuber ────────────────────────────────────────────────────────────────
  {
    id: 'vtuber', label: 'VTuber', emoji: '🌸', accent: 0xFF8FC8,
    blurb: 'A cozy server for a VTuber & their viewers',
    roles: roles(
      owner('🌸 Talent', 0xFF8FC8),
      [
        { name: '✏️ Stage Crew', color: 0xFF8FC8, hoist: true, mentionable: true, mod: true },
        sub('💗 Member', 0xFF69B4), vip('💎 Supporter', 0x00CED1),
        { name: '🎨 Fan Artist', color: 0xFFB7E5 },
      ],
      member('🌱 Viewer', 0x9aa0a6),
    ),
    categories: [
      ...head({ name: '🔴-im-live', perm: 'announce', config: 'liveChannelId', topic: 'Stream pings — grab 🔴 Live Notifs!' }),
      { name: '💬 COMMUNITY', perm: 'public', channels: [
        { name: '💬-general' }, { name: '🌙-off-topic' }, { name: '😻-memes' }, { name: '📸-selfies-and-pets' }, { name: '📢-self-promo' },
      ] },
      { name: '🌸 STREAM', perm: 'public', channels: [
        { name: '📅-schedule', perm: 'announce' }, { name: '🎨-fan-art', topic: 'Fan art of the talent — SFW only.' },
        { name: '🎬-clips-and-vods' }, { name: '🔞-spoiler-zone', topic: 'Game/story spoilers — tag everything.' },
        { name: '💗-members-only', perm: 'subOnly' }, { name: '🎁-giveaways', perm: 'announce' },
      ] },
      BOT_CAT, STAFF_CAT, voice([{ name: '🌸 Karaoke' }, { name: '🎮 Gaming' }, { name: '💗 Members Voice', perm: 'subVoice' }]), STATS_CAT,
    ],
    rules: [...BASE_RULES,
      { t: 'Respect the boundaries', d: 'No weird/creepy comments, no asking about the person behind the model. Respect the talent’s privacy.' },
      { t: 'SFW fan art only', d: 'Keep all fan art SFW unless a dedicated, age-gated channel exists.' }],
  },

  // 6 ── Musician / DJ / Producer ──────────────────────────────────────────────
  {
    id: 'music', label: 'Musician / DJ', emoji: '🎵', accent: 0x1DB954,
    blurb: 'A server for an artist, DJ, or producer',
    roles: roles(
      owner('🎤 Artist', 0x1DB954),
      [
        { name: '✏️ Manager', color: 0x1DB954, hoist: true, mentionable: true, mod: true },
        sub('💚 Supporter', 0x1ED760), vip('💎 Inner Circle', 0x00CED1),
        { name: '🎧 Producer', color: 0xFF4500 }, { name: '🎵 DJ', color: 0x8B5CF6 },
      ],
      member('🎶 Listener', 0x9aa0a6),
    ),
    categories: [
      ...head({ name: '🎶-new-releases', perm: 'announce', config: 'liveChannelId', topic: 'New drops, singles & albums.' }),
      { name: '💬 COMMUNITY', perm: 'public', channels: [
        { name: '💬-general' }, { name: '🎲-off-topic' }, { name: '😂-memes' }, { name: '🖼️-media' }, { name: '📢-self-promo' },
      ] },
      { name: '🎵 STUDIO', perm: 'public', channels: [
        { name: '🔥-snippets', perm: 'announce', topic: 'Unreleased previews.' },
        { name: '🎧-feedback', topic: 'Share WIPs & get feedback.' },
        { name: '🎹-collabs', topic: 'Find collaborators.' },
        { name: '💿-fan-covers', topic: 'Covers & remixes of the music.' },
        { name: '🎟️-shows-and-tickets', perm: 'announce', topic: 'Tour dates & tickets.' },
        { name: '💚-supporters', perm: 'subOnly' },
      ] },
      BOT_CAT, STAFF_CAT, voice([{ name: '🎧 Listening Party' }, { name: '🎹 Studio' }, { name: '💚 Supporters Voice', perm: 'subVoice' }]), STATS_CAT,
    ],
    rules: [...BASE_RULES, { t: 'No leaks', d: 'Do not leak unreleased music shared in snippet channels. Instant ban + report.' }],
  },

  // 7 ── Gaming community / clan ────────────────────────────────────────────────
  {
    id: 'gaming', label: 'Gaming Community', emoji: '🎮', accent: 0x43B581,
    blurb: 'A gaming community, clan, or guild',
    roles: roles(
      owner('👑 Clan Leader', 0x43B581),
      [
        { name: '⚔️ Officer', color: 0x43B581, hoist: true, mentionable: true, mod: true },
        vip('💎 Veteran', 0x00CED1), sub('🏅 Sponsor', 0xFFD700),
        { name: '🎮 Squad Lead', color: 0xFF4500 },
      ],
      member('🎮 Member', 0x9aa0a6),
    ),
    categories: [
      ...head({ name: '📢-clan-news', perm: 'announce', config: 'liveChannelId', topic: 'Clan announcements & recruitment.' }),
      { name: '💬 COMMUNITY', perm: 'public', channels: [
        { name: '💬-general' }, { name: '🎲-off-topic' }, { name: '😂-memes' }, { name: '🖼️-media' }, { name: '📢-self-promo' },
      ] },
      { name: '🎮 GAMING', perm: 'public', channels: [
        { name: '🔍-looking-for-group', topic: 'Find people to play with — game + platform.' },
        { name: '🏆-tournaments', perm: 'announce', topic: 'Tournament brackets & results.' },
        { name: '🎬-clips', topic: 'Your best plays.' },
        { name: '📊-stats-and-ranks', topic: 'Brag about your ranks.' },
        { name: '🛒-trading', topic: 'In-game trades — trade at your own risk.' },
        { name: '💎-veteran-lounge', perm: 'vipOnly' },
      ] },
      BOT_CAT, STAFF_CAT,
      voice([{ name: '🎮 Squad 1' }, { name: '🎮 Squad 2' }, { name: '🎮 Squad 3' }, { name: '🏆 Ranked' }, { name: '💎 Veteran Voice', perm: 'vipVoice' }]),
      STATS_CAT,
    ],
    rules: [...BASE_RULES, { t: 'No cheating / RMT', d: 'No cheats, hacks, or real-money trading discussion. It gets the server reported.' }],
  },

  // 8 ── Artist / creative ─────────────────────────────────────────────────────
  {
    id: 'art', label: 'Artist / Creative', emoji: '🎨', accent: 0xFF69B4,
    blurb: 'A server for an artist & their commissioners',
    roles: roles(
      owner('🎨 Artist', 0xFF69B4),
      [
        { name: '✏️ Helper', color: 0xFF69B4, hoist: true, mentionable: true, mod: true },
        vip('💎 Patron', 0x00CED1), sub('💗 Supporter', 0xFFB7E5),
        { name: '🖌️ Fellow Artist', color: 0xFF4500 },
      ],
      member('🌱 Member', 0x9aa0a6),
    ),
    categories: [
      ...head({ name: '📢-shop-updates', perm: 'announce', config: 'liveChannelId', topic: 'Commission openings & shop news.' }),
      { name: '💬 COMMUNITY', perm: 'public', channels: [
        { name: '💬-general' }, { name: '🎲-off-topic' }, { name: '😂-memes' }, { name: '📸-photos-and-pets' }, { name: '📢-self-promo' },
      ] },
      { name: '🎨 STUDIO', perm: 'public', channels: [
        { name: '🖼️-gallery', perm: 'announce', topic: 'Finished pieces by the artist.' },
        { name: '✏️-work-in-progress', topic: 'WIP & sketches.' },
        { name: '💬-critique', topic: 'Ask for and give constructive critique.' },
        { name: '🛒-commissions', perm: 'announce', topic: 'Commission info & queue.' },
        { name: '📚-resources', topic: 'Brushes, tutorials, references.' },
        { name: '💗-patron-lounge', perm: 'subOnly' },
      ] },
      BOT_CAT, STAFF_CAT, voice([{ name: '🎨 Draw Together' }, { name: '🎧 Chill Studio' }, { name: '💗 Patron Voice', perm: 'subVoice' }]), STATS_CAT,
    ],
    rules: [...BASE_RULES,
      { t: 'Credit artists', d: 'Always credit the original artist. No reposting others’ art as your own.' },
      { t: 'No AI art passed as handmade', d: 'Label AI-generated work. Don’t pass it off as hand-drawn in critique/gallery.' }],
  },

  // 9 ── Podcast ───────────────────────────────────────────────────────────────
  {
    id: 'podcast', label: 'Podcast', emoji: '🎙️', accent: 0xF59E0B,
    blurb: 'A server for a podcast & its listeners',
    roles: roles(
      owner('🎙️ Host', 0xF59E0B),
      [
        { name: '🎧 Producer', color: 0xF59E0B, hoist: true, mentionable: true, mod: true },
        { name: '🗣️ Guest', color: 0xFFD700, hoist: true, mentionable: true },
        sub('💛 Patron', 0xFFC83D), vip('💎 Founding Listener', 0x00CED1),
      ],
      member('🎧 Listener', 0x9aa0a6),
    ),
    categories: [
      ...head({ name: '📻-new-episodes', perm: 'announce', config: 'liveChannelId', topic: 'New episode drops — grab 🔴 Live Notifs.' }),
      { name: '💬 COMMUNITY', perm: 'public', channels: [
        { name: '💬-general' }, { name: '🎲-off-topic' }, { name: '😂-memes' }, { name: '🖼️-media' }, { name: '📢-self-promo' },
      ] },
      { name: '🎙️ THE SHOW', perm: 'public', channels: [
        { name: '💬-episode-discussion', topic: 'Discuss each episode.' },
        { name: '❓-ask-the-show', topic: 'Submit questions for the hosts.' },
        { name: '🗳️-topic-suggestions', topic: 'Suggest future episode topics.' },
        { name: '🎬-clips', topic: 'Best moments & clips.' },
        { name: '💛-patrons-only', perm: 'subOnly', topic: 'Bonus content for patrons. 💛' },
      ] },
      BOT_CAT, STAFF_CAT,
      voice([{ name: '🎙️ Recording Booth', perm: 'staffVoice' }, { name: '🎧 Listen Party' }, { name: '💛 Patron Voice', perm: 'subVoice' }]),
      STATS_CAT,
    ],
    rules: [...BASE_RULES, { t: 'No episode spoilers untagged', d: 'Tag spoilers for recent episodes in discussion channels.' }],
  },

  // 10 ── Esports team ─────────────────────────────────────────────────────────
  {
    id: 'esports', label: 'Esports Team', emoji: '🏆', accent: 0xEF4444,
    blurb: 'A competitive team & fan community',
    roles: roles(
      owner('👑 Team Owner', 0xEF4444),
      [
        { name: '🎯 Coach', color: 0xEF4444, hoist: true, mentionable: true, mod: true },
        { name: '📋 Manager', color: 0xF59E0B, hoist: true, mentionable: true, mod: true, perms: ['ManageEvents', 'ManageMessages', 'ManageThreads'] },
        { name: '⭐ Pro Player', color: 0xFFD700, hoist: true, mentionable: true },
        sub('🔷 Academy', 0x3498DB), vip('💎 Sponsor', 0x00CED1),
      ],
      member('🎮 Fan', 0x9aa0a6),
    ),
    categories: [
      ...head({ name: '📅-match-schedule', perm: 'announce', config: 'liveChannelId', topic: 'Match days & watch pings.' }),
      { name: '💬 COMMUNITY', perm: 'public', channels: [
        { name: '💬-general' }, { name: '🎲-off-topic' }, { name: '😂-memes' }, { name: '🖼️-media' }, { name: '📢-self-promo' },
      ] },
      { name: '🏆 TEAM', perm: 'public', channels: [
        { name: '📊-results', perm: 'announce', topic: 'Match results & recaps.' },
        { name: '🎬-highlights', topic: 'Team highlights & plays.' },
        { name: '📣-roster-news', perm: 'announce', topic: 'Signings & roster moves.' },
        { name: '🛒-merch', perm: 'announce', topic: 'Official team merch.' },
        { name: '💎-sponsor-lounge', perm: 'vipOnly' },
      ] },
      { name: '🧠 COMPETITIVE', perm: 'staffOnly', channels: [
        { name: '🧠-strats', topic: 'Strategy & VOD review. (Team only)' },
        { name: '📋-scrims', topic: 'Scrim scheduling. (Team only)' },
      ] },
      BOT_CAT, STAFF_CAT,
      voice([{ name: '🎮 Team Voice', perm: 'staffVoice' }, { name: '🔷 Academy Voice', perm: 'subVoice' }, { name: '📺 Watch Party' }]),
      STATS_CAT,
    ],
    rules: [...BASE_RULES, { t: 'Represent the team', d: 'You represent the org here. No toxicity toward opponents or other fan bases.' }],
  },

  // 11 ── Cozy community / friends ──────────────────────────────────────────────
  {
    id: 'community', label: 'Cozy Community', emoji: '☕', accent: 0xA78BFA,
    blurb: 'A small, chill community / friend server',
    roles: roles(
      owner('👑 Owner', 0xA78BFA),
      [vip('🌟 Regular', 0x00CED1), { name: '🎨 Creative', color: 0xFF69B4 }, { name: '🎮 Gamer Tag', color: 0x43B581 }],
      member('🌱 Member', 0x9aa0a6),
    ),
    categories: [
      ...head({ name: '📣-news', perm: 'announce', config: 'liveChannelId', topic: 'Server news.' }),
      { name: '☕ HANGOUT', perm: 'public', channels: [
        { name: '💬-general' }, { name: '🌙-late-night' }, { name: '😂-memes' },
        { name: '🐾-pets' }, { name: '🍜-food' }, { name: '🎮-gaming' }, { name: '🎵-music-chat' }, { name: '🖼️-media' },
      ] },
      { name: '💗 SUPPORT', perm: 'public', channels: [
        { name: '💭-vent', topic: 'A kind space to vent. Be supportive; no advice unless asked.' },
        { name: '🌟-regulars-lounge', perm: 'vipOnly' },
      ] },
      BOT_CAT, STAFF_CAT, voice([{ name: '☕ Lounge' }, { name: '🎮 Gaming' }, { name: '🌙 Late Night' }]), STATS_CAT,
    ],
    rules: [...BASE_RULES, { t: 'Be kind in #vent', d: 'No judgement in support channels. If someone is in crisis, point them to real help lines.' }],
  },
];

const byId = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
const getTemplate = (id) => byId[id] || null;
// Discord slash-command choices (max 25). Names carry the emoji.
const templateChoices = TEMPLATES.map((t) => ({ name: `${t.emoji} ${t.label}`, value: t.id }));

module.exports = { TEMPLATES, getTemplate, templateChoices };
