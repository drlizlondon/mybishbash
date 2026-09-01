# Phase 4 — Domain stores & the single local write path

**Blueprint:** `docs/architecture-blueprint.md` §9, §19 Phase 4
**Status tracker:** `docs/architecture/roadmap-status.md`
**Depends on:** Phase 3 complete (components live in `features/*`; `uiStore`
exists with the overlay descriptor stack; boundary + bundle checks live).
**Executor:** Claude Sonnet, fresh session, branch `staging`.

> Line numbers below were verified at `a02724b` (pre-Phase-3). Phase 3 moves
> code, so **every** location must be re-found by symbol name at execution
> time. Where this packet says "App.jsx:NNNN", treat it as "the site currently
> containing this exact code".

---

## Objective

1. **State homes.** The shared/persistent domain state in `App()` moves into
   four new Zustand stores — `settingsStore`, `packsStore`, `cardsStore`,
   `eventsStore` — using the same-local-name selector/action swap proven in
   Phase 2b and Phase 3 commit 8. Transient UI state (composer, menus, editing
   ids, spotlight, screen/launch flow state) **stays in components/App** per
   the roadmap scope note.
2. **Single local write path.** Every `localStorage` persistence call for
   domain state moves *inside* the store action that mutates that slice; the
   eleven save-`useEffect`s and the debounced cards-save effect in `App()` are
   deleted. `storage.js` remains the storage engine (format unchanged —
   IndexedDB is Phase 5). Lint enforces that features/components never touch
   `localStorage` directly.
3. **Launch-session reducer.** The launch-session transition logic scattered
   across `setLaunchSession` call sites is extracted to
   `src/domain/launcher/launchSession.js` as a pure reducer with **≥95% branch
   coverage**, unit-tested exhaustively. (Plain `.js` — TypeScript is Phase 7;
   this amends the blueprint's `launchSession.ts` naming.)
4. **De-prop-drilling.** Feature screens and overlay components subscribe to
   stores via selectors and call store actions directly; App's render tree
   sheds its prop bundles; `App()` lands **< 800 lines** (⇒ App.jsx < 1,600 —
   see Phase 3 packet Ruling R1).

**Deliberately NOT attempted:**
- No sync-engine changes. The cloud hydration/save effects and their six refs
  (`isApplyingSharedStateRef`, `cloudSaveTimerRef`, `cardSaveTimerRef`*,
  `lastCloudStateStrRef`, `localDirtyRef`, `highestKnownCloudTimeRef`) stay in
  `App()` with identical semantics, now reading store values via selectors
  (Phase 2 Decision 5 still binds). *`cardSaveTimerRef` is deleted with the
  debounced local save it serves (D2) — it is local persistence, not sync.
- No storage-format or key changes; no IndexedDB (Phase 5); no `entities`
  (Phase 6); no undo (Phase 9); no analytics `track()` facade.
- No deletion of memo boundaries. Blueprint says selector subscriptions make
  them removable — removal happens in Phase 9 with its perf tooling; the memo
  guardrail assertions stay untouched this phase.
- No behaviour changes: same values, same persistence data, same event logs.

## Decisions (resolved — do not relitigate)

### D1 — Store field map (state classification)

`App()` holds 42 `useState` (verified). Disposition:

**→ `settingsStore`** (persisted via storage.js unless noted):
`profile`, `setupComplete`, `mood` (no local save call exists today —
grep-verify; if confirmed, the store action does NOT add one),
`homeScreenVersions`, `launcherBehaviorSettings`,
`explicitLauncherBehaviorSettings` (localStorage-loaded; verify its save path
by grep and preserve exactly), `globalInterruptionMode`,
`notificationSettings`, `timingWindowsPrefs`.

**→ `packsStore`:** `cardPacks`, `hiddenLibraryPacks`,
`hiddenPackCardIdsCompat`, `globalPacks` (server-fetched cache; **not
persisted** — in-memory only, exactly as today).

**→ `cardsStore`:** `cards` (+ keep `cardsRef` in App until its consumers are
enumerated; if all consumers can read `getCardsStore().getState().cards`
without changing closure semantics, delete it in the de-prop-drilling stage,
else it stays), `actionCards`.

**→ `eventsStore`:** `events`.

**Stays in App/components (transient UI / launch flow):** `screen`,
`launchSession` (goes through the D3 reducer but remains `useState` in App),
`launcherContext`, `activeProtectedAppContext`, `shouldLaunchOverlay`,
`resumeLaunchNonce`, `launcherDataWaitExpired`, `appPauseRevision`,
`libraryFocusMode`, `shellSettingsVersionId`, `homeSpotlightActionSignal`,
`launcherSetupInterstitialVersion`, `testerReportsRefreshKey`, `isComposerOpen`,
`composerInitialKind`, `composerInitialDraft`, `editingId`,
`homeSaveConfirmation`, `editingPackId`, `editingCustomPackId`,
`isActionCardEditorOpen`, `selectedPackDetail`, `morningSummary`, `menuOpenId`,
`logFilter`. Provider-owned state (`useRoute`, `useOfflineFlag`,
`useNotificationPermission`, `useAppUpdateStatus`, sessionStore fields) is
untouched.

All stores follow the sessionStore pattern exactly: `zustand/vanilla` lazy
singleton, `buildInitial*State()` reproducing today's initializer expressions
verbatim (including the `initialState` useMemo's load order — see D2 note on
boot), every action accepting functional updates, `reset*ForTests()`, unit
tests for initial-state parity and functional updates. Initializers that today
read `initialState` (the App useMemo over `buildInitialState()`/loaders) move
into the store's `buildInitial*State()` calling the same `storage.js` loaders
in the same order; `buildInitialState()`'s cross-slice derivations (cards ×
`hiddenPackCardIdsCompat` dislike mapping, `suppressInitialHomeLaunch`) must
keep their exact sequencing — the packet's store-creation order in commit 1 of
each pair documents it.

### D2 — Persistence semantics: mirror today's timing exactly

Verified current local-persistence writers in `App()`:

| State | Mechanism today | Phase 4 home |
|---|---|---|
| `cards` | debounced effect, **120ms** trailing (`cardSaveTimerRef`, App.jsx:2299–2313) | `cardsStore` internal debounced persist (120ms trailing, timer in store closure), flushed on `clearTimeout`-equivalent at store level; the effect and `cardSaveTimerRef` are deleted |
| `setupComplete`, `profile`, `homeScreenVersions`, `launcherBehaviorSettings`, `cardPacks`, `hiddenPackCardIdsCompat`, `globalInterruptionMode`, `hiddenLibraryPacks`, `events` (`saveEventLog`), `actionCards`, `notificationSettings` | eleven immediate `useEffect(() => saveX(x), [x])` (App.jsx:2661–2752) | synchronous `saveX(next)` inside the store action, after `set()` |
| `saveProfile` (App.jsx:1969), `saveCards` (:4016), `saveSetupComplete` (:5579/:5585), `saveTimingWindowsPrefs` (:5786) — handler-site direct calls | direct calls inside handlers | absorbed: handlers call store actions; the action persists; the direct `saveX` calls are removed **only where the action now provably writes the same value at the same point** — otherwise kept and flagged in the commit message |
| `timingWindowsPrefs` | saved in handler only (no effect); also mirrored into the `utils.js` window-defs singleton (`setWindowDefs`) | store action persists + calls `setWindowDefs` — preserving today's exact call order (grep the handler at :5786 for the sequence) |
| App-pause / launcher caches / event queue | already inside `storage.js` / `eventLog.js` / `lib/*` service modules | unchanged |

Known accepted deltas (record in commit messages, covered by unit tests):
1. Mount-time effect writes disappear (today each save effect re-writes
   just-loaded data once on mount — an idempotent no-op).
2. Multiple actions in one event-loop turn write localStorage once per action
   instead of once per render — same final bytes, idempotent.
3. Cloud-state application (`isApplyingSharedStateRef` path) calls the same
   store actions, so cloud-applied state still mirrors to localStorage as today.

### D3 — Launch-session reducer: reducer + event creators, state stays in App

There are **6 `setLaunchSession` call sites** plus the initializer
(`buildLaunchSessionForRoute`) and helpers already relocated to
`features/launcher/launchSessionStorage.js` in Phase 3. Extraction:

- **Create `src/domain/launcher/launchSession.js`** (first `src/domain/`
  module): move the pure helpers `normalizeLaunchSession`,
  `buildLaunchSession`, `buildLaunchSessionForRoute`,
  `getLaunchSessionForOverlay`, `isFakeLauncherSession` (re-export from
  `features/launcher` for compatibility, or re-point consumers — follow the
  boundary rule: `domain/` imports nothing app-side), and add
  `launchSessionReducer(session, event)` where each event is a named
  discriminated union member derived from one existing call site
  (e.g. `{type:"route-intercept", route}`, `{type:"entry", entrySurface,
  launcherId}`, `{type:"clear"}`, …— enumerate the 6 sites by grep and name
  one event per distinct update expression, reproducing each expression
  verbatim as the case body).
- App's call sites become
  `setLaunchSession((s) => launchSessionReducer(s, EVENT))` with persistence
  (`persistLaunchSession`) kept at exactly the sites that persist today.
- **Coverage gate:** `src/domain/launcher/launchSession.test.js` exercises
  every event × every session shape; `vitest run --coverage` with
  `coverage.include = ["src/domain/launcher/launchSession.js"]` and
  `thresholds: { branches: 95 }` in a dedicated config invoked as
  `npm run test:coverage:launch-session`. Requires dev-dep
  **`@vitest/coverage-v8`** (matching the installed vitest 3 major).

### D4 — De-prop-drilling: features read stores; the `actions` interim object is skipped

Blueprint §19 Phase 3 allowed an interim typed `actions` object; since stores
now exist, features go straight to store subscriptions:

- Each screen gets a thin container in its feature (e.g.
  `features/settings/SettingsScreen.jsx`) that reads store selectors + calls
  store actions, and passes to the existing presentational component the same
  prop names it has today. **The presentational components' bodies do not
  change**; only App's JSX shrinks (it renders `<SettingsScreen …/>` passing
  only App-owned launch-flow/transient props).
- Overlay components that receive pure store mutations (`onPackLike`,
  `onPackContinue` internals, event logging) keep their props where the
  callback closes over App-owned launch-flow state; **only callbacks whose
  bodies touch nothing but store state/actions move into the feature**.
  When in doubt, the callback stays in App — App() < 800 has slack for a
  handler core.
- Handler groups that move behind feature hooks (created in the owning
  feature, called from App or from the screen container): morning-summary
  (`setMorningSummary` + modal wiring), library/composer open-close wiring,
  notification-settings handlers, pack activate/hide/dislike handlers.
  The launcher engine (`beginInterceptionFlow`, `openDestinationApp`,
  `handleFakeLauncherLaunch`, `handleRevealCompletion`,
  `scheduleNativeSchemeFallback`, routing/decision effects) **stays in
  `App()`** this phase — it is entangled with route/overlay/launch state and
  is guardrail-pinned to `appSource`; it is the residual core that fits in
  <800 lines. If it does not fit, STOP and report the measured shape rather
  than moving sync- or launch-critical code to make a number.

### D5 — Write-path lint rule (exit criterion "lint-enforced")

Add to `eslint.config.js` a scoped block for
`src/features/**`, `src/components/**`, `src/editing/**` — and after the App
shrink also `src/App.jsx`:

```js
"no-restricted-syntax": ["error",
  { selector: "CallExpression[callee.object.name='localStorage'][callee.property.name=/^(setItem|removeItem|clear)$/]",
    message: "Persist via store actions (storage.js/services) — Phase 4 write path." },
  { selector: "CallExpression[callee.object.property.name='localStorage'][callee.property.name=/^(setItem|removeItem|clear)$/]",
    message: "Persist via store actions (storage.js/services) — Phase 4 write path." },
]
```

Reads (`getItem`) stay legal (flags). Allowed writers remain: `src/storage.js`,
`src/eventLog.js`, `src/stores/**`, `src/services/**`, `src/app/**` (e2e/demo
flags, environment), `src/lib/**` (sync/caches), `src/appUpdate.js`,
`src/morningSummary.js`, `src/features/launcher/launchSessionStorage.js`
(launch-session + protected-app-context persistence — it is storage-layer code
that happens to live in the feature; add an explicit eslint `files` override
for it, with a comment marking it for `services/` relocation in Phase 5).
Before enabling, grep `src/features` for existing writes and relocate any
found into actions (expected: none after the persistence commits; STOP if a
write has no obvious owning action).

## Phase 3 actuals (verified 2026-07-19 at HEAD `e4d3356` — read before the evidence below)

- Phase 3 closed at `d4dfeca` + fix-forward `e4d3356`. App.jsx is **6,531
  lines** (31 over the R1 target, accepted: every remaining module-scope
  helper was grep-verified App()-only; the residue collapses under this
  phase's < 1,600 target). Nothing below `export default App;`; only memo
  wrappers, `lazy()` calls, `TESTPILOT_CONFIG`, and App-only helpers remain
  outside `App()`.
- **Relocations that supersede this packet's original paths:** commitment/
  theme helpers (`isCommitmentCard`, `getCommitmentStartWindow`,
  `getCommitmentTimingOptionId`, `getCommitmentTimingConfig`,
  `COMMITMENT_TIMING_OPTIONS`, `resolveTheme`, `isCardDoneToday`) →
  `src/utils.js`; `isDemoModeEnabled` → `src/app/e2e.js`; overlay builders →
  `features/launcher/overlayBuilders.js`; launch-session + protected-app
  persistence → `features/launcher/launchSessionStorage.js`; `CardIcon`,
  `AppPauseModal` → `src/components/`; `getBrowserSafeDestinationHref`,
  `isStandaloneDisplayMode` → `src/lib/launcherSetupUrl.js`.
- **The guardrail family is SIX scripts, not one.** Source-shape assertions
  reading files by literal path live in: `test-release-guardrails.mjs`,
  `test-launcher-flow.mjs`, `test-fake-launcher-destinations.mjs`,
  `test-hq-launcher-admin.mjs`, `test-testpilot.mjs`,
  `test-access-capabilities.mjs`. R7 (Phase 3 packet) applies to ALL of them.
  Phase 3's lesson: three of these sit outside `test:before-push` and were
  silently broken for seven commits until the full `npm run test` chain ran
  (`e4d3356`). Consequence for this phase: **the per-commit gate is the full
  `npm run test` chain**, which now includes lint, unit, boundaries, build,
  bundle budget, and all six guardrail scripts — plus `npm run
  test:before-push`.
- `stores/uiStore.js` exists (descriptor stack, single-slot semantics, 59
  `setOverlay` sites untouched). `stores/sessionStore.js` is the pattern
  reference. Boundary + bundle checks are live and green at HEAD.

## Current-state evidence

(Verified at `a02724b`; re-verify positions post-Phase-3.)
- 42 `useState` in `App()`; the eleven immediate save effects at
  App.jsx:2661–2752; debounced cards save at :2299–2313 (120ms); handler-site
  saves at :1969, :4016, :5579, :5585, :5786. `saveMood` exists in storage.js
  but has no App call site.
- The derived-sync effect `setExplicitLauncherBehaviorSettings(...)` keyed on
  `[launcherBehaviorSettings]` (App.jsx:2683) — stays an effect in App until
  both slices live in `settingsStore`, then becomes part of the
  `setLauncherBehaviorSettings` action **only if** the merge is verbatim-
  preservable; otherwise it remains an App effect reading selectors (allowed).
- Cloud bridge: hydration effect (~:2200–2295) applies shared state inside
  `isApplyingSharedStateRef` guard via the same setters (post-swap: actions);
  cloud-save effect (~:2568) watches the shared-state variables and
  `syncStatus === "ready"`. Its dependency array must keep the same variable
  names — the selector swap guarantees that.
- `buildSharedState`/`normalizeSharedState`/`mergeEntitiesById`
  (App.jsx:1003–1065) stay in App.jsx (Phase 6 retires them).
- Guardrails pinned to `appSource` that Stage D must respect (labels):
  `App filters launch selection to non-commitment cards`, `App uses Personal
  Card launch pool for launcher/home decisions`, `in-app fake launcher clicks
  open real destinations directly`, `openDestinationApp is the single
  destination href assignment`, the `onPackContinue`/`onPackLike`
  `sourceBetween` slices, `continue-to-app … openDestinationApp` JSX arrow,
  `update banner is suppressed while overlays are active`, memo-boundary
  pair. If a de-prop-drilling move would relocate one of these subjects,
  either keep the subject in App (preferred) or re-point per Phase 3 R7.
- Unit/e2e harness: Phase 0–3 gates plus `test:boundaries`,
  `test:bundle-budget`. Baseline e2e failures as listed in the Phase 3 packet.

## Packages to add

| Package | Version | Why |
|---|---|---|
| `@vitest/coverage-v8` | match installed vitest 3 major | branch-coverage gate for the launch-session reducer |

Nothing else.

## Implementation steps (one commit each)

Store order: **settings → packs → cards → events** (blueprint: most stateful
last). Each store lands as a pair: (a) state-home swap, (b) persistence move.

1. **`settingsStore` swap** — create `src/stores/settingsStore.js` + tests;
   replace the nine D1 settings `useState`s with same-name selectors +
   `getSettingsActions()`; save effects untouched (they now read selector
   values — still fire on change). `git diff --stat`: App.jsx + new files only.
   Commit: `Move settings state into settingsStore`.
2. **settings persistence into actions** — move the seven settings-slice save
   effects + `saveTimingWindowsPrefs`/`saveSetupComplete`/`saveProfile`
   handler calls into actions per D2; delete the effects; unit-test that each
   action writes through (localStorage stub asserting key + payload).
   Commit: `Persist settings inside settingsStore actions`.
3. **`packsStore` swap** — `cardPacks`, `hiddenLibraryPacks`,
   `hiddenPackCardIdsCompat`, `globalPacks`.
   Commit: `Move pack state into packsStore`.
4. **packs persistence into actions** (three persisted slices; `globalPacks`
   none). Commit: `Persist packs inside packsStore actions`.
5. **`cardsStore` swap** — `cards`, `actionCards` (+ `cardsRef` audit per D1).
   Commit: `Move cards state into cardsStore`.
6. **cards persistence into actions** — 120ms trailing debounce inside the
   store (D2), delete the effect + `cardSaveTimerRef`; absorb :4016;
   `actionCards` immediate save. Unit-test debounce with fake timers
   (rapid `setCards` ×3 ⇒ one write of last value after 120ms).
   Commit: `Persist cards inside cardsStore actions`.
7. **`eventsStore` swap + persistence** — `events` + `saveEventLog` in the
   action (immediate, as today). The offline queue and
   `persistEventRecord`/`processEventQueue` in `eventLog.js` are untouched.
   Commit: `Move event log state into eventsStore`.
8. **Launch-session reducer** (D3) + coverage tooling
   (`@vitest/coverage-v8`, `test:coverage:launch-session` wired into the
   `test` chain, `test:before-push`, and `staging-checks.yml`).
   Commit: `Extract launch-session reducer with coverage gate`.
9. **De-prop-drill settings + apps + access screens** (D4 containers/hooks).
   Commit: `Settings/apps/access screens subscribe to stores`.
10. **De-prop-drill library + composer + explore.**
    Commit: `Library/composer/explore subscribe to stores`.
11. **De-prop-drill home + log.**
    Commit: `Home/log subscribe to stores`.
12. **De-prop-drill overlay/launcher-adjacent callbacks** per D4's strict rule
    (store-only callbacks move; launch-flow callbacks stay).
    Commit: `Overlay store callbacks move into features/launcher`.
13. **Write-path lint rule (D5) + App() measurement + docs** — enable the
    rule; count `App()` lines (must be < 800; report exact); roadmap-status
    Phase 4 → Complete + blueprint §9 note that `uiStore`'s stack is live.
    Commit: `Enforce single local write path; close Phase 4`.

## Test strategy

After **every** commit (amended per Phase 3 actuals — the full chain, not a
subset; three guardrail scripts live only in `npm run test`):
```
npm run test && npm run test:before-push
```
From commit 8 also: `npm run test:coverage:launch-session` (fails < 95% branches).

Playwright (at `--workers=2`):
- Commits 1–2: `settings-account-polish`, `timing-windows`, `onboarding`,
  `release-smoke`.
- Commits 3–4: `explore`, `library-bottom-nav`, `access-gating`.
- Commits 5–6: **full suite** (cards feed everything), plus
  `commitment-cards`, `card-layout-stability` re-run on any flake.
- Commit 7: `launcher-flow-trace`, `offline-fallback` (event queue), `explore`.
- Commit 8: `launcher-flow-trace`, `launcher-terminal-exhaustive`,
  `launcher-shell-repeat`, `pause-launcher`.
- Commits 9–12: the owning feature's specs + `release-smoke`; commit 12 full
  suite.
- Commit 13: **full suite twice consecutively** (exit criterion).

Unit additions: per-store tests (initial-state parity incl. e2e variants,
functional updates, write-through persistence with stubbed localStorage,
cards debounce), reducer test matrix (D3), a regression test that
`buildInitialState` ordering still produces the dislike-mapped cards.

## Acceptance criteria

- [ ] **Local:** full gate green; the **amended R2 size criteria** below are met
      (report the measured numbers); zero `useState` in App for D1-moved fields; the eleven
      save effects and `cardSaveTimerRef` gone; `npm run lint` fails on a
      deliberate trial `localStorage.setItem` in a feature file (verify once,
      then revert the trial).
- [ ] **CI:** `staging-checks.yml` green including the coverage gate.
- [ ] **Production build:** `npm run build` + `npm run build:cloudflare` +
      bundle budget green (stores add ≪ budget headroom).
- [ ] **Capacitor:** `npx cap sync` completes; no plugin/config changes.
- [ ] **Behaviour unchanged:** full e2e **twice consecutively** green (minus
      documented baseline); localStorage bytes after a scripted
      create-card/edit-settings/log-event session are identical pre/post
      phase (write a throwaway comparison script during commit 13
      verification, include output in the report); launch-timing e2e
      spot-check (`window.__MYBISHBASH_LAUNCH_TIMINGS`) unchanged in shape.
- [ ] Launch-session reducer ≥95% branch coverage, enforced in CI.
- [ ] Cloud sync untouched: the six sync refs minus `cardSaveTimerRef` remain
      in App; `mergeEntitiesById`/`normalizeSharedState` untouched;
      two-login smoke on staging preview shows profile round-trip.

## CORRECTION — Phase 4 was closed prematurely (2026-07-26, same day)

**The closure below (commit `b732e8c`) was premature and is corrected here rather
than rewritten.** It stands as written; this section supersedes it on one point.

**What was wrong.** Phase 4's **D5 write-path lint rule was never implemented.**
`eslint.config.js` contains no `no-restricted-syntax` block, and no Phase 4
commit ever touched that file (`git log 4c42858..b732e8c -- eslint.config.js` is
empty). The planned commit 13, `Enforce single local write path; close Phase 4`,
does not exist in history. Closing commit `b732e8c` is **docs-only** — 132 lines
across two documents, zero source files.

**What this means for the phase's stated objective.** Objective 2 of this packet
is "Single local write path… Lint enforces that features/components never touch
`localStorage` directly." **The first half landed; the second did not.** Every
domain-state persistence call did move inside store actions (commits 2, 4, 6) —
that work is real and stands. But the enforcement is currently *textual*: a
document saying features must not write to `localStorage`, with no mechanism
stopping them. That is precisely the failure shape the planning doctrine names
in §1.5 — a constraint a model can satisfy while defeating its purpose.

**Root cause of the error.** Commit 13 was treated as *wholly* superseded by the
closure when only its **byte-comparison portion** had been replaced. Commit 13
carried two deliverables — the localStorage byte-comparison verification and the
D5 lint rule — and the closure reasoning was conducted entirely in terms of the
R2 line-count argument. The second deliverable was dropped without ever being
considered. Recorded here because the mistake is instructive: a superseded commit
must be enumerated deliverable-by-deliverable, not dismissed as a unit.

**Status of criterion 6** (`npm run lint` fails on a deliberate trial
`localStorage.setItem` in a feature file): **REOPENED, not waived.** This is
deliberately different from R2 criterion 1, which was waived on measured
evidence that its target was unreachable. Criterion 6 is reachable; it simply was
not done.

> **RESOLVED 2026-07-26 — criterion 6 is now MET.** The D5 ratchet landed in
> `eslint.config.js` as a `no-restricted-syntax` block scoped to
> `src/features/**`, `src/components/**`, `src/editing/**` and `src/App.jsx`.
> Details and the debt inventory are in §"D5 ratchet — delivered" below.

### D5 ratchet — delivered (2026-07-26)

**Shape.** Two esquery selectors match `localStorage.{setItem,removeItem,clear}`
in both the bare and `window.`-qualified forms, applied to every scoped file with
no exceptions. Per-file exception blocks then re-declare the same rule with
`:not(...)` fragments keyed to **one exact file and one exact storage key**.
There are no directory-wide, wildcard or whole-file exemptions.

**Consequences of that shape**, all demonstrated:
- a new write in any scoped file fails, *including inside an excepted file*;
- copying an existing write to another file fails — the exception does not travel;
- deleting an exception while its legacy write remains fails, proving every
  exception is load-bearing rather than blanket cover;
- retiring a debt item is a **one-line deletion** from the `D5_EXCEPTIONS` table.

**Known limit** (finest granularity ESLint selectors permit): duplicating an
already-excepted key *within its own file* is not caught. Cross-file copying,
which is the propagation risk that matters, is.

**Scope note.** `src/App.jsx` was brought into scope now rather than "after the
App shrink" as D5 originally staged it. Deferring it would have left the largest
file in the repo as an uncovered copy target, defeating the ratchet's purpose.
This is strictly stricter than D5 as written; its 13 sites are enumerated below.

**Debt inventory — 26 sites, none relocated by this commit.**

| File | Key | Sites | Class |
|---|---|---|---|
| `features/launcher/launchSessionStorage.js` | `LAUNCH_SESSION_STORAGE_KEY` | 1 | AUTHORISED |
| `features/launcher/commitmentDebug.js` | `"mybishbash.commitmentDebug.v1"` | 1 | DIAGNOSTIC |
| `features/launcher/launchDebug.js` | `"bishbash.launchDebug.v1"` | 1 | DIAGNOSTIC |
| `features/hq/HQPanel.jsx` | `HQ_VIEW_STORAGE_KEY` | 1 | ADMIN |
| `features/explore/ExplorePanel.jsx` | `PREMIUM_INTEREST_KEY` | 1 | **DOMAIN-DEBT** |
| `features/marketing/EarlyAccessPage.jsx` | `WAITLIST_SOURCE_STORAGE_KEY` | 1 | MARKETING |
| `features/onboarding/Onboarding.jsx` | `PROTECTED_APP_SETUP_PENDING_KEY` | 2 | **DOMAIN-DEBT** |
| `editing/ContentEditContext.jsx` | `storageKey`, `"mybishbash.editPanelPosition.v1"` | 5 | UI-DRAFT |
| `App.jsx` | `SIGNUP_ONBOARDING_PENDING_KEY` | 2 | **DOMAIN-DEBT** |
| `App.jsx` | `key` (demo-reset purge loops) | 2 | TEST-FLAG |
| `App.jsx` | `MYBISHBASH_DEMO_MODE` / `_E2E_MODE` / `_E2E_TESTER_MODE` | 8 | TEST-FLAG |
| `App.jsx` | `"mybishbash.setup-complete.v1"`, `"mybishbash.profile.v1"` | 2 | TEST-FLAG |
| `App.jsx` | `"mybishbash.pending-launcher-install.v1"` | 1 | **DOMAIN-DEBT** |

Only the four **DOMAIN-DEBT** rows are genuine unmet obligations of D5's "single
local write path"; they are owed store actions or a persistence adapter and are
the scope of a future migration packet. DIAGNOSTIC, UI-DRAFT, ADMIN, MARKETING
and TEST-FLAG rows are not domain state and may reasonably remain, but stay
enumerated so they cannot spread.

**Operational status.** Phase 4 **remains closed for the completed store
migrations** — `settingsStore`, `packsStore`, `cardsStore`, `eventsStore`, the
launch-session reducer and its coverage gate, and the de-prop-drilling commits
are all complete, verified, and are not reopened. **The enforcement follow-up
must land before Phase 4b implementation resumes.** It is scoped as a narrow
ratchet (block new violations, enumerate existing ones as classified debt) —
see the D5 ratchet commit. Relocating existing violations is explicitly NOT part
of that commit and belongs to its own packet.

**Discovered by** the Phase 4b executor, which stopped before writing any code
because the packet's mechanical-guardrails section asserts the D5 rule "already
applies" to the new hooks. It does not, and 4b exit criterion 6 was therefore
unsatisfiable as written.

## Phase 4 closure — COMPLETE with criterion 1 waived (2026-07-26)

> **Superseded in part — read the CORRECTION section above first.** This section
> understated one item: criterion 6 (D5 write-path lint enforcement) was not met
> at the time of writing and was reopened, not waived. It was subsequently
> **delivered by the D5 ratchet commit and now reads met** — see
> §"D5 ratchet — delivered" above.

**Closing commits:** `85f5286` (launcher hardening), `a4357f7` (Home/log
containers), `382379d` (Overlay store callbacks). Working tree clean.

**Final test state:** full Playwright suite **358 passed, 1 failed** — the sole
failure is `access-gating.spec.ts:88`, the documented Phase 2b baseline, which
predates Phase 4 and is unrelated to it. `npm run test` and
`npm run test:before-push` green. Launcher/interception specs 187 passed;
`launch-decision-loop` + `launcher-shell-repeat` 15 passed (independently
re-verified after closure).

### R2 criterion 1 — WAIVED, not met

Measured `App()` = **5,404 lines** against a target of 2,600. The waiver is
recorded rather than the target quietly restated, because **the 2,600 figure was
not derived from a complete section-by-section measurement.** It was set from
the launcher-engine and launch-decision-effect measurements alone, without
measuring the card/commitment handler cluster (690 lines), the JSX return
block (563), or the onboarding/setup handlers (262). It repeated, one level
down, the same error as the original `< 800`: a line target inferred rather
than counted.

**The structural finding that matters more than the number:** de-prop-drilling
is not a size lever. The four de-prop-drilling commits (9–12) moved a net **67
lines** out of `App()`. Feature containers remove *props*, and props were never
the mass. The mass is handler bodies, the render tree, and the launcher engine.
Any future size target for `App()` must be derived by subtracting *named,
measured sections* that a specific packet actually moves — never estimated.

**This waiver does not make the remaining structural work optional.** Phases 4b
and 4c below carry it, and the Phase 5 constraint in the next section is a hard
blocker, not a preference.

### R2 criteria 2–5 — MET, with evidence

2. **No avoidable domain-state ownership in `App`** — ✅ 24 `useState` remain and
   every one is on D1's explicit "stays in App/components" list (`screen`,
   `launchSession`, `launcherContext`, composer/editing/menu ids, `logFilter`,
   `morningSummary`, `shouldLaunchOverlay`, `resumeLaunchNonce`, …). Zero
   D1-classified domain fields remain in `App`. `cardsRef` is gone as a
   launch-decision consumer.
3. **No new prop-drilling paths** — ✅ `HomeScreen`, `LogScreen` and
   `OverlayScreen` subscribe to stores directly. Both commits removed props from
   App's JSX and added none; no prop was traded for another.
4. **Launcher-critical behaviour in place** — ✅ engine untouched; no
   guardrail-pinned subject moved in commit 12. Two re-points, both documented
   and same-strength or stronger (see below).
5. **Remaining launcher engine measured and documented** — ✅ the measured
   breakdown is in Phase 4c below.

### Launcher hardening proof (`85f5286`)

The dependency defect was **masked, not fixed**, by `9b3440d`'s
`standaloneRecoveryInFlightRef` idempotence guard. A regression test that merely
passed against staging would therefore have proved nothing. Sensitivity was
established by a three-state matrix:

| State | Result |
|---|---|
| Unmodified staging (guard present, `events` dep present) | 2 passed — proves nothing |
| **Guard removed**, `events` dep still present | **2 failed** — app never settles on a card; stuck navigating to `/intercept/safari` |
| **Guard still removed**, dependency fix applied | **2 passed** |

Row 3 is load-bearing: the non-reactive read is **independently sufficient**, so
the fix addresses the root cause rather than adding a second belt. Both
mechanisms are retained. Regression test: `tests/e2e/launch-decision-loop.spec.ts`.

**Guardrail re-point (Phase 3 R7):** the pre-existing assertion's regex ended in
the literal `events,`, which the replacement expression
`getEventsStore().getState().events,` *contains* — it would have continued
passing while asserting nothing. Re-pointed explicitly and **strengthened** with
`assertNoMatch("home launch decision does not depend reactively on the event
log")`. A second re-point in `a4357f7` moved the "Log weekly shift count is
memoized" assertion from `appSource` to `logScreenSource`, same regex.

*Note: no dedicated morning-summary e2e spec exists (grep-verified); the morning
summary is exercised inside seven other specs, all of which were run.*

## Sequencing constraint — Phase 5 is BLOCKED until 4b lands

**Phase 5 (IndexedDB) must not begin while `handleSaveCard` and the commitment
persistence handlers remain inside `App()`.** This is a hard blocker.

Phase 5 converts the storage engine beneath `storage.js` to IndexedDB, making
every persistence call asynchronous. `handleSaveCard` (211 lines) and the four
commitment handlers (334 lines combined) are the densest cluster of synchronous
save calls in the codebase. Converting them to async *while they sit inside a
5,404-line component* combines two independently risky changes in one diff:
**persistence risk** (a dropped `await`, a lost write, a reordered save) and
**structural risk** (moving code whose closure dependencies are implicit across
thousands of lines). Each is hard to review alone; together they are effectively
unreviewable, and a dropped `await` inside a 5,404-line component is invisible
to review and silent at runtime until a user loses a card.

Sequence: extract to hooks with unit tests (4b) → *then* make the hooks async
(Phase 5). This orders the work by irreversibility: the structural move is cheap
and reversible today, and becomes brutal once async persistence is layered on
top of it.

## Ruling R2 — the `App() < 800` exit criterion is replaced (2026-07-26)

**Superseded:** `App() < 800 lines` / `App.jsx < 1,600`. Those numbers were
written pre-Phase-3 and do not survive measurement. Measured at Phase 4
commit 8: `App()` = **5,471 lines**, and D4's *must-stay* residue alone —
launcher engine (583: `selectLauncherActivationCard` 187, `openDestinationApp`
119, `handleRevealCompletion` 120, `renderInterceptionDecision` 72,
`handleFakeLauncherLaunch` 36, `scheduleNativeSchemeFallback` 27,
`beginInterceptionFlow` 22) plus the launch-decision effect (379) — is **962
lines, already over the old target** before the sync bridge (~180), the auth
gate ladder (~93), or the main JSX return (597). The target was always a proxy
for "the launcher engine does not live in `App()`"; the engine's extraction is
a phase, not a bullet point.

**Phase 4 now exits on all five of:**

1. `App()` **< 2,600 lines** (report the measured count).
2. **No avoidable domain-state ownership remains in `App`** — every D1-classified
   field lives in its store; anything still owned by `App` is named, with the
   reason it cannot move yet.
3. **No new prop-drilling paths are introduced** — feature containers read stores
   directly; a de-prop-drilling commit must not trade one drilled prop for another.
4. **Launcher-critical behaviour remains in place** unless moved under a
   separately approved extraction plan.
5. **The remaining launcher engine is measured and documented** as explicit
   follow-on work (per-section line counts + responsibility), feeding the
   launcher-engine extraction phase.

**Standing prohibition:** do not move launcher-critical code merely to satisfy a
line target. If a number can only be reached by relocating the engine, the
sync bridge, or guardrail-pinned subjects, report the measured shape instead —
that is the packet's own rollback instruction, not a failure of the executor.

## Rollback criteria

Revert newest-first. Triggers: any non-baseline e2e failing twice on one
assertion; any evidence of lost or doubled localStorage writes (the
comparison script diff is non-empty); cloud-save regression on staging
(`client_errors` spike, or the cloud-save effect firing with stale values —
watch for it specifically after commits 5–6); reducer coverage gate failing
after a legitimate change (means the reducer missed a transition — STOP,
don't lower the threshold); `App()` cannot reach the Ruling R2 target without
moving launch-critical code (report instead of forcing). Store state is in-memory;
persistence format is unchanged throughout — rollback at any commit is purely
git with no data migration.

## Sonnet execution prompt

```
You are implementing Phase 4 of the myBishBash architecture roadmap on branch
`staging`.

Read completely before touching anything:
1. docs/architecture/phase-04-domain-stores.md (your work order — including
   the "Phase 3 actuals" section, which supersedes stale paths below it)
2. docs/architecture/phase-02b-session-store.md (the swap pattern: lazy
   singleton, functional updates, same-local-name selector binding)
3. docs/architecture/phase-03-feature-modules.md (feature layout, guardrail
   re-point policy R7, boundary rules)
4. docs/architecture-blueprint.md §9–§11, §19 Phase 4
5. ALL SIX guardrail-family scripts (enumerated in "Phase 3 actuals") and
   eslint.config.js

The packet's line numbers predate Phase 3 (App.jsx is now 6,531 lines).
Re-locate every symbol BY NAME (grep) and re-verify: the 42 App() useState
fields against the D1 map, all local-persistence writers against the D2
table, and the 6 setLaunchSession sites. On any mismatch, STOP and report
before editing.

Rules:
- Thirteen commits in packet order; after each: `npm run test && npm run
  test:before-push` (the FULL chain — a subset gate missed broken scripts in
  Phase 3); Playwright per the packet's list at --workers=2; full suite twice
  after commit 13.
- State swaps change ONLY the declaration lines: same local names, functional
  updates supported, dependency arrays byte-identical.
- Persistence moves must reproduce today's timing (immediate vs 120ms
  debounce) and today's payloads exactly; document the three accepted deltas
  from D2 in commit messages.
- The cloud sync bridge (hydration/save effects, remaining sync refs,
  buildSharedState/normalizeSharedState/mergeEntitiesById) must not change.
- De-prop-drilling: presentational component bodies unchanged; callbacks that
  close over launch-flow state stay in App(); guardrail-pinned subjects stay
  in App() or are re-pointed per Phase 3 R7 (enumerated, never weakened).
- domain/ imports nothing from app/features/stores/services.
- Only @vitest/coverage-v8 may be added.
- Baseline e2e failures per the Phase 3 packet; anything else twice on one
  assertion is stop-the-line.
- Update roadmap-status.md in commit 13. Push only with all gates green.

Report: commit hashes, App() and App.jsx line counts, the D1 disposition as
actually applied (any field that ended up elsewhere and why), the
localStorage byte-comparison output, coverage percentage, guardrail re-point
list, and anything that contradicted this packet.
```
