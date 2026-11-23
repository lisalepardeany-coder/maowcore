<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { me, rankAtLeast } from '$lib/stores/user';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtRelative } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let posts = $state<any[]>([]);
  let showEditor = $state(false);
  let draft = $state({ title: '', body: '', category: 'update', pinned: false });

  let canPost = $derived(rankAtLeast($me.rank, 'admin'));

  const CATEGORY_COLORS: Record<string, string> = {
    update: 'text-accent-2', announcement: 'text-warn', changelog: 'text-accent-3', news: 'text-success',
  };

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await api.get<any>('/api/posts/list?limit=50');
      posts = res.posts ?? [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function publish() {
    if (!draft.title.trim()) return;
    try {
      await api.post('/api/posts/create', draft);
      draft = { title: '', body: '', category: 'update', pinned: false };
      showEditor = false;
      await load();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function remove(id: number) {
    if (!confirm('Delete this post?')) return;
    try {
      await api.post('/api/posts/delete', { id });
      await load();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  onMount(load);
</script>

<svelte:head><title>Posts · MaowCore</title></svelte:head>

<PageHeader title="Posts" subtitle="Updates, announcements, and changelog entries">
  {#snippet actions()}
    {#if canPost}
      <button class="btn-primary" onclick={() => (showEditor = !showEditor)}>
        {showEditor ? '✕ Cancel' : '+ New post'}
      </button>
    {/if}
  {/snippet}
</PageHeader>

{#if showEditor}
  <Card class="mb-4 animate-fade-up">
    <div class="space-y-3">
      <input class="input" placeholder="Post title" bind:value={draft.title} />
      <textarea class="input min-h-28" placeholder="Body (markdown supported)…" bind:value={draft.body}></textarea>
      <div class="flex items-center gap-3">
        <select class="input max-w-[180px]" bind:value={draft.category}>
          <option value="update">Update</option>
          <option value="announcement">Announcement</option>
          <option value="changelog">Changelog</option>
          <option value="news">News</option>
        </select>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={draft.pinned} /> Pin to top
        </label>
        <button class="btn-primary ml-auto" onclick={publish}>Publish</button>
      </div>
    </div>
  </Card>
{/if}

<States {loading} {error} empty={!loading && posts.length === 0} emptyText="No posts yet." emptyIcon="📰">
  <div class="space-y-3">
    {#each posts as post (post.id)}
      <Card class="animate-fade-up">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              {#if post.pinned}<span class="text-accent">📌</span>{/if}
              <h3 class="truncate font-display text-lg font-bold">{post.title}</h3>
            </div>
            <div class="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span class="pill bg-surface-2 capitalize {CATEGORY_COLORS[post.category] ?? ''}">{post.category}</span>
              <span>{fmtRelative(post.createdAt ?? post.created_at)}</span>
            </div>
          </div>
          {#if canPost}
            <button class="text-muted hover:text-danger" title="Delete" onclick={() => remove(post.id)}>🗑️</button>
          {/if}
        </div>
        {#if post.body}
          <p class="mt-3 whitespace-pre-wrap text-sm text-muted">{post.body}</p>
        {/if}
      </Card>
    {/each}
  </div>
</States>
