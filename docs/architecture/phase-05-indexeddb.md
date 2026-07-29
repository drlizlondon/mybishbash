# Phase 5 — IndexedDB persistence engine

**Blueprint:** `docs/architecture-blueprint.md` §10 (`services/db`), §19 Phase 5
**Status tracker:** `docs/architecture/roadmap-status.md`
**Depends on:** Phase 4 complete (every domain-state write flows through store
actions; `storage.js`/`eventLog.js` are the only localStorage writers for
domain data).
**Executor:** Claude Sonnet, fresh session, branch `staging`.

---

## Objective

Replace localStorage with IndexedDB as the engine underneath `storage.js` —
**without changing `storage.js`'s synchronous API, its key names, or its data
format**. Deliverables:

1. `src/services/db/` — a thin, dependency-free IndexedDB wrapper (~150 lines)
   with `kv` + `meta` object stores and an explicit `onupgradeneeded` version
   path (mirroring the SQL-migration discipline).
2. A **hydrated in-memory mirror**: `main.jsx` awaits `hydrateLocalData()`
   before first render; after that, `storage.js` loaders read the mirror
   synchronously and savers write mirror + async IndexedDB put. Every
   synchronous boot assumption in `App()` (the intercept boot chain,
   `buildInitialState`, store initializers) survives untouched.
3. A **one-time, idempotent localStorage import** guarded by a `meta` flag.
4. **Dual-write for one release**: savers also write localStorage during the
   transition release, so rolling back to the previous build (or flipping the
   kill switch) loses nothing. Dual-write retires in a follow-up commit that
   ships only after ≥1 clean release.
5. A **kill switch** (`mybishbash.storage-engine.v1` = `"localstorage"`) that
   forces the legacy engine at boot without a redeploy, plus automatic
   fallback when IndexedDB fails to open (quota, private mode, timeout).
6. **WebKit e2e coverage** for persistence-critical flows and a scripted
   **10k-event boot < 1s** perf gate.

**Deliberately NOT attempted:**
- No change to what is stored or how it is shaped: same keys, same JSON
  strings, same `SHARED_STORAGE_KEYS` semantics, same legacy-prefix shim.
- No sync-engine work, no `entities`, no mutation queue (Phase 6).
- No per-event object store or paged event reads (Ruling R3 below — amends
  the blueprint's Phase 5 sketch).
- No changes to stores (`src/stores/*`) or features — the engine swap is
  invisible above `storage.js`/`eventLog.js`.
- No encryption-at-rest, no `navigator.storage.persist()` (note for Phase 9).

## Rulings (resolved — do not relitigate)

### R1 — Key split: everything behind storage.js/eventLog.js migrates; pre-hydration flags stay on localStorage

The blueprint said "localStorage retained for theme, setup-complete, e2e
flags". Amended, with rationale: because `main.jsx` gates render on
`hydrateLocalData()`, *anything read at or after App's first render* can live
in the mirror — including `setup-complete` and `mood`, which
`buildInitialState()` reads at first render. Splitting them out would create
two engines for `SHARED_STORAGE_KEYS` (which `clearSharedMyBishBashState`
clears atomically today) — a split-brain for zero benefit.

**Migrates to IndexedDB (via the mirror):** every key read/written through
`src/storage.js` and `src/eventLog.js` — the ~20 `mybishbash.*.v1` keys
including `event-log`, `offline-event-queue`, `user-id`, `app-pauses`, and
their legacy-prefix fallbacks (the legacy shim keeps working: on import, the
existing `getStorageItem` legacy lookup runs once more against localStorage).

**Stays on localStorage (enumerate by grep before commit 2; expected set):**
everything read *before* hydration resolves or outside the storage layer —
`src/app/e2e.js` flags (`MYBISHBASH_E2E_MODE`, tester-mode, launch-timing
log), demo/preview/signup-handoff flags consumed in `RootRouter`/module scope,
`src/lib/dynamicLauncherCache.js` (read in `main.jsx` **before** hydration),
`src/appUpdate.js` + `src/morningSummary.js` device-local keys,
`src/features/launcher/launchSessionStorage.js` launch-session/
protected-app-context keys (written during synchronous `useState`
initializers — must stay synchronous), sessionStore's Supabase session
storage, and the new kill-switch key itself. If grep finds a reader that runs
pre-hydration but whose key is in `SHARED_STORAGE_KEYS`, STOP and report.

Record this amendment in blueprint §19 Phase 5 and roadmap-status in commit 1.

### R2 — The mirror is the API-compatibility layer

> **CORRECTED 2026-07-29 (commit 1.5).** The parenthetical below originally
> read "(already the single read/write funnel — **verified**)". That claim was
> **false when written and was never verified**: the audit before commit 2
> found five paths bypassing the funnel (see §"Commit 1.5" below). They were
> closed by commit 1.5 as a standalone behaviour-preserving refactor, *before*
> any engine seam was introduced. R2's design is unchanged; only its premise
> is now actually true. Do not read the sentence below as evidence of anything
> — the evidence is commit 1.5's tests.

`storage.js` keeps exporting the same synchronous `loadX`/`saveX` functions.
Internally, `getStorageItem`/`setStorageItem`/`removeStorageItem` (the single
read/write funnel — true as of commit 1.5, not before it) route by engine:

- **legacy engine:** `window.localStorage` exactly as today (byte-identical
  code path, kept until dual-write retirement + one release).
- **idb engine:** reads hit `Map`-based mirror (seeded by `hydrateLocalData()`);
  writes update the mirror synchronously, then `void dbPut(key, value)`
  (fire-and-forget, per-key last-write-wins ordering via a small per-key
  promise chain), and — during the transition release — also
  `window.localStorage.setItem(key, value)` (dual-write).

`eventLog.js`'s direct `window.localStorage` calls are re-pointed to the same
funnel (import `getStorageItem`/`setStorageItem` from `storage.js`), with
key names and payloads unchanged. `clearSharedMyBishBashState` clears mirror +
IDB keys + localStorage (all engines), preserving today's reset semantics.

Failure policy: if `openDb()` rejects or exceeds a 3s timeout at boot →
log via `services/errors`, set engine = legacy for this session, resolve
hydration; the app boots from localStorage (fresh, thanks to dual-write).

### R3 — Event log stays a single kv value this phase

Per-event rows and paged reads belong to the entity spine (Phase 6) and the
performance harvest (Phase 9). A 10k-event JSON array is a single ~2–4MB kv
read parsed in tens of milliseconds — the <1s boot gate passes without a
second storage shape. This amends blueprint §19 Phase 5 ("events store gains
paged reads" → deferred); the IndexedDB 5MB-ceiling win still lands because
IDB kv values are effectively unbounded.

### R4 — WebKit coverage is a scoped second Playwright project

Add to `playwright.config.ts`:

```ts
{
  name: 'webkit-smoke',
  use: { ...devices['Desktop Safari'] },
  testMatch: [
    '**/release-smoke.spec.ts', '**/auth-session-persistence.spec.ts',
    '**/offline-fallback.spec.ts', '**/onboarding.spec.ts',
    '**/launcher-flow-trace.spec.ts', '**/storage-migration.spec.ts',
  ],
}
```

(scope the existing project's `testMatch` so the two don't overlap-run the
full suite twice). Rationale: these six exercise boot, persistence, offline
queue, and the intercept chain — the surfaces where WebKit IndexedDB quirks
bite; running all 20+ specs on WebKit doubles CI for no additional storage
signal. CI: `npx playwright install --with-deps webkit` added to
`staging-checks.yml`, and the `webkit-smoke` project runs there and in
`test:release` (via plain `playwright test`, which now includes both
projects). Expanding WebKit scope is a Phase 9 option.

## Commit 1.5 — unify every storage access behind the existing funnel (landed 2026-07-29)

**Why it exists.** R2's premise was false. `getStorageItem`/`setStorageItem`
were *not* the single read/write funnel; five paths bypassed them, three of
them touching `SHARED_STORAGE_KEYS`. Introducing the engine seam on top of
that would have split the brain silently — the seam would have re-pointed the
funnel while the bypasses kept reading and writing localStorage. Ruling: close
the bypasses **first**, as a standalone behaviour-preserving refactor with no
engine seam in it. Commit 1.5 is that refactor; commit 2 proceeds unchanged
afterwards.

**The five bypasses closed:**

| # | Site | Was | Now |
|---|---|---|---|
| 1 | `storage.js` `getAppPausesMap`/`saveAppPausesMap` | direct `window.localStorage` for `mybishbash.app-pauses.v1` — the funnel bypassed *inside storage.js itself* | `getStorageItem`/`setStorageItem` |
| 2 | `storage.js` `clearSharedMyBishBashState` | direct `removeItem` loop | new `removeStorageItem` funnel |
| 3 | `src/eventLog.js` | a byte-for-byte **private duplicate** of the funnel, legacy-prefix shim included | imports the real one from `storage.js` |
| 4 | `src/stores/settingsStore.js` `loadExplicitLauncherBehaviorSettings` | direct read of `mybishbash.launcher-behavior-settings.v1` | `getStorageItem` |
| 5 | `src/lib/mybishbashSync.js` `readE2ELocalSharedState` | direct reads of 13 production keys in the E2E shared-state bridge | `getStorageItem` / `readSharedStateJson` |

`getStorageItem`, `setStorageItem` and the new `removeStorageItem` are now
**exported** from `storage.js` (they were module-private). `removeStorageItem`
is a plain `window.localStorage.removeItem` funnel with no added semantics —
`clearSharedMyBishBashState` keeps enumerating both the modern and the legacy
key lists explicitly, exactly as before.

**Ruling — `app-pauses` uses the normal funnel.** No special no-legacy-shim
path was added. The funnel now also reads `bishbash.app-pauses.v1` if present;
git history confirms that literal has **never** been written by any build (0
commits contain it), so preserving the distinction has no observable value and
would have meant a second funnel variant for one key.

**Ruling — the E2E sync bridge is funnelled and nothing more.** The bridge is
E2E infrastructure that writes and reads *production* storage keys, so it must
use the same *current* funnel as production callers. That is the whole change.
It does **not** move behind the persistence engine, and this commit takes no
position on whether it eventually should. **The bridge remains architecturally
separate from the future persistence engine; moving it behind the engine is a
Phase 6 (sync) question, not a hidden commitment made here.** Its own
`MYBISHBASH_E2E_*` scratch keys stay on direct localStorage — they are harness
flags with no production meaning and no legacy-prefix history.

**Not in commit 1.5** (each explicitly out of scope): the engine seam, debounce
or hydration timing, relocating `launchSessionStorage.js`, D5 policy,
dual-write, sync semantics, persistence formats, new dependencies.

**Proof carried by the commit:**
- `src/storage.funnel.bytes.test.js` + `src/__fixtures__/storage-funnel-bytes.baseline.json`
  — six scenarios driven through the public API against a recording
  localStorage stub; the baseline was captured at the **pre-refactor** commit.
  The ordered write/remove log and the final store are compared byte for byte
  and are **identical**; the read logs are recorded too and also came out
  identical, because every real profile has the modern key present so the
  shim's extra legacy read never fires.
- `src/storage.funnel.test.js` — 15 focused tests, one group per bypass. They
  pin the funnel's *observable* contract (legacy-prefix visibility and
  promotion), not which function name is called, so a reverted site fails for
  losing user data rather than for moved text.
- Recorded honest limit: routing `clearSharedMyBishBashState`'s loop through
  `removeStorageItem` is behaviour-preserving **by construction**, so no
  mutation can distinguish it. Its test pins the exact removal set instead.

**Residual direct access to production storage keys after 1.5 — one site,
knowingly left** (CLOSED by commit 1.6, below): `src/App.jsx`'s demo/e2e reset helpers
(`resetDemoState`/`resetDemoOnboardingState`, ~lines 915–950) directly
`removeItem` eight `SHARED_STORAGE_KEYS` and directly `setItem`
`mybishbash.setup-complete.v1` + `mybishbash.profile.v1`. They are classified
TEST-FLAG debt in the D5 exception table and were outside commit 1.5's ruled
scope. **Commit 2 must funnel them or scope the engine so demo/e2e resets
cannot desynchronise the mirror** — under the idb engine a direct
`removeItem` here would clear localStorage while leaving the mirror and IDB
populated.

## Commit 1.6 — funnel the reset path, and make the read side a ratchet (landed 2026-07-29)

**Why it exists — Lizzie's precondition for commit 2.** After 1.5 the funnel's
singleness was held by *convention and tests, not mechanically*. The D5 ratchet
is scoped to `src/features/**`, `src/components/**`, `src/editing/**` and
`src/App.jsx`, and it polices **writes only** — it would not have caught a new
direct **read** of an owned key in `src/lib/` or `src/stores/`, which is exactly
the shape of two of the five bypasses 1.5 had just repaired. Ruling: **commit 2
(the engine seam) may only begin once the reset path is funnelled AND future
read-side bypasses are mechanically blocked.** Commit 1.6 is that work. It is a
pure refactor plus a lint rule — no engine seam, no timing change, no format
change, no new dependencies.

**Task A — the demo/e2e reset path is funnelled.** `resetDemoSignupState` and
`resetDemoOnboardingState` in `src/App.jsx` cleared a *mixture* of namespaces in
one list. The two halves are now split explicitly:

- **owned** — the eight `SHARED_STORAGE_KEYS` (`cards`, `profile`,
  `action-cards`, `event-log`, `offline-event-queue`,
  `launcher-behavior-settings`, `app-pauses`, `setup-complete`) go through
  `removeStorageItem`, via a new `FUNNELLED_DEMO_RESET_KEYS` set and a
  `removeDemoResetKey(key)` dispatcher. The two seed writes
  (`setup-complete` = `"false"`, the demo `profile`) go through
  `setStorageItem`.
- **unowned** — the `MYBISHBASH_*` test-mode flags and the two onboarding
  handoff keys stay on direct `localStorage`. They are read pre-hydration and
  are legitimately direct per Ruling R1; funnelling them would be a semantic
  change, not a refactor.

Dispatching per key (rather than splitting the list into two loops) keeps the
**call order** identical, so the write log is unchanged. This closes the
residual recorded at the end of the 1.5 section: under the idb engine those
`removeItem` calls would have cleared localStorage while leaving the mirror and
IDB populated — *a demo reset that does not reset*.

Two D5 write exceptions are **retired** by this (one-line deletions each):
`literal("mybishbash.setup-complete.v1")` and `literal("mybishbash.profile.v1")`
for `src/App.jsx`. Verified: re-adding a direct `setItem` of either key in
`App.jsx` now fails lint.

**Task B — the read-side ratchet.** `eslint.config.js` gains a second
`no-restricted-syntax` half, built in the same shape and with the same rigour as
D5: a direct `localStorage.getItem` (both `localStorage.x` and
`window.localStorage.x` forms) of a **storage.js-owned key** is an error across
**all of `src/**`** — not just D5's four directories.

- **Owned-key set** = exactly `storage.js`'s `SHARED_STORAGE_KEYS` (20 keys),
  plus their `bishbash.`-prefixed legacy twins, matched by
  `OWNED_KEY_PATTERN`. Nothing else. Per Ruling R1 the app's many legitimate
  direct reads — pre-hydration flags (`MYBISHBASH_E2E_*`, `_DEMO_MODE`, the E2E
  auth keys), device-local keys (`dynamic-launchers.v1`, `launch-session.v1`,
  `pending-launcher-install.v1`), diagnostic ring buffers, HQ/marketing view
  state, the Supabase session key — are **not** owned and are **not** flagged.
  An over-broad rule that forced ~90 exceptions would have been a failed design.
- **Out of scope by design** (not exceptions — places the rule has nothing to
  say about): `src/storage.js` (it *is* the funnel), `src/services/db/**` (the
  engine layer, commit 2's home), and `src/**/*.test.{js,jsx}` (tests drive the
  funnel against recording stubs and must assert on raw keys).
- **The exception table `OWNED_READ_EXCEPTIONS` is EMPTY** — and that is the
  finding. After 1.5's five closures and 1.6's reset-path funnelling, `src/**`
  contains **no direct read of an owned key at all**. The rule asserts a real,
  currently-total property rather than papering over debt. Any future entry is
  new debt, keyed to one exact file AND one exact key, with its own
  justification; retiring it is a one-line deletion. No directory-wide or
  wildcard exemptions exist.

Mechanically the two halves are composed by `restrictedSyntax({ writeAllow,
readAllow })`, because ESLint flat config is last-block-wins per rule name:
every block that sets `no-restricted-syntax` restates both halves, so a D5
write-exception block can no longer silently drop the read selectors.

**Known limit, stated honestly.** The rule matches the *call-site literal*. A
key reached through a variable — `localStorage.getItem(SOME_KEY)` — is not
matched, because ESLint selectors cannot resolve a constant's value. This is the
same limit D5's write ratchet has. It is mitigated, not eliminated, by the fact
that `storage.js` exports no key constants: a bypass author must still write the
literal somewhere in their own file. Closing it properly needs a type-aware or
scope-resolving check (Phase 7 TypeScript lint), not an esquery selector.

**Proof carried by the commit** (all probes reverted; tree clean):
- *Read ratchet fires:* new direct reads of `mybishbash.cards.v1` and
  `bishbash.profile.v1` added to `src/lib/dynamicLauncherCache.js` and of
  `mybishbash.event-log.v1` to `src/stores/sessionStore.js` → `npx eslint src`
  went 0 errors → **3 errors**, both callee forms and both key prefixes.
- *Exceptions are load-bearing:* adding **one** exact exception line
  (`dynamicLauncherCache.js` + `cards.v1`) dropped it to **2 errors** —
  silencing exactly that one call and nothing else, including the *legacy-prefix
  read in the same file*. Deleting that one line with the read still present
  returned it to **3 errors**.
- *Not over-broad:* a `MYBISHBASH_E2E_MODE` read added alongside the probes did
  **not** fire, at any point.
- *Write ratchet still intact after the restructure:* a `setItem` added to
  `src/features/log/LogScreen.jsx` still fails with the D5 message.
- *Byte-identity for the reset path:* two new scenarios in
  `src/storage.funnel.bytes.test.js` (`demo-reset-signup`,
  `demo-reset-onboarding`) drive both helpers through their public API against
  the recording stub, seeded with all 20 shared keys plus the flags and
  onboarding keys. The baseline was captured at the **pre-refactor** `App.jsx`
  and compared against the post-refactor one: ordered write/remove log and final
  store **identical**, 8/8 green. The other six 1.5 scenarios were untouched by
  the capture (baseline diff is insertions only).

**Consequence for commit 2.** The precondition is met: the reset path is
funnelled, and a new read-side bypass in `src/lib/`, `src/stores/` or anywhere
else in `src/**` now fails the build. Commit 2 may begin.

## Current-state evidence

- `src/storage.js`: all reads/writes funnel through
  `getStorageItem`/`setStorageItem`/`removeStorageItem` **as of commit 1.5**
  (not before — see above); ~20 versioned keys; legacy `bishbash.`-prefix
  migration shim; `SHARED_STORAGE_KEYS` (20 entries incl. `event-log`,
  `offline-event-queue`, `user-id`); `clearSharedMyBishBashState`.
- `src/eventLog.js`: since commit 1.5 it imports the storage.js funnel. Before
  1.5 it carried a private duplicate of the funnel *including the legacy
  shim* — not the "direct `window.localStorage` calls" this packet originally
  described.
- Boot order (must survive verbatim): `main.jsx` runs
  `initDynamicLaunchersFromCache()` → renders `RootRouter` (consumes handoff/
  demo flags from localStorage) → `App()` first render runs
  `buildInitialState()` + store initializers synchronously (Phase 4 stores
  call the same loaders) → intercept boot chain initializers.
- E2E seeding: specs seed **localStorage** before first navigation. With the
  idb engine, every fresh browser context has empty IndexedDB ⇒ the import
  runs on first boot and picks the seeded keys up. No e2e helper changes are
  expected; any spec that asserts localStorage *contents post-boot* keeps
  passing during the dual-write release — enumerate such assertions by grep
  (`localStorage` in `tests/e2e/**`, `e2e/**`) before commit 4 and list them
  in the commit message as dual-write-dependent (they get revisited at
  dual-write retirement).
- Playwright: single Chromium project; webServer `vite preview` on
  `127.0.0.1:4173/mybishbash`. CI = `staging-checks.yml` (lint, unit, build,
  before-push, 3 smoke suites) + full e2e in `test:release`.
- Phase 4 gates live: boundaries, bundle budget, launch-session coverage,
  write-path lint rule (its allowlist already names `storage.js`,
  `eventLog.js`, `services/**` — `services/db` is automatically legal).
- Capacitor 8 iOS/Android shells load the same web assets; IndexedDB in
  WKWebView persists in the app container (see `CAPACITOR_TESTING.md` for the
  manual smoke procedure).

## Packages to add

| Package | Version | Scope | Why |
|---|---|---|---|
| `fake-indexeddb` | latest 6.x | devDependency | unit-test `services/db` + the migration in Vitest (import `fake-indexeddb/auto` in test setup) |

Nothing else. The db layer itself is dependency-free (no `idb`, no ORM —
blueprint §5).

## Implementation steps (one commit each)

### Commit 1 — `src/services/db/` + unit tests + docs amendments
- **Create:** `src/services/db/index.js`: `openDb()` (name `mybishbash`,
  version 1; `onupgradeneeded` creates `kv` (key = string key) and `meta`;
  every future version bump documented in a header comment, SQL-migration
  style); `kvGet(key)`, `kvGetAll()`, `kvPut(key, value)`, `kvDelete(key)`,
  `metaGet/metaPut`; `deleteDb()` (tests + reset); a per-key write chain
  guaranteeing put ordering. All values stored as the same JSON **strings**
  localStorage holds today (no re-shaping).
- **Create:** `src/services/db/index.test.js` (fake-indexeddb): CRUD, write
  ordering under interleaved puts, upgrade path, `deleteDb`.
- **Modify:** package.json (+`fake-indexeddb`), vitest setup if a setup file
  is needed for `fake-indexeddb/auto`; blueprint §19 Phase 5 + roadmap-status
  amendments (R1, R3, R4).
- **Unchanged:** zero production consumers — dead until commit 2.
- Commit: `Add services/db IndexedDB wrapper`.

### Commit 2 — Engine seam in storage.js/eventLog.js (kill switch, default legacy)
- **Modify `src/storage.js`:** introduce the engine module-state: read
  `mybishbash.storage-engine.v1` (values `"idb"`/`"localstorage"`, plus an
  in-code default constant `DEFAULT_STORAGE_ENGINE = "localstorage"` this
  commit); implement mirror + `hydrateLocalData()` (no-op resolving
  immediately in legacy mode) + write-through + dual-write per R2; export
  `hydrateLocalData` and `getActiveStorageEngine` (for tests/diagnostics).
  The legacy path must remain byte-equivalent to today's code.
- **`src/eventLog.js`: already done by commit 1.5** — it imports the funnel;
  commit 2 has nothing left to re-point here. Same for
  `stores/settingsStore.js` and `lib/mybishbashSync.js`. Commit 2's remaining
  funnel obligation is `src/App.jsx`'s demo/e2e reset helpers (see §Commit 1.5,
  "Residual direct access").
- **Create:** `src/storage.engine.test.js`: both engines × load/save
  round-trips; dual-write asserts both sinks; legacy-prefix lookup still
  works; `clearSharedMyBishBashState` clears all sinks; open-failure fallback
  (fake-indexeddb forced reject) lands in legacy mode + reports via a stubbed
  `services/errors` reporter.
- **Behaviour:** unchanged (default legacy). Full gate proves it.
- Commit: `Add storage engine seam behind kill switch (default localStorage)`.

### Commit 3 — Boot hydration gate in main.jsx
- **Modify `src/main.jsx`:** after `initDynamicLaunchersFromCache()` and
  before `root.render(...)`: `await hydrateLocalData()` (wrap in the 3s
  timeout + try/catch fallback per R2; on fallback also report). Keep
  everything else in identical order. In legacy mode this awaits a resolved
  promise — behaviourally today's boot.
- **Verify** no pre-hydration reader touches migrated keys (R1 grep — attach
  output to the commit message).
- Commit: `Gate first render on local-data hydration`.

### Commit 4 — Migration + cutover to IndexedDB + WebKit + migration e2e
- **Modify `src/storage.js`:** inside `hydrateLocalData()` (idb mode): open
  db → `metaGet("migratedFromLocalStorage")` → if absent, read every
  `SHARED_STORAGE_KEYS` + device-local storage.js key via the existing
  localStorage getters (legacy-prefix shim included), `kvPut` each present
  key, then `metaPut("migratedFromLocalStorage", { at, appVersion:
  __MYBISHBASH_VERSION__ })` **last** (crash-safe: a partial import without
  the flag re-runs wholesale — idempotent because the source localStorage is
  untouched); then seed the mirror from `kvGetAll()`. Flip
  `DEFAULT_STORAGE_ENGINE` to `"idb"`. localStorage is **never deleted** this
  phase.
- **Create `tests/e2e/storage-migration.spec.ts`:**
  (a) fresh install boots, meta flag set, card create persists across reload;
  (b) upgrade-with-data: seed legacy localStorage state → boot → data
  visible → edit a card → reload → edit survives and localStorage copy also
  carries it (dual-write) → reload again → no re-import clobber;
  (c) kill switch: set `mybishbash.storage-engine.v1=localstorage` → reload →
  app boots from localStorage including the edit from (b) — the scripted
  **rollback round-trip** required by the blueprint;
  (d) fresh-context e2e seeding still works (implicit in (b), assert
  explicitly).
- **Modify:** `playwright.config.ts` (R4 webkit-smoke project + Chromium
  testMatch scoping), `.github/workflows/staging-checks.yml` (install webkit;
  run `storage-migration` + webkit-smoke), enumerate dual-write-dependent e2e
  localStorage assertions (evidence section) in the commit message.
- Commit: `Migrate local data to IndexedDB with dual-write and kill switch`.

### Commit 5 — 10k-event boot perf gate
- **Create `scripts/perf-boot-10k-events.mjs`:** Playwright (Chromium +
  WebKit): seed localStorage with 10,000 synthetic events (reuse the event
  shape from `eventLog.js` tests) → first load (migration) → **second load
  measured**: navigation start → `[data-testid="app-shell"]` visible; assert
  < 1,000ms (< 1,500ms on WebKit CI runners — record both numbers); prints
  timings. Wire as `npm run test:perf-boot` into `test:release` (not the
  per-commit gate — it's slow).
- Commit: `Add 10k-event boot performance gate`.

### Commit 6 — Dual-write retirement (**ships one release after commit 4**)
- Entry condition: ≥1 production/staging release cycle on commits 1–5 with no
  storage-attributed `client_errors` and no tester reports of data loss.
- **Modify `src/storage.js`:** idb engine stops writing localStorage;
  rollback window closes (record the date in roadmap-status).
- **Modify** any dual-write-dependent e2e assertions enumerated in commit 4.
- **Add guardrail** (`scripts/test-release-guardrails.mjs`): assert
  storage.js's idb path contains no `localStorage.setItem` outside the
  legacy-engine branch and the kill-switch/migration code.
- Commit: `Retire storage dual-write`.

## Test strategy

After **every** commit:
```
npm run lint && npm run test:unit && npm run build && npm run test:release-guardrails && npm run test:boundaries && npm run test:bundle-budget && npm run test:coverage:launch-session && npm run test:before-push
```

Playwright (at `--workers=2`):
- Commit 2: `release-smoke`, `offline-fallback` (event queue touched),
  `auth-session-persistence`.
- Commit 3: `launcher-flow-trace`, `launcher-terminal-exhaustive` (boot
  timing is the risk), `release-smoke`.
- Commit 4: **full suite** (both projects — Chromium full + webkit-smoke)
  **twice consecutively**; `storage-migration` in both browsers.
- Commit 5: `npm run test:perf-boot` (record numbers in the commit message).
- Commit 6: full suite (both projects) + the new guardrail.

Unit: `services/db` CRUD/ordering/upgrade; engine seam matrix (legacy, idb,
idb-with-open-failure, dual-write); migration idempotency (run
`hydrateLocalData()` twice; simulate crash-before-flag by aborting between
puts and re-running); `clearSharedMyBishBashState` across engines.

## Acceptance criteria

- [ ] **Local:** full gate green; unit suite covers both engines; migration
      round-trip test (seed → migrate → edit → kill-switch rollback → data
      intact) green — this is the blueprint's "no data loss across the
      migration in a scripted round-trip".
- [ ] **CI:** `staging-checks.yml` green including webkit-smoke;
      `test:release` includes perf gate.
- [ ] **Production build:** `npm run build` + `npm run build:cloudflare`
      green; bundle budget green (db layer is ~150 lines, no new deps in the
      client bundle).
- [ ] **Capacitor:** `npx cap sync` completes; manual smoke on iOS simulator
      per `CAPACITOR_TESTING.md` — install with seeded data, upgrade the web
      assets, confirm cards/events survive (record in the report; this is the
      WKWebView IndexedDB proof).
- [ ] **Chromium + WebKit e2e green** (webkit-smoke scope per R4).
- [ ] **10k-event boot < 1s** (Chromium; WebKit number recorded).
- [ ] **User-visible behaviour unchanged:** full suite unchanged; e2e
      localStorage seeding untouched; fresh install, upgrade-with-data, and
      rollback all verified by e2e (the three blueprint scenarios).
- [ ] Kill switch verified manually on staging preview (set flag → reload →
      legacy boot).
- [ ] Commit 6 lands only after its entry condition; guardrail active after.

## Rollback criteria

Prefer the **kill switch** (no redeploy) for user-facing incidents, then
revert commits newest-first. Revert rather than patch forward when: any data
loss is reproducible in the round-trip test; WebKit boots inconsistently
(hydration timeout firing at any measurable rate in `client_errors`); boot
time regresses >20% on the perf script with normal data; the migration flag
logic misfires (double import observed); or `client_errors` shows
storage-attributed errors from the tester cohort. Because dual-write keeps
localStorage current until commit 6, reverting commits 4–5 restores the
previous engine with zero data loss. After commit 6, rollback requires
re-enabling dual-write first (fix-forward commit) — which is exactly why
commit 6 waits a full release.

## Sonnet execution prompt

```
You are implementing Phase 5 of the myBishBash architecture roadmap on branch
`staging`.

Read completely before touching anything:
1. docs/architecture/phase-05-indexeddb.md (your work order)
2. docs/architecture/phase-04-domain-stores.md (the write-path contract you
   must not break)
3. docs/architecture-blueprint.md §10, §11, §16, §19 Phase 5
4. src/storage.js and src/eventLog.js in full
5. scripts/test-release-guardrails.mjs, playwright.config.ts,
   .github/workflows/staging-checks.yml

Before editing: run the R1 enumeration — grep every localStorage reader/
writer in src/ and classify it migrates-vs-stays per the packet; grep
tests/e2e and e2e/ for localStorage assertions. Attach both lists to your
report. If any pre-hydration reader touches a SHARED_STORAGE_KEYS key, STOP.

Rules:
- Commits 1–5 in order (commit 6 is deferred — do NOT implement it now; it
  ships a release later under its entry condition).
- storage.js keys, payload strings, and exported API are frozen: the engine
  changes, the data does not.
- The legacy engine path stays byte-equivalent to today's code until commit 6.
- Fire-and-forget IDB writes must be per-key ordered; hydration must resolve
  (success, timeout-fallback, or failure-fallback) — the app must never hang
  on boot.
- Only fake-indexeddb (dev) may be added.
- Full gate after every commit; Playwright per the packet; full suite twice
  (both projects) after commit 4; record perf numbers after commit 5.
- Baseline e2e failures per the Phase 3 packet; anything else failing twice
  on one assertion is stop-the-line.
- Update roadmap-status.md (Phase 5 → Complete pending commit 6, with the
  dual-write retirement condition recorded). Push only with all gates green.

Report: commit hashes, the R1 classification lists, migration/round-trip e2e
results, WebKit results, perf numbers (both browsers), Capacitor smoke
outcome, and anything that contradicted this packet.
```
