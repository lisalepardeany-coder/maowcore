# MaowCore Dashboard Rewrite — Roadmap

**Goal:** Replace the 11,000-line vanilla JS dashboard with a modern SvelteKit +
Tailwind app, a fresh visual identity, migrated **incrementally** page-by-page
so the old dashboard keeps working until each new page is ready.

**Stack decision:** SvelteKit (adapter-static SPA) · Tailwind CSS · TypeScript ·
existing REST + WebSocket API as the stable backend contract.

---

## Guiding principles

1. **The backend API is the contract.** `lib/control-server.js` stays as-is.
   The new frontend talks to the same `/api/*` REST endpoints and the same
   WebSocket. No backend rewrite required to start — we can clean it up later.
2. **Two dashboards run side by side.** Old at `/`, new at `/v2/` (or a flag).
   We flip the default only when the new one reaches parity.
3. **Every phase is shippable.** No "big bang." You can stop at any phase and
   still have a working product.
4. **Design system before pages.** Build tokens + components once, then every
   page is fast and consistent.

---

## Current-state inventory (what we're replacing)

| Area | Today | Lines |
|------|-------|------:|
| All pages + logic | `public/app.js` (vanilla, innerHTML) | 5,827 |
| Markup shell | `public/dashboard.html` | 1,861 |
| Styling | `public/style.css` | 3,288 |
| Service worker | `public/sw.js` | 71 |
| Backend (REST+WS+static) | `lib/control-server.js` | 3,071 |

**25 pages to migrate:** home, library, insights, server, settings, fleet,
moderation, members, channels, roles, reactions, welcome, social, economy,
custom-cmds, automation, game-night, templates, backup, cleanup, wrapped,
diagnostics, dev, posts, ranks, login.

---

## Phase 0 — Foundation (scaffold + plumbing)

**Outcome:** A SvelteKit app that boots, talks to the live bot API, and logs you in.

- [ ] `npm create svelte@latest dashboard` → new `/dashboard` folder
      (TypeScript, ESLint, Prettier, Vitest, Playwright).
- [ ] Add Tailwind + `@tailwindcss/forms` + `@tailwindcss/typography`.
- [ ] Configure `adapter-static` → builds to a plain folder of assets we can
      serve from the existing Node server (no separate runtime needed).
- [ ] **Dev proxy:** `vite.config.ts` proxies `/api` and `/ws` → `http://127.0.0.1:8765`
      so `vite dev` (port 5173) hot-reloads against the running bot.
- [ ] **API client** (`src/lib/api.ts`): typed `fetchJson()` wrapper that injects
      `X-Maow-Session` / Bearer token, handles 401 → redirect to login, retries
      once on transient failure (port the logic that already exists in `app.js`).
- [ ] **WebSocket store** (`src/lib/ws.ts`): a Svelte store that connects, holds
      live `state` (queues, now-playing, diagnostics), auto-reconnects.
- [ ] **Auth:** reuse existing Discord OAuth flow. Read `#maow_session=` from the
      URL hash on return, store token, expose `currentUser` + `rank` stores.
- [ ] Health check page that shows `/api/health` — proves the pipe works.

**Definition of done:** `vite dev`, sign in with Discord, see live now-playing
data streaming from your running bot.

---

## Phase 1 — Design system + app shell

**Outcome:** The new visual identity exists as reusable components. One real
page (Home) is built on it.

- [ ] **Design tokens** (`src/lib/styles/tokens.css` + Tailwind config):
      color scales, typography scale, spacing, radius, shadows, motion timings.
      Support light + dark + your existing theme variants as token swaps.
- [ ] **Component primitives** (`src/lib/components/`): Button, Card, Input,
      Select, Modal, Toast, Tabs, Table, Badge, Avatar, Tooltip, Skeleton,
      Switch, Dropdown, CommandPalette (Ctrl+K), NavRail, Topbar.
- [ ] **App shell** (`src/routes/+layout.svelte`): sidebar + topbar + content
      slot, responsive (collapsible rail → drawer on mobile), theme switcher,
      instance picker, now-playing chip, login button.
- [ ] **Home page** rebuilt: player controls, queue (drag-reorder, remove,
      save-as-playlist), now-playing art, server picker — all wired to the WS
      store. This is the reference implementation every later page copies.

**Definition of done:** New Home page at `/v2/` looks like the new identity and
fully replaces old Home functionally.

### New identity — direction options (pick one to lock the look)

> A "total redesign" needs a north star. Three concrete directions:

1. **"Studio"** — clean, professional, near-monochrome with one accent. Dense
   data tables, lots of whitespace, sharp corners, Inter/Geist type. Reads like
   a pro audio tool (think Linear / Vercel dashboards).
2. **"Nebula 2.0"** — keep the cosmic DNA but modernize: deep space gradients,
   glassmorphism cards, glowing accents, animated starfield, rounded. A
   polished version of today's vibe, not a departure.
3. **"Neko Arcade"** — playful, music-first, vibrant. Big album art, waveform
   visualizers, bold color, rounded everything, micro-animations, cat motifs.
   Leans into the MaowCore brand personality.

We can mock all three on the Home page in an afternoon and you pick.

---

## Phase 2 — Core pages (the daily-use 80%)

Migrate the pages you actually open every day. Each one: build in SvelteKit,
verify parity, route old nav item to the new page.

- [ ] **Library** — search/sort/paginate, install-from-URL, playlist install,
      background job chips, uploads tab, format picker.
- [ ] **Insights** — listening heatmap, stats tiles, top tracks/artists.
- [ ] **Moderation** — the 6 tabs (bans, kicks, warns, automod, modlog, audit).
- [ ] **Server / Members / Channels / Roles** — admin browsers + edit modals.
- [ ] **Settings** — config form, theme, advanced accordion.
- [ ] **Diagnostics** — health diagram, boot timeline, metrics grid, console.

**Definition of done:** A user can do their normal day entirely in `/v2/`.

---

## Phase 3 — Feature pages (the long tail)

- [ ] Social · Economy · Custom commands · Automation · Game night
- [ ] Templates · Backup & Share · Cleanup · Wrapped
- [ ] Posts · Ranks · Login page · Fleet (multi-bot) · Dev · Reactions · Welcome

These are lower-traffic; batch them. Each reuses Phase-1 components, so they go
fast (a page is mostly a data fetch + a table/form).

---

## Phase 4 — Cutover

- [ ] New dashboard reaches full parity → make `/v2/` the default at `/`.
- [ ] Old `public/app.js` / `dashboard.html` / `style.css` move to `public/legacy/`
      (kept one release for rollback), then deleted the release after.
- [ ] New service worker (SvelteKit PWA) replaces `sw.js`.
- [ ] Update README screenshots + docs.

---

## Phase 5 — Backend cleanup (optional, post-cutover)

Now that the frontend is decoupled, optionally modernize the server:

- [ ] Split `control-server.js` (3,071 lines) into route modules.
- [ ] Consider Fastify/Express for routing + middleware + validation.
- [ ] Generate an OpenAPI spec from the routes → typed client for the frontend.
- [ ] This is independent of the frontend and can be deferred indefinitely.

---

## Proposed folder structure

```
dashboard/
├─ src/
│  ├─ lib/
│  │  ├─ api.ts            # typed fetch wrapper + auth
│  │  ├─ ws.ts             # live state store
│  │  ├─ stores/           # user, instances, theme, queue
│  │  ├─ components/       # design-system primitives
│  │  └─ styles/tokens.css
│  ├─ routes/
│  │  ├─ +layout.svelte    # app shell
│  │  ├─ +page.svelte      # Home
│  │  ├─ library/+page.svelte
│  │  ├─ moderation/+page.svelte
│  │  └─ ...
│  └─ app.html
├─ static/
├─ tailwind.config.ts
├─ svelte.config.js        # adapter-static
└─ vite.config.ts          # /api + /ws proxy → :8765
```

The build output gets served by the existing Node server (one new static route),
so deployment stays "just run the bot" — no second process in production.

---

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Auth/session edge cases differ | Reuse the exact existing OAuth + token flow; don't reinvent. |
| WebSocket reconnect/parity bugs | Port the proven reconnect logic from `app.js` 1:1 first, refactor later. |
| Scope creep across 25 pages | Phases 2/3 are independent checklists — ship continuously. |
| Two dashboards drift | API contract is the single source of truth; both consume it. |
| Bundle size on a localhost tool | SvelteKit compiles away the framework — output is tiny vanilla JS. |

---

## Rough sequencing

1. **Phase 0–1** — foundation + design system + Home (the big lift; everything
   after is repetition).
2. **Phase 2** — core pages, ~1 page at a time.
3. **Phase 3** — feature pages, batched.
4. **Phase 4** — cutover.
5. **Phase 5** — backend cleanup, whenever.

The first real milestone is **a logged-in, live Home page in the new identity**.
Once that exists, every other page is a variation on a solved problem.

---

## Immediate next step

Say the word and I'll execute **Phase 0**: scaffold the SvelteKit app in
`/dashboard`, wire the dev proxy to your running bot, port the auth + WebSocket
client, and get a live health page rendering real data from `:8765`.
```
```
