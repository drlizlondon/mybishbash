# myBishBash — Architecture Blueprint

**Status:** Draft for review · **Author:** Architecture review, July 2026
**Scope:** Target architecture and phased engineering roadmap for the next 5 years.
**Audience:** Human maintainers and AI agents (Claude Sonnet / Codex) executing phases.

---

## 1. Executive summary

myBishBash today is a successful v1: a single-page React app whose product ideas
(interception launchers, cards, packs, access tiers) are genuinely novel and whose
release discipline (guardrail tests, e2e flows, migration history) is well above
average for a product at this stage.

Its architecture, however, is a **monolith with a hand-rolled sync engine embedded
in one component**:

| Artefact | Size | Problem |
|---|---|---|
| `src/App.jsx` | 13,735 lines | ~90 components + router + sync engine + all state in one file; `App()` itself is ~5,800 lines with **132 `useState`**, 87 `useEffect` |
| `src/styles.css` | 12,889 lines | One global stylesheet; Tailwind is installed but unused for components |
| `src/HQPanel.jsx` | 3,290 lines | Second monolith forming |
| Cloud state | 1 JSONB blob | Whole profile serialized per save; last-write-wins; will not survive years of data, second devices, or collaboration |
| Local state | `localStorage` | Synchronous, ~5MB cap; will not survive years of events/journals/media |
| Types/lint/unit tests | none | No TypeScript, no ESLint, no unit test runner; safety comes entirely from e2e + guardrail scripts |

None of this is a criticism of how the product got here — it is exactly how a good
v1 gets built. But every future ambition (notes, journals, projects, AI, collaboration,
offline-first, plugins) presses directly on these six weaknesses.

**The core strategic decision of this blueprint:** myBishBash should become a
**local-first application with a normalized entity model**, organized as
**feature modules around a small composition root**, with **one write path**
(action → store → persistence → sync queue) instead of today's 132 independent
state hooks. Everything else follows from that.

The roadmap (§19) delivers this in 10 phases, each independently shippable, starting
with a safety net (unit tests + lint) and ending with the collaboration/plugin-ready
platform. No big-bang rewrite; `App.jsx` shrinks phase by phase until it is a
~200-line composition root.

---

## 2. Overall architectural assessment

**Grade: strong product core, fragile shell.**

The domain logic is better than it looks: `src/lib/` already contains real,
pure, testable domain modules (`launcherRegistry`, `accessCapabilities`,
`cardSelection`, `launcherState`, `launcherAvailability`), and `utils.js` is mostly
pure functions over cards/windows/commitments. The event log is append-only with an
offline queue — an accidental but genuine event-sourcing foundation.

What is missing is **structure between the domain logic and React**. Everything
meets in `App()`: routing, auth, sync orchestration, overlay state machines,
composer state, notification permissions, pause clocks, admin gating. Each new
feature must be threaded through this single function, which is why it grew to
5,800 lines. The recent `React.memo` work treats symptoms of this shape.

The second structural risk is the **data model**. `mybishbash_state.state_json`
(one JSONB blob per user) means: every save re-uploads everything; conflict
resolution is whole-blob LWW with manual `mergeEntitiesById`; the blob grows
monotonically with events; and no future feature (partial sync, sharing a pack,
realtime, AI reading one entity) can be built without first breaking up the blob.

---

## 3. Current strengths (preserve these)

1. **Release engineering.** Guardrail tests, `test:release` pipeline, staged
   Cloudflare builds, GitHub Actions on staging. Rare and valuable.
2. **Pure domain modules in `src/lib/`.** The launcher registry with its
   static-ID invariant, access capability resolution, and card selection logic
   are already cleanly separated. The target architecture *extends* this pattern.
3. **Append-only event log with offline queue** (`eventLog.js`). This is the seed
   of the analytics pipeline and the undo/history system.
4. **Migration discipline.** 35 SQL migrations, including one that repaired the
   early anon RLS policies to `auth.uid()`. The habit exists; the target schema
   can be reached incrementally.
5. **E2E coverage of the flows that matter** (launcher interception, access,
   pack import) — this is the safety net that makes the refactor in this
   blueprint possible at all.
6. **Deliberate product decisions are documented** (`docs/explore-architecture.md`,
   launcher-card-flow, access-entitlements). Write-things-down culture exists.
7. **Lazy loading already applied** to HQ, landing, marketing pages.

## 4. Current weaknesses

1. **`App()` is the system.** Router, auth session, sync engine, 25+ overlay
   types, composer, notifications, pause logic, admin/tester gating — one closure.
   Every bug fix risks every feature; AI agents and humans alike cannot reason
   about a 5,800-line function safely.
2. **132 independent `useState` = no single write path.** Cards, events, packs,
   settings each have bespoke save effects with bespoke debounce timers
   (`cloudSaveTimerRef`, `cardSaveTimerRef`, `localDirtyRef`,
   `highestKnownCloudTimeRef`). Sync correctness depends on ref choreography that
   only the original author (and barely) can verify.
3. **Blob sync.** Whole-state JSONB with debounced LWW upload. Failure modes:
   lost writes across two devices, unbounded payload growth, no per-entity
   history, impossible to share or collaborate on a subset.
4. **`localStorage` as the database.** Synchronous reads on boot (fine today),
   5MB ceiling (fatal for "years of journals, rich media"), string-encoded JSON
   everywhere, 20+ versioned keys with legacy-prefix migration shims.
5. **No types, no lint, no unit tests.** The `.mjs` script tests are good
   integration probes but there is no fast feedback loop; `utils.js`'s pure
   functions are untested at the unit level. For a codebase intended to be
   maintained partly by AI agents, TypeScript is the single highest-leverage
   investment: it turns implicit contracts into machine-checkable ones.
6. **13k-line global stylesheet** while Tailwind 4 ships in the bundle. Two
   styling systems, one of them unused; dead CSS is unfindable.
7. **Hidden singletons.** `utils.js` holds `_activeWindowDefs` as module state,
   initialized by a guarded ref inside `App()`. Works, but is invisible coupling.
8. **Routing is interwoven with launch semantics.** `parseRoute` /
   `getRouteFromLocation` / `history.replaceState` calls are scattered through
   `App()`, entangled with intercept overlays and Capacitor base-path rebasing.
9. **HQPanel repeating the pattern.** 3,290 lines and growing; the admin surface
   is becoming a second monolith.
10. **Error handling is console-based.** An `AppShellErrorBoundary` exists in
    `App.jsx` (recovery UI around the app shell), but it reports only to
    `console.error`, and nothing catches errors above it (`main.jsx` render,
    module init) or outside React (`window.onerror`, unhandled rejections).
    Production failures are invisible unless a user reports them.

---

## 5. Recommended target architecture

**One sentence:** a local-first PWA where *feature modules* own their UI, *domain
stores* own state and expose actions, a *persistence layer* (IndexedDB) owns local
data, and a *sync engine* replicates normalized entities to Supabase through a
mutation queue — composed by a ~200-line app shell.

```
┌────────────────────────────────────────────────────────────┐
│  app/  (composition root: providers, router, shell)        │
├────────────────────────────────────────────────────────────┤
│  features/   home  library  composer  launcher  apps       │
│              settings  access  onboarding  explore  hq     │
│              (UI + feature hooks; imports stores + domain) │
├────────────────────────────────────────────────────────────┤
│  stores/     cards  packs  events  settings  session       │
│              (state + actions + selectors; one write path) │
├────────────────────────────────────────────────────────────┤
│  domain/     card  pack  launcher  access  scheduling      │
│              (pure functions & types; no React, no IO)     │
├────────────────────────────────────────────────────────────┤
│  services/   db (IndexedDB)  sync (queue + Supabase)       │
│              auth  notifications  analytics  errors        │
└────────────────────────────────────────────────────────────┘
```

**Dependency rule (enforced by lint):** arrows point down only.
`domain/` imports nothing. `stores/` import `domain/` + `services/`.
`features/` import `stores/` + `domain/`. `app/` imports everything.
Features never import other features' internals — only their public `index.ts`.

Key technology decisions (see §17 for trade-offs):

| Concern | Decision | Why |
|---|---|---|
| Language | **TypeScript, gradual** (`allowJs`, boundaries first) | Machine-checkable contracts; the best force-multiplier for AI-executed phases |
| App state | **Zustand stores, one per domain** (~1KB dep) | Removes 132 `useState`; selectors kill re-render cascades; boring, stable, swappable behind our own store interface |
| Server state | **Custom sync engine** (mutation queue + per-entity LWW) | Our problem is replication of user-owned entities, not request caching — TanStack Query is the wrong shape; a queue is ~300 lines we fully control |
| Local persistence | **IndexedDB** via a thin `db` service (no ORM) | Async, effectively unbounded, structured; localStorage remains for tiny flags only |
| Routing | **Extract the existing router into `app/router/`**; no library yet | ~12 routes with Capacitor base-path + intercept semantics no library models well; revisit at >20 routes |
| Styling | **Tailwind for components + tokens.css for design system**; retire styles.css gradually | One system; dead CSS becomes deletable; Tailwind is already installed |
| Unit tests | **Vitest** | Native to Vite; makes `domain/` and the sync engine testable in ms |
| Backend | **Supabase stays** (Postgres + RLS + Auth + Realtime + Storage) | Nothing about scale to millions requires leaving it; it requires using it properly (normalized tables, realtime channels) |

What we are **not** adopting: Redux, react-router (yet), Next.js/SSR (the app is
behind auth; SSR buys nothing), GraphQL, micro-frontends, CRDT libraries (yet —
see §18), any state-machine framework (XState) — overlay flows become plain
discriminated unions + reducers first.

---

## 6. Domain model

The brief's candidate list (Tasks, Projects, Habits, …) is a generic productivity
taxonomy. myBishBash's actual domains are more distinctive, and the model should
name what the product *is*:

### Core domains (exist today)

1. **Cards** — the atomic unit of intention. Subtypes: personal, pack-sourced,
   action, commitment (with check-in/encouragement/review lifecycle). A card has
   eligibility (timing windows, frequency), state (done-today, disliked/hidden),
   and provenance (`sourcePackId`).
2. **Packs** — curated collections of cards. Global (HQ-published), custom
   (user-authored), library membership, Explore distribution. Install-is-global.
3. **Launchers / Interception** — *the differentiator.* Protected apps, the
   registry with static IDs + HQ overrides, interception overlays, launch
   sessions, pause clocks, destination resolution. This is a domain, not UI.
4. **Access** — tiers, codes, entitlements, gates, tester status, admin roles.
   Already well-modelled in `accessCapabilities.js`; formalize as `domain/access`.
5. **Events** — append-only log of everything meaningful: launches, completions,
   interruptions, shifts. Feeds Home stats, morning summary, HQ analytics, and
   (future) AI. Treat as the system's memory.
6. **Profile & Settings** — identity, mood, home-screen versions, timing-window
   prefs, notification prefs, interruption mode.
7. **Sync & Storage** — a real domain with its own invariants (queue ordering,
   conflict policy, schema versions), not an implementation detail.
8. **HQ (Admin)** — pack publishing, launcher config, access administration,
   analytics. Should trend toward a separate lazy-loaded feature with its own
   stores, eventually its own entry point.

### Future domains (design for, don't build)

9. **Documents** — notes, journals, project pages. Model as a new *entity type*
   on the same spine (id, type, owner, updated_at, body-out-of-band), not a new
   architecture. Rich bodies live in their own rows/storage, never in a blob.
10. **Assistant** — AI planning/search. Consumes Events + entities read-only at
    first; its writes go through the same store actions as the user's.
11. **Spaces** — future shared workspaces. This is why entities carry
    `owner_id` + (future) `space_id` from Phase 6 onward.

**The entity spine.** Every syncable thing shares:
`{ id (uuid, client-generated), type, owner_id, created_at, updated_at, deleted_at?, payload }`.
One spine → one sync engine, one undo system, one permission model, one AI surface.
New product areas become new `type`s, not new architectures. This is the
plugin-architecture foundation: a plugin is a registered entity type + renderer.

---

## 7. Folder structure

```
src/
  app/                    # composition root — the only place that knows everything
    App.tsx               # ~200 lines: providers + router + shell
    providers/            # AuthProvider, StoreProvider, ThemeProvider, ErrorBoundary
    router/               # parseRoute, useRoute, navigate, base-path rebasing
    shell/                # Masthead, BottomNav, PageSuspenseFallback
  features/
    home/                 # HomePanel, spotlight tour, reminder cards, progress ring
    library/              # StandardLibraryPanel, sections, collections, pack detail
    composer/             # Composer, PackEditor, CustomPackEditor, ActionCardEditor
    launcher/             # Overlay + all interception overlays, ContinueToAppCard,
                          #   reveal templates, launch-session hooks
    apps/                 # AppsPanel, app management, pause modal, setup interstitial
    settings/             # SettingsPanel, tester tools, delete account, morning summary
    access/               # AccessPanel, code screens, reconciliation, upgrade flows
    auth/                 # SyncConnectionScreen, legal modal, auth screens
    onboarding/           # Onboarding flow
    explore/              # ExplorePanel
    hq/                   # HQPanel — split internally the same way (hq/packs, hq/access, …)
    marketing/            # Landing, About, Download, EarlyAccess (lazy island)
    <feature>/index.ts    # public API; internals are private
  stores/
    cardsStore.ts  packsStore.ts  eventsStore.ts  settingsStore.ts
    sessionStore.ts  uiStore.ts   # transient UI (overlay stack, composer open)
  domain/
    card/  pack/  launcher/  access/  scheduling/   # pure: types, eligibility,
                                                    #  selection, registry, windows
  services/
    db/                   # IndexedDB: openDb, get/put/scan per entity store
    sync/                 # mutation queue, push/pull, conflict policy, Supabase IO
    auth/                 # session, sign-in/out, handoff refs
    notifications/  analytics/  errors/  updates/   # SW + appUpdate
  styles/
    tokens.css            # design tokens (colors, spacing, type, motion)
    base.css              # reset + global primitives (shrinking styles.css)
```

Migration is mechanical: today's `lib/launcherRegistry.js` → `domain/launcher/registry.ts`;
`lib/mybishbashSync.js` splits into `services/auth`, `services/sync`, and `features/hq/api`;
`storage.js` → `services/db` (after Phase 5) with a compat shim during transition;
`utils.js` dissolves into `domain/scheduling` + `domain/card`.

## 8. Component architecture

- **Shell vs. feature vs. primitive.** `app/shell` owns chrome (nav, masthead).
  Each feature owns its screens and dialogs. Shared primitives (glyphs, BrandMark,
  buttons, modals) live in `features/../ui` → promote to `src/ui/` only when used
  by 3+ features (rule of three; avoids a premature "design system" package).
- **Overlays become data, not call-stack.** Today `overlay` is a polymorphic
  object switched over inside `App()` with 25+ overlay components receiving 10+
  callback props each. Target: `uiStore.overlayStack: OverlayDescriptor[]`, a
  single `<OverlayHost/>` in the shell that maps descriptor → lazy component, and
  overlay components that call store actions directly instead of receiving
  `onDashboard/onCreateCard/onManageApp/...` prop bundles. This removes the
  largest prop-drilling surface in the app.
- **Screens subscribe narrowly.** Components read via store selectors
  (`useCards(selectEligibleToday)`), so a card edit re-renders one row, not the
  tree. Most existing `React.memo` boundaries become unnecessary and can be
  deleted once selector subscriptions land.
- **Launcher flow as a state machine (plain code).** The intercept → prepare →
  reveal → destination flow is currently distributed across effects and refs
  (`interceptActivationRef`, `pauseBypassInitiatedRef`, …). Model it as one
  reducer over a discriminated union of launch-session states in
  `domain/launcher/launchSession.ts`, unit-tested exhaustively. The refs disappear.

## 9. State management architecture

Classify every piece of state and give each class exactly one home:

| Class | Home | Persistence | Examples |
|---|---|---|---|
| Server-replicated entities | domain stores (Zustand) | IndexedDB + sync queue | cards, packs, events, settings, profile |
| Session | `sessionStore` | Supabase session storage | auth session, access profile, admin/tester status |
| Connection lifecycle | `sessionStore` | none | `syncStatus`, `syncError` — pre-Phase-6 boot/connection funnel; distinct from the Phase 6 sync-engine `status`, expected to be renamed (`connectionStatus`) or partially subsumed when `services/sync` lands |
| Transient UI | `uiStore` / component state | none | overlay stack, composer open, menu open, spotlight |
| Device-local prefs | `settingsStore` (local-only slice) | IndexedDB | pause clocks, suppression flags, e2e/demo flags |
| Derived | selectors only — **never stored** | n/a | home stats, eligible cards, usage days, greeting |

**The single write path** (the most important invariant in this document):

```
UI event → store action → (1) optimistic state update
                        → (2) db.put(entity)            [IndexedDB, awaited]
                        → (3) syncQueue.enqueue(mutation) [pushed when online]
```

No component writes localStorage. No effect uploads state. No debounce refs.
The queue is the *only* thing that talks to Supabase for user data. This single
rule replaces `cloudSaveTimerRef` + `cardSaveTimerRef` + `localDirtyRef` +
`highestKnownCloudTimeRef` + `isApplyingSharedStateRef` + `lastCloudStateStrRef`.

- **Optimistic updates** are the default and free: state updates before network.
  Rollback = mark mutation failed, re-apply server entity, surface a toast.
- **Undo** = inverse mutations. Because every change is a mutation record
  (`{entityType, entityId, patch, inversePatch, ts}`), undo history is a bounded
  stack of inverses — one mechanism for every feature, including future documents.
- **Realtime/collaboration later**: a Supabase Realtime channel feeding the same
  "apply remote entity" path the pull already uses. Collaboration changes the
  *conflict policy* (per-field LWW → CRDT for shared docs), not the architecture.
- **AI later**: assistants call the same store actions (tool-call surface =
  action surface) and read the same selectors. No parallel data path.

## 10. Service layer architecture

- `services/db` — ~150 lines over IndexedDB: object stores per entity type +
  `mutations` + `meta` (schema version, sync cursor). Explicit upgrade path in
  `onupgradeneeded`, mirroring the discipline of the SQL migrations.
- `services/sync` — the engine: `enqueue`, `push` (drain queue → Supabase upserts,
  ordered per entity), `pull` (cursor on `updated_at` → apply remote), conflict
  policy (per-entity LWW now; per-field later), `status` (`synced | pending(n) |
  offline | error`) exposed to the UI as a small indicator. Runs on: boot, online
  event, visibilitychange, post-mutation (debounced ~2s), SW background sync
  where available.
- `services/auth` — session lifecycle, handoff references, gate codes. Emits to
  `sessionStore`; nothing else touches `supabase.auth`.
- `services/analytics` — one `track(event, props)` facade writing to the local
  event queue → `launcher_events`-style tables. HQ dashboards read Postgres, not
  the client.
- `services/errors` — global error boundary + `window.onerror` +
  `unhandledrejection` → batched to a `client_errors` table (or Sentry if
  preferred later; the facade makes it swappable). Today production errors are
  invisible; this is the cheapest reliability win in the whole plan.
- `services/notifications`, `services/updates` — existing push/SW logic, moved,
  typed, unchanged in behavior.

## 11. Data flow

**Boot:** open IndexedDB → hydrate stores (ms, no network) → render app →
`auth.getSession()` in background → sync pull → apply remote deltas → push any
queued mutations. The app is fully usable at step 3 — this *is* offline-first,
and it also makes cold start effectively instant.

**Mutation:** as in §9 — action → optimistic → db → queue → push.

**Remote change (second device / future realtime):** pull/channel → compare
`updated_at` per entity → apply-or-skip → store update → narrow re-render.

**Reads:** components never fetch. They select from stores. Heavy histories
(events older than N days, journal bodies) load through paged store actions
backed by IndexedDB cursors, so memory stays bounded no matter how many years of
data exist.

## 12. Supabase architecture

**From blob to entities.** Target schema (all RLS `auth.uid() = owner_id`,
default-deny):

```sql
entities(id uuid pk, owner_id uuid, type text, payload jsonb,
         created_at, updated_at, deleted_at)          -- cards, packs, settings…
events(id uuid pk, owner_id uuid, type text, payload jsonb, occurred_at)
  -- append-only; partition by month when volume demands
-- existing: user_profiles, access codes/grants, launcher configs, global packs,
-- push subscriptions — already normalized; keep.
```

A single generic `entities` table (typed payload, indexed on
`(owner_id, type, updated_at)`) is deliberately chosen over one-table-per-type:
it keeps the sync engine generic, makes new entity types (documents, plugins)
zero-migration, and Postgres handles JSONB payloads at this scale comfortably.
Promote a type to its own table only when it needs relational queries or
partial column sync (likely: `documents` for body-out-of-band).

**Migration off the blob (Phase 6)** is dual-write, zero-downtime:
read blob → explode into entity rows on first login per user → dual-write both
paths for one release → flip reads to entities → stop writing blob → archive
table. `updated_at` per entity resolves any dual-write races.

**Other Supabase practices:**
- Privileged operations (account deletion, access grants, code claims) in Edge
  Functions / `security definer` RPCs only — never trust client role checks
  (client `checkIsAdmin` is UX, RLS is security).
- Realtime: one channel per user (`user:{id}`) later; per-space channels for
  collaboration.
- Storage buckets for media with per-owner policies; entities store references,
  never bytes.
- Retire the vestigial `access_entitlements` table (documented as vestigial) —
  delete or mark clearly; zombie tables invite security drift.
- Add a lightweight schema-contract test: a script that introspects production
  schema and diffs against migrations (extends the existing contract-check pattern).

## 13. Performance strategy

Design so the defaults stay fast at "hundreds of projects, thousands of cards,
years of events":

1. **Bounded boot.** Hydrate only hot data (active cards, current packs, last 30
   days of events, settings). Everything else is cursor-paged from IndexedDB on
   demand. Boot cost stops scaling with account age — the single most important
   performance property for a decade-old account.
2. **Selector subscriptions** (Phase 4) replace tree-wide re-renders; this
   supersedes most manual memo work.
3. **Virtualize long lists** when they exceed ~100 rows (library, event history,
   HQ tables). Windowing only — no infinite-scroll data model needed since
   IndexedDB cursors already paginate.
4. **Code splitting by feature**: each `features/*` is a lazy boundary. Target
   initial JS < 200KB gz (marketing pages already split; HQ, composer, explore
   follow). Recharts loads only with screens that chart.
5. **Network usage**: sync payloads become per-entity deltas (bytes) instead of
   whole-profile blobs (currently unbounded); pull uses `updated_at > cursor`.
6. **Background work** (morning summary, launcher stats, event aggregation) moves
   off the render path into idle-callback jobs; if profiles ever show jank, a
   worker is the escape hatch — don't add one preemptively.
7. **Memory**: paged event access + capped undo stack + virtualized lists keep
   heap flat regardless of account size.
8. **Budgets in CI**: extend the guardrail script with bundle-size and
   Lighthouse-CI thresholds so regressions fail the build, not the user.

## 14. Security considerations

1. **RLS is the security boundary.** Audit every table for default-deny +
   `auth.uid()` policies (history shows early anon-open policies; one repair
   migration exists — verify nothing else leaks). Add an automated RLS audit
   script to the guardrail suite.
2. **Fail-closed for anything monetized.** Access gate currently fails open by
   design for availability; keep that for *content*, but entitlement-gated
   premium features must fail closed (premium installs already do — preserve).
3. **Secrets hygiene**: `.env.local` never in client bundles beyond the anon key;
   service-role keys only in Edge Functions/CI.
4. **Account deletion** already has a dedicated security test — move server-side
   into an Edge Function if any part still trusts the client.
5. **Client data at rest**: IndexedDB is unencrypted; do not store auth tokens in
   entities; on Capacitor use secure storage for session material.
6. **Future collaboration**: space membership checks live in RLS/RPC from day
   one, never in client code.

## 15. Testing strategy

A three-layer pyramid replacing today's two-layer (scripts + e2e):

1. **Unit (new, Vitest)** — `domain/` pure functions (eligibility, selection,
   registry, access, windows, commitment lifecycle), the launch-session reducer,
   and above all the **sync engine** (queue ordering, conflict cases, offline
   replay, dual-write migration) with a fake Supabase transport. Milliseconds,
   run on every commit. This layer is what makes the refactor phases safe.
2. **Integration (existing `.mjs` scripts, gradually absorbed into Vitest)** —
   keep the guardrail/contract checks; port script-tests into Vitest as their
   subjects move into `domain/`/`services/`.
3. **E2E (Playwright, unchanged)** — the existing launcher/access/pack flows are
   the regression harness for every phase below. Add one e2e per new
   architectural capability (offline mutation replay; two-tab sync convergence).

Conventions: tests co-located (`domain/card/eligibility.test.ts`); every phase's
acceptance criteria include "all existing e2e pass unchanged".

## 16. Release strategy

Keep what works (staging branch, guardrails, Cloudflare builds) and add:

1. **CI order**: lint → typecheck → unit → build → guardrails → e2e → deploy
   staging → (manual) promote to production. Typecheck enters CI at Phase 7.
2. **Feature flags for architecture migrations**: sync-v2, IndexedDB, and store
   cutover each ship dark behind a flag; flip per-cohort (testers first — the
   TestPilot infrastructure is ideal); keep one-release rollback by retaining the
   old path until the flag is deleted.
3. **Schema version stamps** in both IndexedDB `meta` and the entity payloads,
   so old clients refuse to write ahead of their schema (prevents downgrade
   corruption during staged rollouts).
4. **Client error telemetry (Phase 1)** becomes the release health signal:
   error-rate diff between staging and production gates promotion.

## 17. Risks and trade-offs

| Decision | Trade-off accepted | Mitigation |
|---|---|---|
| Custom sync engine over off-the-shelf (Replicache/PowerSync/ElectricSQL) | We own ~300–500 lines of subtle code | Smallest-possible design (queue + LWW), exhaustive unit tests, upgrade path to per-field merge; vendors here are young/priced/lock-in-heavy — revisit at collaboration time |
| Zustand (new dep) | One more dependency | ~1KB, huge ecosystem, wrapped in our own store interfaces so it's swappable; alternative (hand-rolled `useSyncExternalStore`) costs more maintenance than it saves |
| Generic `entities` table | Weaker relational typing in Postgres | Per-type Zod/TS schemas validate payloads at the boundary; promote hot types to real tables when queries demand |
| Gradual TS (`allowJs`) | Long mixed period | Boundaries first (domain, services, stores) captures 80% of value in 20% of files |
| No router library | We maintain route parsing | It exists and works today; extraction just names it; adopting a library later is easy once routes are centralized |
| Phased refactor of a live product | Every phase touches load-bearing code | Strangler pattern: old and new paths coexist behind flags; e2e suite is the invariant; phases are individually revertible |
| Retiring styles.css slowly | Two styling systems for months | Rule: new/moved components use Tailwind+tokens; styles.css only shrinks, never grows (guardrail-checkable) |

**Biggest genuine risk:** the blob→entity migration (Phase 6). It is also the
least optional — every future ambition depends on it. Hence dual-write, tester
cohort first, and blob retained read-only for a full release cycle.

## 18. Five-year architectural vision

- **Year 1 — Foundation.** Phases 0–7 complete: feature modules, domain stores,
  IndexedDB, sync v2, TS at boundaries. App works fully offline; boot < 1s
  regardless of account age; App.jsx is a composition root.
- **Year 2 — The personal OS.** Documents (notes/journal/projects) land as new
  entity types on the spine — weeks of work, not a rewrite. Undo everywhere.
  Realtime channel gives instant multi-device. Capacitor apps feel native because
  the data layer is local.
- **Year 3 — Intelligence.** Assistant reads the event log + entities through
  the selector layer; acts through store actions (the action surface *is* the
  tool-call surface). AI search over local IndexedDB first (private by default),
  server embeddings opt-in.
- **Year 4 — Together.** Spaces: `space_id` on the spine, RLS per space,
  per-space realtime channels. Shared docs upgrade conflict policy to CRDT
  *for that entity type only* — the architecture localizes the hard problem.
- **Year 5 — Platform.** Plugin = registered entity type + renderer + declared
  store-action capabilities, running in the same registry pattern the launcher
  system proved. Calendar/email integrations are sync-engine adapters.
  Automation = triggers on the event log.

The through-line: **one entity spine, one write path, one event log.** Every
future capability is an extension of those three, which is what "no further
architectural rewrite" means concretely.

---

## 19. Engineering roadmap

Ten phases. Each is independently implementable, reviewable, testable, and
deployable. Every phase's regression baseline is: **`npm run test:release` passes
unchanged** (plus the new tests it adds). Phases 1–4 are pure refactors (no
user-visible change); 5–6 are flagged migrations; 7–10 harvest the value.

> Execution note for AI agents: within a phase, work file-by-file, keep the app
> building at every commit, never change behavior and structure in the same
> commit, and treat any e2e failure as a stop-the-line event.

---

### Phase 0 — Safety net (tooling)
- **Objective:** Vitest + ESLint (correctness rules only) + CI wiring; first
  unit tests for existing pure logic.
- **Reasoning:** Every later phase moves load-bearing code; unit tests + lint are
  the cheap insurance that makes them mechanical.
- **Changes:** add `vitest`, `eslint` (flat config; correctness and
  dangerous-pattern rules only — no formatting rewrite, no TS linting until
  Phase 7), `npm run test:unit`, `npm run lint`; tests for `utils.js`
  (eligibility, windows, commitment lifecycle), `lib/accessCapabilities.js`,
  `lib/cardSelection.js`, `lib/launcherRegistry.js`, `lib/launcherAvailability.js`,
  `eventLog.js` pure exports. Wire into `staging-checks.yml`, `test:before-push`
  and the `test` chain so the tooling cannot be silently bypassed. No src
  changes except exporting testables.
- **Risks:** none functional. Lint noise → correctness-only rule set;
  `exhaustive-deps` stays off until Phase 4.
- **Acceptance:** unit suite green and fast (<10s); CI runs lint+unit before
  build; release suite green.
- **Regression tests:** existing suites unchanged.
- **Impact:** refactor phases become verifiable in milliseconds instead of full e2e runs.
- **Packet:** `docs/architecture/phase-00-safety-tooling.md`.

### Phase 1 — Error telemetry (errors only — no analytics)
- **Objective:** root `ErrorBoundary` in `main.jsx` (above the existing
  `AppShellErrorBoundary`, which stays) + `services/errors` (window.onerror,
  unhandledrejection, boundary catches → scrubbed, deduped, rate-limited
  inserts to a `client_errors` table via the existing nullable Supabase client).
- **Deliberately not in this phase:** the `services/analytics` `track()` facade,
  session replay, or any product analytics — deferred to Phase 4+ when store
  actions give it a natural seam. Telemetry here means *unhandled errors only*.
- **Reasoning:** the refactor needs a production health signal *before* it
  starts; today errors are silent beyond the console.
- **Changes:** new `src/services/errors/`; migration for `client_errors`
  (RLS: authenticated insert-own; admin-only read via `admin_users`); root
  boundary in `main.jsx`; one-line report hook in `AppShellErrorBoundary`.
  Release identification reuses the existing `__MYBISHBASH_VERSION__` define
  and `version.json` sourceSha — no new build plumbing.
- **Risks:** error-report loops → dedupe + rate-limit client-side; reporter
  must no-op when Supabase env is absent, in DEV, and in e2e/demo modes.
- **Acceptance:** thrown render error shows recovery UI and lands in Postgres;
  no console-path regressions; release guardrails untouched.
- **Regression:** e2e suite; unit tests for scrubbing/batching/dedupe.
- **Impact:** every subsequent phase's rollout is observable.
- **Packet:** `docs/architecture/phase-01-error-telemetry.md`.

### Phase 2 — Extract the composition root (providers + router)
- **Objective:** create `src/app/`; move routing (`parseRoute`,
  `getRouteFromLocation`, history writes, BASE_PATH rebasing) into `app/router/`
  with a `useRoute()`/`navigate()` API; move auth/session/access-profile
  effects into `AuthProvider` + `sessionStore` (first Zustand store); move theme,
  app-update, offline-flag, notification-permission effects into providers.
- **Reasoning:** these are the least entangled 1,500± lines of `App()`; removing
  them creates the pattern every later extraction follows.
- **Changes:** `app/router/*`, `app/providers/*`, `stores/sessionStore.ts`;
  `App.jsx` shrinks accordingly. Zustand added.
- **Risks:** intercept-route boot sequencing (route → overlay → launch session)
  is delicate → extract *verbatim* first, unit-test `parseRoute` against a table
  of every known URL shape (including Capacitor base paths and e2e flags).
- **Acceptance:** App.jsx < 11,000 lines; route/auth behavior byte-identical
  (e2e launcher-flow-trace is the oracle); `parseRoute` unit-tested.
- **Regression:** full e2e incl. `launcher-terminal-exhaustive`.
- **Impact:** composition-root pattern established; session state has one home.

### Phase 3 — Feature module extraction (components out of App.jsx)
- **Objective:** move the ~90 components into `features/*` per §7, with
  `index.ts` public APIs; overlays become an `OverlayHost` + descriptor stack in
  `uiStore`; shared glyphs/primitives to `app/shell` / feature `ui/`.
- **Reasoning:** pure moves — the highest line-count reduction at the lowest
  semantic risk, and the precondition for store adoption (Phase 4).
- **Changes:** most of App.jsx's lower 8,000 lines relocate; imports rewire;
  lazy boundaries added per feature. HQPanel splits into `features/hq/*` with the
  same pattern. No logic changes.
- **Risks:** prop-drilling makes moves noisy → allowed interim: features receive
  a typed `actions` object from App; Phase 4 replaces it with stores. Lazy-split
  regressions → keep chunk map diffed in CI.
- **Acceptance:** App.jsx < 3,000 lines; no feature imports another feature's
  internals (lint rule active); bundle-size budget respected.
- **Regression:** full e2e; visual spot-checks via existing screenshot flows.
- **Impact:** parallel work on features becomes possible (humans or agents);
  monolith risk ends.

### Phase 4 — Domain stores & the single write path (local)
- **Objective:** `cardsStore`, `packsStore`, `eventsStore`, `settingsStore`,
  `uiStore`; the 132 `useState` and their save-effects collapse into store
  actions; persistence still localStorage (unchanged format) but now invoked
  *only inside actions*; components subscribe via selectors.
- **Reasoning:** establishes action → persist discipline while keeping the
  storage engine and sync untouched — one variable changes at a time.
- **Changes:** `stores/*`; App.jsx loses its state block; save-timer refs for
  *local* persistence deleted; launch-session reducer extracted to
  `domain/launcher/launchSession.ts` with exhaustive unit tests; the cloud-sync
  effect remains, now reading from stores.
- **Risks:** subtle ordering between old effects and new actions → migrate one
  store at a time (settings → packs → cards → events), release each behind the
  staging cycle. The commitment/reveal flows are the most stateful — do cards last.
- **Acceptance:** zero direct `localStorage` writes outside `services/`/`storage.js`
  (lint-enforced); App() < 800 lines; launch-session reducer ≥95% branch coverage;
  interaction latency unchanged or better (spotlight/e2e timings).
- **Regression:** full e2e ×2 runs (flake check) — this phase touches everything.
- **Impact:** one write path locally; undo/redo becomes implementable; most
  memo boundaries deletable.

### Phase 5 — IndexedDB persistence engine
- **Objective:** `services/db` (IndexedDB); stores hydrate/persist through it;
  one-time migration imports all localStorage keys; localStorage retained for
  boot-critical flags (theme, setup-complete, e2e flags) only.
- **Reasoning:** removes the 5MB ceiling and sync-blocking reads before data
  volume grows; prerequisite for bounded boot and paged history.
- **Changes:** `services/db/*`; `storage.js` becomes a shim then shrinks;
  boot becomes async-hydrate (splash until stores ready — already effectively
  true); events store gains paged reads.
- **Risks:** Safari/Capacitor IndexedDB quirks → e2e on WebKit project;
  migration idempotency → versioned `meta.migratedFrom` flag + keep localStorage
  data untouched for one release (rollback = flip flag).
- **Acceptance:** fresh install, upgrade-with-data, and rollback all verified by
  e2e; boot time with 10k synthetic events < 1s (add a perf script); no data loss
  across the migration in a scripted round-trip test.
- **Regression:** full e2e on Chromium + WebKit; new migration round-trip test.
- **Impact:** years-of-data becomes a non-event; boot cost decoupled from account age.

### Phase 6 — Sync v2: entities + mutation queue (the big one)
- **Objective:** `entities` table + `services/sync` (queue, push, pull,
  per-entity LWW); blob exploded per user on first login; dual-write blob+entities
  for one release; then reads flip, blob writes stop.
- **Reasoning:** the load-bearing migration everything else depends on (§12).
- **Changes:** migrations (`entities` + indexes + RLS); `services/sync/*`;
  the last sync refs in App (`highestKnownCloudTimeRef` et al.) deleted;
  `mergeEntitiesById`/`normalizeSharedState` retire; sync status indicator in
  Settings.
- **Risks:** highest of the plan. Mitigations: feature flag per cohort
  (TestPilot testers → staff → %roll); dual-write with `updated_at` supremacy;
  blob retained read-only ≥1 release; sync engine unit-tested against a scripted
  fake transport for the full conflict matrix (offline edit both sides, delete
  vs edit, clock skew, replay after crash mid-queue).
- **Acceptance:** two-device convergence e2e (two contexts, interleaved offline
  edits, both converge); airplane-mode session replays fully on reconnect;
  payload per typical edit < 2KB (vs whole blob); zero lost-write reports from
  tester cohort over one release cycle.
- **Regression:** full release suite + new sync e2e; guardrail asserting blob
  writes absent post-flip.
- **Impact:** collaboration, realtime, partial sync, AI reads, sharing — all unblocked.

### Phase 7 — TypeScript at the boundaries
- **Objective:** `tsconfig` with `allowJs`; convert `domain/`, `services/`,
  `stores/` and all `index.ts` feature APIs to strict TS; Zod (or hand-rolled
  guards) validating entity payloads at the sync boundary; typecheck in CI.
- **Reasoning:** now that contracts exist (actions, entities, services), types
  make them permanent — and make AI-executed feature work dramatically safer.
  Doing TS earlier would have typed code that was about to move.
- **Changes:** ~40 files converted; entity payload schemas per type; CI gains
  `tsc --noEmit`.
- **Risks:** low; mechanical. Any-creep → lint bans `any` in `domain/`/`services/`.
- **Acceptance:** typecheck green in CI; malformed remote payloads rejected +
  reported (unit test); no runtime behavior change.
- **Impact:** machine-checked contracts across every layer boundary.

### Phase 8 — Styling consolidation
- **Objective:** `styles/tokens.css` (extract the de-facto design system);
  Tailwind for feature components; port screens feature-by-feature; guardrail:
  styles.css line count monotonically decreases.
- **Reasoning:** 12.9k orphaned lines; two systems; dead CSS unfindable.
  Deferred until components live in features so CSS moves with its owner.
- **Changes:** per-feature CSS ports (start smallest: settings, access; end:
  home/launcher overlays which carry the brand feel).
- **Risks:** visual regressions → screenshot-diff the existing screenshots/ flows
  per ported feature; port, don't redesign.
- **Acceptance:** styles.css < 3,000 lines by phase end (residual = true globals);
  zero visual diffs beyond antialiasing.
- **Impact:** stylable-by-agents; dead CSS deletable; consistent tokens for future surfaces.

### Phase 9 — Performance & scale hardening
- **Objective:** virtualization (library, history, HQ tables); hot/cold hydration
  split; event-log pagination UI; undo/redo shipped (mutation inverses now exist);
  bundle + Lighthouse budgets in CI.
- **Reasoning:** harvest of Phases 4–6; do after the data layer exists so
  optimizations target the real shape.
- **Changes:** list components in library/hq/history; `eventsStore` paging;
  `uiStore` undo stack; CI budgets.
- **Risks:** virtualization vs. drag/tour interactions → per-list e2e.
- **Acceptance:** synthetic 5k-card / 100k-event account: boot < 1s, 60fps
  scroll, heap < 150MB; initial JS < 200KB gz; undo works across cards, packs,
  settings.
- **Regression:** perf script in CI; full e2e.
- **Impact:** "decade-old account" performance guaranteed by CI, not hope.

### Phase 10 — Platform readiness (realtime, spaces-ready spine, plugin seed)
- **Objective:** Supabase Realtime channel replacing pull-polling on active
  sessions; `space_id` (nullable) added to the spine + RLS scaffolding;
  entity-type registry (`registerEntityType({type, schema, renderer})`) with
  cards/packs re-registered through it as proof.
- **Reasoning:** cheap now, expensive later; converts §18's vision from plan to API.
- **Changes:** `services/sync/realtime.ts`; spine migration; `domain/registry`.
- **Risks:** realtime reconnect storms → backoff + pull fallback (pull path stays).
- **Acceptance:** second device reflects an edit < 2s without reload; a demo
  entity type ("note", behind a flag) registers, renders, syncs, and undoes with
  **zero changes** outside its own module — the definitive test of this blueprint.
- **Impact:** documents, AI, collaboration and plugins are now feature work.

---

### Sequencing summary

```
0 Safety net ─► 1 Error visibility ─► 2 Composition root ─► 3 Feature modules
      ─► 4 Stores/write path ─► 5 IndexedDB ─► 6 Sync v2 ─► 7 TypeScript
      ─► 8 Styling ─► 9 Performance ─► 10 Platform
```

Phases 0–3 are low-risk and can proceed immediately on `staging`.
Phase 6 is the strategic gate; do not begin features like Documents before it.
Phases 7–8 can interleave with product work; 9–10 are harvest.

*End of blueprint.*
