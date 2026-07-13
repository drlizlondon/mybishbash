# Phase 3 — Feature module extraction (components out of App.jsx)

**Blueprint:** `docs/architecture-blueprint.md` §7, §8, §19 Phase 3
**Status tracker:** `docs/architecture/roadmap-status.md`
**Depends on:** Phases 0–2 complete (Phase 2 closed by `phase-02b-session-store.md`, final commit `a02724b`).
**Executor:** Claude Sonnet, fresh session, branch `staging`.

---

## Objective

Relocate every React component that does not have to live in `App.jsx` into
`src/features/*` modules with `index.js` public APIs, following the verbatim-move
pattern proven in Phase 2. Concretely:

1. All ~75 components below `App()` (App.jsx lines ~7090–13206, ~6,100 lines)
   move to their feature directories.
2. Feature-owned module-scope helpers above `App()` (overlay builders,
   launch-session persistence helpers, home-state builders, …) move with their
   consumers.
3. Already-standalone screen files (`ExplorePanel.jsx`, `Onboarding.jsx`,
   `HQPanel.jsx`, marketing pages) relocate into `features/*`.
4. The overlay dispatch component (`Overlay`) becomes
   `features/launcher/OverlayHost.jsx`, and the overlay descriptor moves into a
   new `stores/uiStore.js` as a **descriptor stack with single-slot semantics
   preserved** (§ Ruling R2 below).
5. A feature-boundary check and a bundle-size budget enter the guardrail family.

**Deliberately NOT attempted:**

- No state moves beyond the single overlay slot (R2). `cards`, `events`,
  `launchSession`, all save effects, the sync bridge, and every handler in
  `App()` stay exactly where they are — that is Phase 4.
- No new lazy boundaries (Ruling R4). Existing lazy imports (HQPanel, marketing
  pages, LogPanel/recharts split) are preserved, nothing else becomes lazy.
- No prop-bundle removal. Components keep receiving the same props from App's
  render tree; only their *definitions* move. De-prop-drilling is Phase 4.
- No renames of components, props, CSS classes, or test ids. No logic edits,
  even obvious ones. No TypeScript (Phase 7), no CSS work (Phase 8).
- No internal decomposition of HQPanel beyond relocation (Ruling R5).

## Rulings (resolved — do not relitigate)

### R1 — App.jsx line-count exit criterion is amended: ≤ 6,500, not < 3,000

Measured at `a02724b`: App.jsx is **13,206 lines**; `App()` itself spans lines
1572–7089 (**~5,520 lines**) and does not shrink in a pure component-move phase
— the blueprint assigns `App()`'s collapse (to < 800 lines) to Phase 4.
Arithmetic: 13,206 − 6,116 (components below `App()`) − ~600–900 (movable
module-scope helpers) ≈ **6,200–6,500 lines**, of which ~5,500 are `App()`.
The original "< 3,000" was written against the blueprint's estimate that more
of `App()` would move here; it is unreachable without pulling Phase 4's
state/handler work into this phase, which would mix move-risk with
behaviour-risk. Amended criteria:

- **Phase 3 exit:** App.jsx ≤ 6,500 lines; nothing below `export default App;`
  except that line; no component definitions outside `App()` remain in the file
  (memo wrappers, lazy() calls, `TESTPILOT_CONFIG`, and App-only helpers may stay).
- **Phase 4 exit (consequential):** `App()` < 800 lines ⇒ App.jsx < 1,600
  lines, which lands strictly below the original 3,000 one phase later.

Update `docs/architecture/roadmap-status.md` and blueprint §19 Phase 3
acceptance with this amendment in commit 1 (same-commit rule for status changes).

### R2 — Overlay descriptor stack: data shape changes, semantics do not

Today: `const [overlay, setOverlay] = useState(() => initialRoute.kind ===
"intercept" ? buildFakeLauncherPreparingOverlay(initialRoute.versionId) : null)`
(App.jsx:1655), **59 `setOverlay` call sites** (3 functional-update form), one
polymorphic descriptor object with ~20 `type` values, one dispatch component
(`Overlay`, App.jsx:11222) mounted once as `<MemoOverlay …/>` (App.jsx:6918).

Phase 3 target:

- `stores/uiStore.js` (lazy singleton, same pattern as `sessionStore`):
  state `{ overlayStack: OverlayDescriptor[] }`; actions `setOverlay(next)`
  (compat: accepts value **or updater function**, maps to
  `overlayStack: v ? [v] : []`, updater receives `stack[stack.length-1] ?? null`),
  plus `pushOverlay`/`popOverlay`/`clearOverlays` (exported, **unused this
  phase** — the stack shape is architecture for Phase 4+, not new behaviour).
- Selector `selectTopOverlay = (s) => s.overlayStack[s.overlayStack.length - 1] ?? null`.
- App swap (Phase 2b commit-2 pattern): `const overlay = useUiStore(selectTopOverlay);`
  `const { setOverlay } = getUiActions();` — same local names ⇒ **all 59 call
  sites and every dependency array untouched**.
- Store creation is parameterised: `getUiStore(initialOverlay)` creates on
  first call from App's render with the route-derived initial descriptor, so the
  intercept boot chain (Phase 2 invariant 3) stays synchronous and unchanged.
- Depth is never > 1 in this phase. Do not migrate any call site to push/pop.

Rejected: moving `overlay` into App-local state wrapped by a context (adds a
provider re-render surface); introducing a real stack now (59 call sites would
need semantic review each — Phase 4 work).

### R3 — Feature-boundary enforcement is a guardrail script, not an ESLint plugin

The exit criterion says "lint rule". Phase 0's lint policy is
correctness-rules-only with no new plugins, and this repo's enforcement culture
is deterministic scripts (`scripts/test-release-guardrails.mjs`). Add
`scripts/check-feature-boundaries.mjs`:

- Parses every `import` in `src/**/*.{js,jsx}` (regex over source, same style
  as the guardrail script; no AST dep).
- **Fails** when a file under `src/features/<a>/` imports from
  `src/features/<b>/…` (a ≠ b) via any path other than
  `src/features/<b>/index.js` (i.e. the import specifier must end at the
  feature root).
- **Fails** when anything under `src/stores/`, `src/lib/`, `src/services/`,
  or `src/domain/` imports from `src/features/` or `src/App.jsx` (downward-only
  arrows, blueprint §5).
- Wired as `npm run test:boundaries`, appended to the `test` chain in
  package.json, to `scripts/test-before-push.mjs`, and to
  `.github/workflows/staging-checks.yml` (after `npm run lint`).

Migrating to `eslint-plugin-boundaries` is a Phase 7 option; record there, not here.

### R4 — No new lazy boundaries in this phase

Blueprint §19 Phase 3 mentions "lazy boundaries added per feature". Making
Home/Library/Apps/Overlay lazy changes first-render timing inside the intercept
boot chain — a behaviour change this phase forbids. Existing lazy islands
(HQPanel at App.jsx:195, marketing pages in `RootRouter`) are preserved
verbatim. Per-feature code splitting is deliberately deferred to Phase 9
(performance harvest), where it gets budgets and per-list e2e. The bundle
budget (R6) makes this checkable.

### R5 — HQPanel: relocate now, split later

`src/HQPanel.jsx` (3,292 lines) moves to `src/features/hq/HQPanel.jsx` with an
`index.js` re-exporting the default (the `lazy(() => import(...))` in App.jsx
re-points to the feature root). Internal decomposition of HQ into
`hq/packs`, `hq/access`, … is real work with its own risk budget and belongs in
a dedicated later slice (it does not block Phase 4 — HQ shares no App state
except props already passed). Record as a follow-up in roadmap-status notes.

### R6 — Bundle budget = committed baseline + checker script

There is no budget today. Baseline measured at `a02724b`: main chunk
`dist/assets/index-*.js` = 472,684 bytes raw / **129,981 bytes gzip**; manual
chunks `react`, `recharts`, `motion`, `supabase`; lazy chunks for HQPanel and
marketing pages. Add `scripts/check-bundle-budget.mjs` + committed
`scripts/bundle-budget.json`:

```json
{ "mainChunkGzipMaxBytes": 136000, "requiredLazyChunks": ["HQPanel"] }
```

(gzip of the largest `index-*.js` in `dist/assets` must be ≤ budget; a chunk
whose name starts with `HQPanel` must exist.) Wired as `npm run
test:bundle-budget` after `build` in the `test` chain and in
`staging-checks.yml`. Budget gives ~4.6% headroom over baseline; pure moves
must not consume it (zustand is already present). Tightening happens in Phase 9.

### R7 — Guardrail re-points: allowed, enumerated, never weakened

(Extends Phase 2 Decision 3.) `scripts/test-release-guardrails.mjs` reads
App.jsx (`appSource`) plus `HQPanel.jsx`, `ExplorePanel.jsx`, `Onboarding.jsx`,
`DownloadPage.jsx`, etc. by exact path, and slices `appSource` with
`sourceBetween(...)` markers (`getLauncherCardActions`, `onPackContinue={() => {`,
`function ContinueToAppCard`…). Every commit that moves an asserted subject
must, in the same commit:

- add a `readFile` for the new file and re-point the assertion's source
  variable (or concatenate sources where an assertion legitimately spans files);
- keep the regex and the label **byte-identical** (exception: `sourceBetween`
  end-markers that referenced neighbours in the old file may become
  whole-file sources);
- list every re-pointed assertion in the commit message.

If preserving an assertion equivalently is impossible, STOP — that is new
information. Assertions over `App()` internals (handlers, JSX wiring, memo
wrappers such as `const MemoOverlay = memo(Overlay);`) stay pointed at
`appSource` because those lines do not move this phase.

## Current-state evidence (verified 2026-07-13, HEAD `a02724b`)

- `src/App.jsx`: 13,206 lines. `App()` = lines 1572–7089. Components below
  `App()` = lines 7090–13206 (6,116 lines): `parseBulkCards` (:7090),
  `Composer` (:7112), `Masthead` (:7551), `getHomeSpotlightSteps` (:7628),
  `HomeSpotlightTour` (:7671), `HomePanel` (:7813), `HomeAppIcon`,
  `HomeProgressRing`, `HomeReminderCard`, `LibrarySectionHeader`,
  `LibraryListRow`, `ExpandableCollection`, `CollectionPreviewRow`,
  `getLibraryPersonalSecondary`/`CommitmentSecondary`/`PackSecondary`,
  `TodayPersonalCardsPanel` (:8515), `StandardLibraryPanel` (:8585),
  `PackEditor` (:8792), `CustomPackEditor` (:8860), `ActionCardEditor` (:8954),
  `PackDetailModal` (:9006), `SyncConnectionScreen(+Content)` (:9183/:9198),
  `LegalModal` (:9461), `hourToTimeString`/`timeStringToHour`/
  `validateWindowDefsGapFree` (:9535–:9548), `AppsPanel` (:9563),
  `AppsPanelClock` (:9569), `EnabledAppRow`, `MoreAppsOptions`,
  `LauncherSetupInterstitial` (:10013), `AppsAccessScreen` (:10078),
  `getAccessPlanLabel`, `AccessPanel` (:10108),
  `FreeCoreReconciliationScreen` (:10219), `AppSwitchAccessScreen` (:10262),
  `AppsCodeScreen` (:10293), `getDefaultAppPrompt` (:10370),
  `AppManagementScreen` (:10380), `SettingsPanel` (:10582),
  `TesterToolsSettingsCard` (:10852), `DeleteAccountModal` (:10930),
  `MorningSummaryDebugLog` (:11001), `MorningSummaryModal` (:11028),
  `RestoreActionCardsModal` (:11137), `ActiveProtectedAppShortcut` (:11197),
  `Overlay` (:11222), `PremiumCardScreen` (:11747),
  `CommitmentCardOverlay`/`MotivationOverlay`/`CheckInOverlay`/
  `EncouragementOverlay`/`ReviewOverlay` (:11794–:12035),
  `CardRevealTemplate` (:12036), `getMessageBaseSize`,
  `CardRevealMessage` (:12177), `PremiumCardIcon`,
  `PremiumDashboardShortcut`, `PremiumCreateShortcut`, `AppPauseModal` (:12291),
  `PremiumActionStack`, `PremiumActionButton`, `ActionCardOverlay` (:12403),
  `ActionCardEmptyOverlay` (:12543), `ActionSuccessOverlay` (:12594),
  `FlowConfirmationOverlay` (:12615), `CustomPackOverlay` (:12657),
  `InterceptionOverlay` (:12716), `ActionButton` (:12890), glyphs
  (`ChevronRightGlyph`…`SettingsGlyph`, :12901–:13105), `CardIcon` (:12943),
  `AuthDiagnostics` (:13106), `ContinueToAppCard` (:13136). **Re-locate every
  symbol by NAME before moving; line numbers are advisory.**
- Module-scope helpers above `App()` (lines 197–1570) include feature-owned
  groups: overlay/launch-session builders (`buildRevealOverlay` :1138 through
  `getCommitmentCheckInOutcomeMessage`/`getCommitmentReviewOutcomeMessage`
  :1431/:1437, incl. `normalizeLaunchSession` :1198, `buildLaunchSession`
  :1234, `persistLaunchSession` :1238, `loadActiveProtectedAppContext` :1247,
  `persistActiveProtectedAppContext` :1266, `clearActiveProtectedAppContext`
  :1277, `getLauncherCardActions` :1325), home-state builders
  (`buildHomeState` :786, `getHomeCardTitle` :1111, `getPackRepresentative`
  :1116, `buildLibraryPackHomeItem` :1121), commitment helpers
  (`isCommitmentCard` :520 …), demo/e2e app glue (`shouldStartDemoOnboarding`
  :1484 … `applyLocalNormalPreviewFlag` :1552 — **stays**, guardrail-pinned
  dev-only), `buildInitialState` (:970), `buildSharedState`/
  `normalizeSharedState`/`mergeEntitiesById` (:1003–:1065, **stay** — sync
  bridge, Phase 6), `TESTPILOT_CONFIG` (:203, stays), memo wrappers
  (:1564–:1570, stay).
- Already extracted and NOT touched: `src/app/` (router, providers, e2e.js),
  `src/stores/sessionStore.js`, `src/services/errors/`, `src/components/`
  (BrandMark, Glyphs, LogPanel), `src/lib/*`, `src/testing/TestPilot`
  (already feature-shaped with `index.js` — the precedent for feature APIs).
- **Dead code:** `src/ContinueToAppCard.jsx` + `src/ContinueToAppCard.css` are
  imported by nothing (grep-verified); the live `ContinueToAppCard` is
  App.jsx:13136. Delete after re-verifying zero imports.
- Guardrails: `scripts/test-release-guardrails.mjs` (403 lines) — see R7.
  Assertions that will need re-points include (by label): the Library section
  renders/list-row/plus-target group, `Composer can open in section-specific
  creation modes`, `Apps panel clock…` pair, `fake launcher empty state…`
  group, `getLauncherCardActions` slice group, `ContinueToAppCard renders…`
  pair, `Explore…`/`HQ…`/onboarding/download path reads. Assertions pinned to
  `App()` internals stay on `appSource`.
- Playwright: single project `release-smoke` (Desktop Chrome), webServer
  `vite preview` at `127.0.0.1:4173/mybishbash`. 20 specs under `tests/e2e/`.
  Known baseline failures (from Phase 2b §5, re-verify on pre-phase HEAD
  before counting anything as regression): `access-gating.spec.ts:88`
  (pre-existing) and intermittent `timing-windows.spec.ts:187`.
- CI: `.github/workflows/staging-checks.yml` runs lint → unit → build →
  before-push → 3 smoke suites.
- Bundle baseline: see R6.

## Target layout after this phase

```
src/
  app/            (unchanged) + shell/Masthead.jsx, shell/glyphs.jsx
  features/
    home/         HomePanel, HomeAppIcon, HomeProgressRing, HomeReminderCard,
                  HomeSpotlightTour, getHomeSpotlightSteps, homeState.js
                  (buildHomeState + helpers), index.js
    library/      StandardLibraryPanel, TodayPersonalCardsPanel, section/row/
                  collection components, secondary-text helpers,
                  PackDetailModal, index.js
    composer/     Composer, parseBulkCards, PackEditor, CustomPackEditor,
                  ActionCardEditor, index.js
    apps/         AppsPanel(+Clock), EnabledAppRow, MoreAppsOptions,
                  LauncherSetupInterstitial, AppManagementScreen,
                  time helpers, index.js
    access/       AppsAccessScreen, AccessPanel, getAccessPlanLabel,
                  FreeCoreReconciliationScreen, AppSwitchAccessScreen,
                  AppsCodeScreen, getDefaultAppPrompt, index.js
    settings/     SettingsPanel, TesterToolsSettingsCard, DeleteAccountModal,
                  MorningSummary modals/debug, RestoreActionCardsModal, index.js
    auth/         SyncConnectionScreen(+Content), LegalModal, AuthDiagnostics,
                  index.js
    launcher/     OverlayHost.jsx (the Overlay dispatch), InterceptionOverlay,
                  ContinueToAppCard, ActiveProtectedAppShortcut, AppPauseModal,
                  reveal templates (CardRevealTemplate/Message, Premium*),
                  commitment overlays, action-card overlays, CustomPackOverlay,
                  ActionButton, overlayBuilders.js (buildRevealOverlay …
                  getLauncherCardActions), launchSessionStorage.js
                  (normalize/build/persist/load launch-session +
                  active-protected-app-context helpers), index.js
    explore/      ExplorePanel (moved file), index.js
    onboarding/   Onboarding (moved file), index.js
    hq/           HQPanel (moved file), index.js
    marketing/    LandingPage, LandingSections, AboutPage, DownloadPage,
                  EarlyAccessPage, PremiumLandingPage (+ their css), index.js
  stores/         sessionStore.js, uiStore.js (+ tests)
```

`CardIcon` and `ActionButton` are used by both library and launcher surfaces —
verify consumers by grep; if ≥2 features consume one, place it in
`src/components/` (the existing shared-primitives home) instead of a feature.
Rule of three (blueprint §8) decides; record the choice in the commit message.

## Implementation steps (one commit each; §Test strategy gates after every commit)

### Commit 1 — Standalone screen relocations + dead-code delete + docs amendment
- **Create:** `src/features/{marketing,explore,onboarding}/` with `index.js`
  each; move (git mv) `LandingPage.jsx`, `LandingSections.jsx`, `AboutPage.jsx`,
  `DownloadPage.jsx`, `EarlyAccessPage.jsx`, `PremiumLandingPage.jsx`,
  `landing.css`, `about.css`, `download.css`, `early-access.css` →
  `features/marketing/`; `ExplorePanel.jsx` → `features/explore/`;
  `Onboarding.jsx` → `features/onboarding/`.
- **Modify:** import re-points in `src/app/router/RootRouter.jsx`, `App.jsx`,
  and any other consumers (grep each moved name); guardrail `readFile` paths
  (`exploreSource`, `onboardingSource`, `downloadSource`); delete
  `src/ContinueToAppCard.jsx` + `.css` after grep re-verification;
  roadmap-status + blueprint §19 Phase 3 amendment per R1.
- **Unchanged behaviour:** RootRouter's marketing gate (guardrail-pinned) and
  all lazy() splits — the import *specifiers* change, the lazy structure doesn't.
- **Risk:** CSS import order for moved css files — keep each css imported from
  the same module it is imported from today.

### Commit 2 — features/hq relocation
- Move `src/HQPanel.jsx` → `src/features/hq/HQPanel.jsx` + `index.js`;
  re-point App.jsx lazy import (:195) to `./features/hq` and guardrail
  `hqSource` path. Record HQ internal split as deferred (R5).

### Commit 3 — features/auth + features/settings
- Move `SyncConnectionScreen(+Content)`, `LegalModal`, `AuthDiagnostics` →
  `features/auth/`; `SettingsPanel`, `TesterToolsSettingsCard`,
  `DeleteAccountModal`, `MorningSummaryDebugLog`, `MorningSummaryModal`,
  `RestoreActionCardsModal` → `features/settings/`. App.jsx imports them from
  feature indexes. Follow-the-references for helpers these components close
  over (e.g. content imports, `authContent`) — imports move with them; any
  helper also used by `App()` stays in App.jsx and is imported by the feature
  **only if it is already exported**; otherwise duplicate nothing and STOP.

### Commit 4 — features/library + features/composer
- Move the library group (:8198–:9182 symbols listed above) and composer group
  (`parseBulkCards`, `Composer`, `PackEditor`, `CustomPackEditor`,
  `ActionCardEditor`). Re-point the Library/Composer guardrail assertions (R7).

### Commit 5 — features/apps + features/access
- Move the apps group (incl. `AppsPanel`→`AppsPanelClock` pair **into one
  file** so the paired guardrail regexes keep matching one source) and the
  access group. Re-point `Apps panel clock…` and access-related assertions.

### Commit 6 — features/home + app/shell
- Move home group + `Masthead` → `src/app/shell/Masthead.jsx`; glyph functions
  (:12901–:13105) → `src/app/shell/glyphs.jsx` (chrome-adjacent, used across
  screens); `CardIcon`/`ActionButton` per the rule-of-three check above.
  `buildHomeState` group moves to `features/home/homeState.js` **only if**
  grep shows `App()` does not call it directly; if `App()` calls it, it moves
  to `features/home/` and App imports it from the feature index (allowed:
  `app/` imports features).

### Commit 7 — features/launcher (the big one)
- Move all overlay/reveal/commitment/action-card components (:11197–:13205
  launcher symbols), `Overlay` → `features/launcher/OverlayHost.jsx`
  (component name unchanged), `ContinueToAppCard`, module-scope overlay
  builders + launch-session storage helpers (evidence list above) →
  `features/launcher/overlayBuilders.js` / `launchSessionStorage.js`.
  App.jsx imports all of it from `./features/launcher`. Re-point the launcher
  guardrail slices (`getLauncherCardActions` group, `ContinueToAppCard` pair,
  fake-launcher empty-state group). `MemoOverlay = memo(Overlay)` stays in
  App.jsx.
- **Constraint:** helpers called by *both* `App()` and moved components (e.g.
  `isCommitmentCard`, `getCommitmentTimingConfig`) move to
  `features/launcher/` (or `domain/`-adjacent `lib/` if pure) and are imported
  back by App.jsx — never duplicated. Grep-verify each; STOP on any cycle.

### Commit 8 — stores/uiStore.js + overlay slot swap (R2)
- **Create:** `src/stores/uiStore.js` (lazy singleton, functional-update
  `setOverlay`, stack shape, `resetUiStoreForTests`) +
  `src/stores/uiStore.test.js` (initial descriptor for intercept vs normal
  boot; value + updater setOverlay; top-of-stack selector; push/pop/clear
  unit-level only).
- **Modify:** App.jsx:1655 `useState` → selector + action per R2; zero other
  App.jsx lines change (`git diff --stat` must show App.jsx + store files only).

### Commit 9 — boundary check + bundle budget + feature indexes audit
- **Create:** `scripts/check-feature-boundaries.mjs` (R3),
  `scripts/check-bundle-budget.mjs` + `scripts/bundle-budget.json` (R6).
- **Modify:** package.json (`test:boundaries`, `test:bundle-budget`, appended
  to `test` chain), `scripts/test-before-push.mjs`, `staging-checks.yml`;
  roadmap-status (Phase 3 → Complete + hashes + measured App.jsx line count).

**Packages to add: none.** (zustand is already installed; boundary/budget
checks are dependency-free scripts.)

## Test strategy

After **every** commit:
```
npm run lint && npm run test:unit && npm run build && npm run test:release-guardrails && npm run test:before-push
```
(From commit 9 also: `npm run test:boundaries && npm run test:bundle-budget`.)

Additional Playwright per commit (at `--workers=2`):
- Commit 1: `landing-responsive`, `explore`, `onboarding`, `release-smoke`.
- Commit 2: `release-smoke` (HQ has no dedicated spec; guardrails carry it).
- Commit 3: `settings-account-polish`, `auth-session-persistence`, `release-smoke`.
- Commit 4: `library-bottom-nav`, `commitment-cards`, `card-layout-stability`.
- Commit 5: `pause-launcher`, `timing-windows`, `activation-flow`, `access-gating`.
- Commit 6: `release-smoke`, `card-overlay-mobile`, `launcher-flow-trace`.
- Commit 7: `launcher-flow-trace`, `launcher-terminal-exhaustive`,
  `launcher-fallback`, `launcher-shell-repeat`, `offline-fallback`, then the
  **full suite**.
- Commit 8: **full suite twice consecutively** (state-home swap; flake check).
- Commit 9: full suite once.

Baseline failures (re-verify on `a02724b` first): `access-gating.spec.ts:88`,
intermittent `timing-windows.spec.ts:187`. Anything else failing twice on the
same assertion is stop-the-line.

## Acceptance criteria

- [ ] **Local:** full gate green; App.jsx ≤ 6,500 lines (report exact count);
      no function component defined in App.jsx outside `App()` except memo
      wrappers; every `features/*` directory has `index.js` and external
      consumers import only feature roots (`npm run test:boundaries` green).
- [ ] **CI:** `staging-checks.yml` green including the two new checks.
- [ ] **Production build:** `npm run build` and `npm run build:cloudflare`
      succeed; `npm run test:bundle-budget` green (main chunk gz ≤ 136,000 B);
      HQPanel + marketing chunks still emitted separately (diff
      `dist/assets` chunk names before/after — no chunk disappears).
- [ ] **Capacitor:** `npx cap sync` completes without error (web asset dir
      unchanged); no change to `capacitor.config.json`.
- [ ] **User-visible behaviour unchanged:** full e2e suite (incl.
      `launcher-terminal-exhaustive`) passes unchanged; screenshot flows in
      `screenshots/` spot-checked on staging preview; overlay boot on
      `/intercept/:launcherId` byte-identical per `launcher-flow-trace`.
- [ ] Guardrail re-points enumerated in commit messages; zero regex/label
      changes (R7); dead `ContinueToAppCard.jsx/.css` deleted.
- [ ] roadmap-status + blueprint amendment (R1) landed.

## Rollback criteria

Revert (newest-first) rather than patch forward when: any non-baseline e2e
fails twice on the same assertion; a guardrail assertion cannot be re-pointed
without changing its regex; the intercept boot chain regresses in
`launcher-terminal-exhaustive`; bundle budget fails and the cause is not an
accounting error; or staging `client_errors` shows a spike traceable to the
phase. Commits 1–7 are pure moves — each independently revertible. Commit 8 is
in-memory state only (no storage/schema implications); rollback is purely git.
Never patch a broken move forward by editing moved code semantics.

## Sonnet execution prompt

```
You are implementing Phase 3 of the myBishBash architecture roadmap on branch
`staging`.

Read completely before touching anything:
1. docs/architecture/phase-03-feature-modules.md (your work order)
2. docs/architecture-blueprint.md §5, §7, §8, §19 Phase 3
3. docs/architecture/phase-02b-session-store.md (the proven swap pattern)
4. docs/architecture/roadmap-status.md
5. scripts/test-release-guardrails.mjs (all 403 lines — you will re-point
   assertions and must not weaken any)

Before editing: re-locate every symbol named in the packet BY NAME in
src/App.jsx with grep and re-verify its consumer set. The packet's line
numbers are advisory. If a symbol's consumers contradict the packet's
disposition (e.g. a "feature" helper is also called by App()), follow the
packet's constraint rules; if none applies, STOP and report.

Rules:
- Nine commits, in packet order; run the full verification gate after each;
  Playwright per the packet's per-commit list at --workers=2.
- Moves are VERBATIM: no renames, no prop changes, no dep-array edits, no
  logic edits, no new lazy boundaries, no CSS changes. Imports/exports are
  the only permitted diffs inside moved code.
- Guardrail edits may only re-point source variables to new file paths;
  regexes and labels stay byte-identical; enumerate every re-point in the
  commit message; STOP if an assertion cannot be preserved equivalently.
- Feature modules never import other features' internals (only index.js);
  stores/lib/services never import features or App.jsx.
- No new dependencies.
- The two baseline e2e failures listed in the packet are expected; anything
  else failing twice on one assertion is stop-the-line.
- Update roadmap-status.md and the blueprint amendment in the commits the
  packet assigns them to. Push to staging only with all gates green.

Report: commit hashes, final App.jsx line count, the complete guardrail
re-point list, boundary/budget check output, e2e results (including the
double run after commit 8), and anything that contradicted this packet.
```
