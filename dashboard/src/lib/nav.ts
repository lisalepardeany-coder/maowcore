// Sidebar navigation, grouped. `done: true` = migrated to the new dashboard.
// Pages not yet migrated link back to the legacy dashboard at /.

export interface NavItem {
  label: string;
  icon: string;
  href: string;
  done?: boolean;
  minRank?: 'moderator' | 'admin' | 'owner';
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: '',
    items: [
      { label: 'Home', icon: '🏠', href: '/', done: true },
      { label: 'Player', icon: '▶️', href: '/player', done: true },
      { label: 'Lyrics', icon: '🎤', href: '/lyrics', done: true },
      { label: 'Library', icon: '🎵', href: '/library', done: true },
      { label: 'Playlists', icon: '📋', href: '/playlists', done: true },
      { label: 'Soundboard', icon: '🔉', href: '/soundboard', done: true },
      { label: 'Radio', icon: '📻', href: '/radio', done: true },
      { label: 'Insights', icon: '📊', href: '/insights', done: true },
      { label: 'Analytics', icon: '📈', href: '/analytics', done: true },
      { label: 'Fleet', icon: '🛰️', href: '/fleet', done: true },
    ],
  },
  {
    title: 'Community',
    items: [
      { label: 'Social', icon: '💜', href: '/social', done: true },
      { label: 'Economy', icon: '🪙', href: '/economy', done: true },
      { label: 'Game Night', icon: '🎮', href: '/game-night', done: true },
      { label: 'Wrapped', icon: '🎁', href: '/wrapped', done: true },
      { label: 'Achievements', icon: '🏅', href: '/achievements', done: true },
      { label: 'Profile Cards', icon: '🪪', href: '/profiles', done: true },
      { label: 'Reminders', icon: '⏰', href: '/reminders', done: true },
      { label: 'Suggestions', icon: '💡', href: '/suggestions', done: true },
      { label: 'Polls', icon: '🗳️', href: '/polls', done: true },
      { label: 'Giveaways', icon: '🎉', href: '/giveaways', done: true },
      { label: 'Voice Activity', icon: '🔊', href: '/voice', done: true },
      { label: 'Posts', icon: '📰', href: '/posts', done: true },
    ],
  },
  {
    title: 'Create',
    items: [
      { label: 'Embed Builder', icon: '🖼️', href: '/embed-builder', done: true, minRank: 'admin' },
      { label: 'Announce', icon: '📣', href: '/announce', done: true, minRank: 'admin' },
    ],
  },
  {
    title: 'Server',
    items: [
      { label: 'Members', icon: '👥', href: '/members', done: true, minRank: 'moderator' },
      { label: 'Channels', icon: '#️⃣', href: '/channels', done: true, minRank: 'admin' },
      { label: 'Roles', icon: '🎭', href: '/roles', done: true, minRank: 'admin' },
      { label: 'Moderation', icon: '⚖️', href: '/moderation', done: true, minRank: 'moderator' },
      { label: 'Infractions', icon: '🚫', href: '/infractions', done: true, minRank: 'moderator' },
      { label: 'Tickets', icon: '🎫', href: '/tickets', done: true, minRank: 'moderator' },
      { label: 'Appeals', icon: '📬', href: '/appeals', done: true, minRank: 'moderator' },
      { label: 'Message Logs', icon: '📜', href: '/message-logs', done: true, minRank: 'moderator' },
      { label: 'Welcome', icon: '✨', href: '/welcome', done: true, minRank: 'admin' },
      { label: 'Reaction Roles', icon: '❉', href: '/reactions', done: true, minRank: 'admin' },
      { label: 'Ranks', icon: '⭐', href: '/ranks', done: true, minRank: 'admin' },
    ],
  },
  {
    title: 'Power',
    items: [
      { label: 'Automation', icon: '⏰', href: '/automation', done: true },
      { label: 'Custom Commands', icon: '⚒️', href: '/custom-cmds', done: true },
      { label: 'Templates', icon: '🧩', href: '/templates', done: true },
      { label: 'Backup & Share', icon: '💾', href: '/backup', done: true },
      { label: 'Cleanup', icon: '🧹', href: '/cleanup', done: true },
    ],
  },
  {
    title: 'Help',
    items: [
      { label: 'Commands', icon: '📖', href: '/commands', done: true },
      { label: 'Theme Gallery', icon: '🖼️', href: '/theme-gallery', done: true },
      { label: 'Boot Lab', icon: '🎬', href: '/boot-gallery', done: true },
      { label: 'Status', icon: '🟢', href: '/status', done: true },
      { label: 'Getting Started', icon: '🚀', href: '/onboarding', done: true },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Diagnostics', icon: '🩺', href: '/diagnostics', done: true },
      { label: 'Developer', icon: '⌨️', href: '/dev', done: true, minRank: 'admin' },
      { label: 'Settings', icon: '⚙️', href: '/settings', done: true },
    ],
  },
];
