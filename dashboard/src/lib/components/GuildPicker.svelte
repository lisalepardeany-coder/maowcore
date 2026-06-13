<script lang="ts">
  import { liveState } from '$lib/ws';
  import { selectedGuildId, setGuild, guildId } from '$lib/stores/guild';

  let guilds = $derived($liveState.guilds ?? []);
</script>

{#if guilds.length > 0}
  <select
    class="input max-w-[220px]"
    value={$guildId}
    onchange={(e) => setGuild(e.currentTarget.value)}
  >
    {#each guilds as g (g.id)}
      <option value={g.id}>{g.name}</option>
    {/each}
  </select>
{:else}
  <span class="pill bg-surface-2 text-muted">No servers</span>
{/if}
