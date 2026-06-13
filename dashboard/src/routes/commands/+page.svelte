<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';

  let search = $state('');

  const GROUPS: { title: string; icon: string; cmds: [string, string][] }[] = [
    { title: 'Music', icon: '🎵', cmds: [
      ['play', 'Play a song or playlist from a search or URL'],
      ['skip', 'Skip the current song'], ['stop', 'Stop and clear the queue'],
      ['pause', 'Pause playback'], ['resume', 'Resume playback'],
      ['queue', 'Show the current queue'], ['nowplaying', 'Show what\'s playing'],
      ['volume', 'Set the playback volume (0–150)'], ['seek', 'Jump to a position in the song'],
      ['loop', 'Toggle loop (off / track / queue)'], ['shuffle', 'Shuffle the queue'],
      ['previous', 'Play the previous song'], ['remove', 'Remove a song from the queue'],
      ['lyrics', 'Show lyrics for the current song'], ['dedicate', 'Dedicate a song to someone'],
      ['leave', 'Disconnect from voice'], ['247', 'Toggle 24/7 stay-in-voice mode'],
      ['autoplay', 'Toggle autoplay of related songs'],
    ] },
    { title: 'Audio FX', icon: '🎛️', cmds: [
      ['filter', 'Apply an audio filter'], ['eq', 'Equalizer presets'], ['pitch', 'Change pitch'],
      ['speed', 'Change playback speed'], ['normalize', 'Normalize loudness'],
      ['crossfade', 'Crossfade between tracks'], ['karaoke', 'Karaoke (vocal reduction)'],
      ['sponsorblock', 'Skip non-music YouTube segments'], ['loopab', 'Loop a section A→B'],
    ] },
    { title: 'Library & Playlists', icon: '📚', cmds: [
      ['library', 'Browse, play, install, or remove library songs'],
      ['save', 'Save the current queue as a playlist'], ['load', 'Load a saved playlist'],
      ['myplaylists', 'List your playlists'], ['deleteplaylist', 'Delete a playlist'],
      ['share', 'Export a playlist to share'], ['importpl', 'Import a shared playlist'],
      ['favorite', 'Favorite the current song'], ['radio', 'Play a radio stream'],
      ['radiosearch', 'Search internet radio stations'], ['podcast', 'Play a podcast'],
      ['sb', 'Soundboard — play a sound clip'],
    ] },
    { title: 'Moderation', icon: '⚖️', cmds: [
      ['ban', 'Ban a member'], ['unban', 'Unban a user'], ['softban', 'Ban + unban to purge messages'],
      ['kick', 'Kick a member'], ['timeout', 'Time a member out'], ['warn', 'Warn a member'],
      ['purge', 'Bulk-delete messages'], ['slowmode', 'Set channel slowmode'],
      ['lock', 'Lock a channel'], ['unlock', 'Unlock a channel'], ['automod', 'Configure automod'],
      ['modlog', 'Configure the mod-log channel'],
    ] },
    { title: 'Server Setup', icon: '🛠️', cmds: [
      ['setup', 'Auto-build the full server (channels, roles, permissions)'],
      ['nukechannels', 'Delete all text channels (keeps voice)'],
      ['welcome', 'Configure welcome/farewell messages'], ['welcomesound', 'Set a join sound'],
      ['reactionrole', 'Create a reaction-role message'], ['role', 'Manage roles'],
      ['nick', 'Change a nickname'], ['announce', 'Post an announcement'], ['say', 'Make the bot say something'],
      ['event', 'Create a scheduled event'], ['statschannels', 'Set up live stat channels'],
    ] },
    { title: 'Fun & Social', icon: '🎉', cmds: [
      ['quiz', 'Start a music quiz'], ['rate', 'Rate the current song'],
      ['poll', 'Create a poll'], ['suggest', 'Submit a suggestion'],
      ['meme', 'Fetch a meme'], ['tours', 'Find upcoming concerts for an artist'],
      ['remind', 'Set a reminder'], ['personality', 'Set the bot\'s reply personality'],
      ['tag', 'Create/use a custom tag'], ['alias', 'Create a command alias'],
      ['pomodoro', 'Start a pomodoro timer'], ['anonymous', 'Toggle anonymous requesters'],
    ] },
    { title: 'Utility', icon: '🔧', cmds: [
      ['help', 'Show the help menu'], ['invite', 'Get the bot invite link'],
      ['follow', 'Have the bot follow you between voice channels'],
      ['backup', 'Create a config backup'], ['restore', 'Restore from a backup'],
      ['import', 'Import data'], ['language', 'Set the bot language'],
      ['quickset', 'Quick config shortcuts'], ['sleep', 'Set a sleep timer'],
      ['timemachine', 'Replay queue history'], ['undo', 'Undo the last action'],
      ['serverinfo', 'Server information'], ['userinfo', 'User information'], ['avatar', 'Show an avatar'],
    ] },
  ];

  let filtered = $derived(
    search
      ? GROUPS.map((g) => ({ ...g, cmds: g.cmds.filter(([n, d]) => (n + d).toLowerCase().includes(search.toLowerCase())) })).filter((g) => g.cmds.length)
      : GROUPS,
  );
  let total = $derived(GROUPS.reduce((a, g) => a + g.cmds.length, 0));
</script>

<svelte:head><title>Commands · MaowCore</title></svelte:head>

<PageHeader title="Command Reference" subtitle={`${total} slash commands`}>
  {#snippet actions()}<input class="input max-w-[220px]" placeholder="Search commands…" bind:value={search} />{/snippet}
</PageHeader>

<div class="grid gap-6 lg:grid-cols-2">
  {#each filtered as g}
    <Card>
      <div class="mb-3 font-display text-lg font-bold">{g.icon} {g.title}</div>
      <div class="space-y-1">
        {#each g.cmds as [name, desc]}
          <div class="flex items-baseline gap-3 rounded-btn px-2 py-1.5 hover:bg-surface-2">
            <code class="shrink-0 font-mono text-sm font-semibold text-accent">/{name}</code>
            <span class="text-sm text-muted">{desc}</span>
          </div>
        {/each}
      </div>
    </Card>
  {/each}
</div>
