<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import { me, rankAtLeast } from '$lib/stores/user';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtNumber } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let leaderboard = $state<any[]>([]);
  let shop = $state<any[]>([]);
  let mine = $state<any>(null);
  let busy = $state(false);
  let addForm = $state({ name: '', cost: 100, description: '' });

  let isAdmin = $derived(rankAtLeast($me.rank, 'admin'));
  const MEDAL = ['🥇', '🥈', '🥉'];

  function xpPct(u: any): number {
    if (!u?.nextLevelXp) return 0;
    return Math.min(100, Math.round((u.xp / u.nextLevelXp) * 100));
  }

  async function load(gid: string) {
    if (!gid) return;
    loading = true;
    error = '';
    try {
      const [lb, sh, m] = await Promise.all([
        api.get<any>(`/api/economy/leaderboard?guildId=${gid}`),
        api.get<any>(`/api/economy/shop?guildId=${gid}`),
        $me.loggedIn ? api.get<any>(`/api/economy/me?guildId=${gid}`).catch(() => null) : Promise.resolve(null),
      ]);
      leaderboard = lb.leaderboard ?? [];
      shop = sh.shop ?? [];
      mine = m?.user ?? null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function seedShop() {
    busy = true;
    try { await api.post('/api/economy/shop/seed', { guildId: $guildId }); await load($guildId); }
    catch (e) { alert((e as Error).message); }
    finally { busy = false; }
  }

  async function addItem() {
    if (!addForm.name.trim()) return;
    try {
      await api.post('/api/economy/shop/add', { guildId: $guildId, ...addForm });
      addForm = { name: '', cost: 100, description: '' };
      await load($guildId);
    } catch (e) { alert((e as Error).message); }
  }

  async function removeItem(id: string) {
    try { await api.post('/api/economy/shop/remove', { guildId: $guildId, id }); await load($guildId); }
    catch (e) { alert((e as Error).message); }
  }

  $effect(() => {
    load($guildId);
  });
</script>

<svelte:head><title>Economy · MaowCore</title></svelte:head>

<PageHeader title="Economy & Levels" subtitle="Coins, XP, levels, and the server shop">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<States {loading} {error}>
  <!-- Your stats -->
  {#if mine}
    <Card class="mb-6">
      <div class="flex flex-wrap items-center gap-4">
        <div class="grid h-16 w-16 shrink-0 place-items-center rounded-card text-2xl font-black text-on-accent"
             style="background-image: linear-gradient(135deg, var(--accent), var(--accent-3)); box-shadow: var(--shadow-glow)">
          {mine.level}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-display text-lg font-bold">{mine.tag ?? 'You'}</span>
            <span class="pill bg-surface-2 text-warn">{fmtNumber(mine.coins)} 🪙</span>
          </div>
          <div class="mt-2 h-2 overflow-hidden rounded-pill bg-surface-2">
            <div class="h-full rounded-pill transition-all" style="width:{xpPct(mine)}%; background-image: linear-gradient(90deg, var(--accent), var(--accent-3))"></div>
          </div>
          <div class="mt-1 text-[11px] text-muted">
            Level {mine.level} · {fmtNumber(mine.xp)} / {fmtNumber(mine.nextLevelXp)} XP to level {mine.level + 1}
          </div>
        </div>
      </div>
    </Card>
  {/if}

  <div class="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
    <!-- Leaderboard -->
    <Card>
      <div class="mb-3 font-display text-lg font-bold">🏆 Leaderboard</div>
      {#if leaderboard.length === 0}
        <p class="text-sm text-muted">No economy data yet — chat and play music to earn XP.</p>
      {:else}
        <ol class="space-y-1">
          {#each leaderboard as row, i (row.userId)}
            <li class="flex items-center gap-3 rounded-btn px-2 py-2 hover:bg-surface-2" class:bg-surface-2={row.userId === $me.userId}>
              <span class="w-7 text-center font-display font-bold {i < 3 ? 'text-base' : 'text-muted text-sm'}">{MEDAL[i] ?? i + 1}</span>
              {#if row.avatar}
                <img src={row.avatar} alt="" class="h-8 w-8 shrink-0 rounded-full object-cover" />
              {:else}
                <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs">?</span>
              {/if}
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">{row.tag ?? row.userId}</div>
                <div class="mt-0.5 h-1 overflow-hidden rounded-pill bg-surface-2">
                  <div class="h-full rounded-pill" style="width:{xpPct(row)}%; background:var(--accent)"></div>
                </div>
              </div>
              <span class="pill bg-surface-2 text-accent-2">Lvl {row.level}</span>
              <span class="pill bg-surface-2 text-warn">{fmtNumber(row.coins)} 🪙</span>
            </li>
          {/each}
        </ol>
      {/if}
    </Card>

    <!-- Shop -->
    <Card>
      <div class="mb-3 flex items-center justify-between">
        <span class="font-display text-lg font-bold">🛍️ Shop</span>
        {#if shop.length > 0}<span class="pill bg-surface-2 text-muted">{shop.length} items</span>{/if}
      </div>

      {#if shop.length === 0}
        <div class="py-6 text-center">
          <div class="mb-2 text-3xl opacity-40">🛒</div>
          <p class="mb-3 text-sm text-muted">The shop is empty.</p>
          {#if isAdmin}
            <button class="btn-primary" onclick={seedShop} disabled={busy}>
              {busy ? 'Adding…' : '✨ Add 15 starter items'}
            </button>
          {/if}
        </div>
      {:else}
        <div class="space-y-2">
          {#each shop as item (item.id)}
            <div class="group flex items-center gap-3 rounded-btn bg-surface-2 px-3 py-2">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">{item.name}</div>
                {#if item.description}<div class="truncate text-[11px] text-muted">{item.description}</div>{/if}
              </div>
              <span class="pill shrink-0 bg-bg-soft text-warn">{fmtNumber(item.cost ?? item.price)} 🪙</span>
              {#if isAdmin}
                <button class="shrink-0 text-muted opacity-0 transition hover:text-danger group-hover:opacity-100" onclick={() => removeItem(item.id)}>✕</button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if isAdmin && shop.length > 0}
        <div class="mt-4 border-t border-border pt-3">
          <div class="mb-2 text-xs font-semibold text-muted">Add an item</div>
          <div class="grid gap-2">
            <input class="input" placeholder="Item name" bind:value={addForm.name} />
            <div class="flex gap-2">
              <input class="input w-28" type="number" min="1" placeholder="Cost" bind:value={addForm.cost} />
              <input class="input flex-1" placeholder="Description" bind:value={addForm.description} />
            </div>
            <button class="btn-ghost" onclick={addItem}>+ Add item</button>
          </div>
        </div>
      {/if}
    </Card>
  </div>
</States>
