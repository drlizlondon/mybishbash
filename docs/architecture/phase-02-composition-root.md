# Phase 2 — Composition root: router + session/environment extraction

**Blueprint:** `docs/architecture-blueprint.md` §19 Phase 2
**Status tracker:** `docs/architecture/roadmap-status.md`
**Depends on:** Phases 0–1 complete (unit harness, lint, error telemetry live).
**Executor:** Claude Sonnet, fresh session, branch `staging`.

---

## Objective

Create `src/app/` — the composition root — by extracting from `App.jsx`, in
verbatim moves: (1) the route model (pure functions), (2) `RootRouter` and the
marketing/legal page gate, (3) a `useRoute()` hook owning route state +
history sync + `navigateTo`, (4) app-environment concerns (theme, app update,
offline flag, notification permission), and (5) the first domain store —
`sessionStore` (Zustand) with an `AuthProvider` owning the auth subscription.

This phase establishes the extraction pattern every later phase follows:
**move verbatim, re-point imports, prove behaviour identical, only then stop.**

**Deliberately NOT attempted:**
- No overlay/state-machine changes; `overlay`, `launchSession`,
  `activeProtectedAppContext` and all their initializers stay in `App()`.
- No sync-engine changes: the cloud save/load effects and their refs
  (`cloudSaveTimerRef`, `highestKnownCloudTimeRef`, …) stay in `App()`
  untouched (they move in Phases 4–6).
- No feature-component moves (Phase 3), no TypeScript (Phase 7), no CSS work
  (Phase 8), no behaviour changes of any kind, no new routes.
- No router library. The hand-rolled router is *named*, not replaced.

## Decisions (resolved — do not relitigate)

1. **Verbatim-first.** Every function moves byte-identical (imports/exports
   aside). Refactors of moved code are out of scope, even obvious ones.
2. **Zustand enters here, for `sessionStore` only** (`zustand@^5`, the only
   new dependency). Components/App read via hook selectors; the store shape
   mirrors today's `useState` fields exactly.
3. **Guardrail assertions may be re-pointed, never weakened.** Two guardrails
   read App.jsx structure around routing (below). When code moves, the same
   regex moves to read the new file. Every guardrail edit must be listed in
   its commit message. If a pattern cannot be preserved equivalently, STOP.
4. **Riskiest step last.** Auth extraction (step 5) lands only after the
   router steps have soaked through the full e2e suite.
5. **The sync bridge stays in App.** After step 5, `App()` reads `session`
   from `sessionStore` via a hook and keeps its existing sync effects keyed on
   that value with identical dependency semantics. Auth state moves; sync
   orchestration does not.

## Current-state evidence (verified 2026-07-11, HEAD `43ba153`)

- `src/App.jsx` is ~13,745 lines. `main.jsx` renders `App.jsx`'s default
  export; **`RootRouter` (App.jsx:1744) is the top component** — it runs
  BEFORE any App hooks and returns marketing pages (`EarlyAccessPage`,
  `DownloadPage`, `AboutPage`, `LegalPage`, `EditableLandingPage`) for public
  paths, else `<App/>`. It also consumes signup handoffs and demo-mode
  URL flags.
- Route model functions (all module-scope, pure or window-reading):
  `normalizeRoutePath` (:617), `getPathRelativeToKnownBase` (:623),
  `getRouteFromLocation(setupComplete)` (:631), `parseRoute(path)` (:671),
  `getSafeAppTab` (:724), `getBottomNavItems` (:728), constants
  `BASE_PATH`/`PRODUCTION_BASE_PATH` (:210-211, derived from
  `import.meta.env.BASE_URL`). Re-locate by NAME, not line, before editing.
- Route state inside `App()`: `routePath` useState seeded from
  `getRouteFromLocation(initialState.setupComplete)`; `initialRoute` =
  `parseRoute(routePath)` memo; **`screen`, `overlay`,
  `activeProtectedAppContext`, `launchSession`, `launcherContext` useState
  initializers all read `initialRoute` synchronously** — this is the intercept
  boot chain and the most fragile invariant in the file. A history-sync
  effect mirrors `routePath` → `history.replaceState`; `navigateTo`
  (App.jsx:4102) is the imperative navigation entry.
- Auth: `onAuthStateChange` subscription effect (App.jsx:~2613) sets
  `session`/`authReady` and interleaves with shared-state loading;
  `fetchOwnAccessProfile`, `checkIsAdmin`, tester status and `accessProfile`/
  `accessStatus`/`isAdmin`/`adminStatus`/`testerStatus` useStates live in
  `App()`. E2E mode builds a fake session (`buildE2ESession`).
- Environment concerns in `App()`: theme (`resolveTheme` :204 + effect),
  `appUpdate` state (from `src/appUpdate.js`), `isOffline` (online/offline
  listeners), `notificationStatus` (permission).
- **Guardrails that pin this structure** (`scripts/test-release-guardrails.mjs`):
  - line ~72 `"public marketing route selection lives above App hooks"` —
    regex over `rootRouterSource` (extracted from App.jsx between markers):
    `/normalizedPath === "\/early-access"[\s\S]{0,900}normalizedPath === "\/terms"[\s\S]{0,700}EditableLandingPage/`
  - line ~73 `"App does not return marketing routes before hooks"` —
    `assertNoMatch` over `appBeforeHooksSource` for any marketing component name.
  - The script also imports/reads many other `src/` files by exact path —
    nothing else this phase touches may move.
- Unit/lint/CI harness from Phase 0 is live; error telemetry from Phase 1
  reports boundary/window errors (`services/errors/`), giving this phase a
  production health signal.
- Playwright suites that exercise routing hardest:
  `tests/e2e/launcher-flow-trace.spec.ts`,
  `tests/e2e/launcher-terminal-exhaustive.spec.ts`,
  `tests/e2e/launcher-shell-repeat.spec.ts`, `release-smoke.spec.ts`.

## Packages to add

| Package | Version | Step | Why |
|---|---|---|---|
| `zustand` | `^5` | 5 | sessionStore; ~1KB, wrapped behind our own hooks |

Nothing else.

## Invariants (must hold after every commit)

1. Marketing/legal routes render **before any App hook runs** (guardrails 72/73).
2. `initDynamicLaunchersFromCache()` runs before the initial route is parsed
   (main.jsx order untouched).
3. The intercept boot chain stays synchronous: initial route is computed
   before — and feeds — the `screen`/`overlay`/`launchSession`/
   `activeProtectedAppContext` initializers, unchanged.
4. `BASE_PATH` semantics: `import.meta.env.BASE_URL` derivation, `?route=`
   param support, standalone-display handling, legacy `/bishbash` rebase.
5. E2E/demo localStorage flags behave identically.
6. One concern per commit; never behaviour + structure in the same commit.
7. `npm run test:before-push` green before every commit lands.

## Implementation steps (ordered — one commit each)

### Step 1 — `src/app/router/routes.js`: the pure route model
Move verbatim from App.jsx: `BASE_PATH`, `PRODUCTION_BASE_PATH`,
`normalizeRoutePath`, `getPathRelativeToKnownBase`, `getRouteFromLocation`,
`parseRoute`, `getSafeAppTab`, `getBottomNavItems` (+ any module-scope
constants they alone reference — follow the references, take nothing else).
App.jsx imports them; delete the originals. `RootRouter` stays in App.jsx
this step (its guardrail regex reads App.jsx).

Add `src/app/router/routes.test.js`: a table of every URL shape →
`parseRoute` result: `/home`, `/library`, `/log`, `/explore`, `/apps`,
`/apps/:versionId`, `/access`, `/settings`, `/onboarding`,
`/intercept/:launcherId` (each static launcher + an HQ-dynamic id + an
unknown id), `/early-access`, `/download`, `/invite`, `/about`, `/terms`,
`/privacy`, `/`, `/index.html`, `?route=` variants, `/bishbash/...` legacy,
unknown paths (fallback), with and without a `/mybishbash` base. Derive
expectations from the moved code's actual behaviour.

**Verify:** `npm run lint && npm run test:unit && npm run build &&
npm run test:release-guardrails` then `npm run test:before-push`.
**Commit:** `Extract route model into src/app/router/routes.js`.

### Step 2 — `src/app/router/RootRouter.jsx` + marketing gate
Move `RootRouter`, `PageSuspenseFallback`, `LegalPage`, and the lazy
marketing imports (`EditableLandingPage`, `EarlyAccessPage`, `AboutPage`,
`DownloadPage`) into `src/app/router/RootRouter.jsx`; it imports `App` and
stays the default export path: `main.jsx` now renders `RootRouter` from the
new file (inside the existing `RootErrorBoundary`). App.jsx keeps its default
export of `App` — wait: today `main.jsx` imports App.jsx's default export
which IS the RootRouter wrapper. Preserve the public shape instead:
App.jsx's default export becomes the imported `RootRouter` re-export OR
main.jsx switches to `import RootRouter from "./app/router/RootRouter"`.
Choose the main.jsx switch (one-line, explicit) and export `App` named from
App.jsx.

**Guardrail re-point (allowed, exact):** update
`scripts/test-release-guardrails.mjs` so `rootRouterSource` reads
`src/app/router/RootRouter.jsx` (same regex, byte-identical), and
`appBeforeHooksSource` continues to read App.jsx (assertion 73 should now
pass trivially and still guard regressions). List both edits in the commit
message.

**Verify:** full gate as step 1 + `npx playwright test` (full suite — this
step touches the marketing/app split).
**Commit:** `Extract RootRouter and marketing gate into src/app/router`.

### Step 3 — `src/app/router/useRoute.js`
Create `useRoute(setupComplete)` returning
`{ routePath, route, initialRoute, navigateTo }`:
- Owns the `routePath` useState (seeded exactly as today), the `route`
  memo, the history-sync effect (moved verbatim), and `navigateTo` (moved
  verbatim, including its `replace` option and any launch-session side
  effects it carries — read it fully first; if it mutates non-route state,
  keep those mutations in App by having `navigateTo` accept callbacks or by
  leaving `navigateTo` in App and moving only the state+effect — prefer the
  smaller move and record which was chosen).
- `initialRoute` must be computed in the hook's first render synchronously
  so App's dependent initializers (invariant 3) read it exactly as today —
  App calls `useRoute` BEFORE those `useState` initializers, preserving order.

**Verify:** full gate + `npx playwright test tests/e2e/launcher-flow-trace.spec.ts
tests/e2e/launcher-terminal-exhaustive.spec.ts` explicitly, then full suite.
**Commit:** `Move route state and navigation into useRoute hook`.

### Step 4 — `src/app/providers/environment.js`
Extract as hooks (not context providers — App consumes them directly, no tree
change): `useThemePreference` (theme state + `resolveTheme` + DOM effect),
`useAppUpdateStatus` (`appUpdate` state + subscription to `src/appUpdate.js`),
`useOfflineFlag` (the optimistic-online listeners, comment preserved),
`useNotificationPermission` (`notificationStatus` + permission querying).
Each is a verbatim relocation of one useState + its effects.

**Verify:** full gate + before-push.
**Commit:** `Extract environment hooks (theme, update, offline, notifications)`.

### Step 5 — `src/stores/sessionStore.js` + `src/app/providers/AuthProvider.jsx`
Add `zustand`. Store shape (exactly today's fields):
`{ session, authReady, isAdmin, adminStatus, testerStatus, accessProfile,
accessStatus, actions: { setSession, setAuthReady, … } }`.
`AuthProvider` (mounted in RootRouter around `<App/>`... **no** — mounted
inside App.jsx's render would change hook order; mount it in
`src/app/router/RootRouter.jsx` around `<App/>` so it runs only for app
routes) owns: the `onAuthStateChange` subscription, initial `getSession()`
resolution, e2e-mode fake session, `fetchOwnAccessProfile`, `checkIsAdmin`,
tester-status resolution — each moved with its guards intact. App reads via
`useSessionStore` selectors; its sync/shared-state effects keep `session` in
their dependency arrays exactly as before (Decision 5).

READ FIRST: the auth effect interleaves with shared-state loading. Only the
parts that set the seven session fields move; any line that touches cards,
shared state, event log or sync refs STAYS in App, driven by the store's
`session` value. If the interleaving cannot be split without changing
ordering semantics, STOP and report rather than approximating.

**Verify:** full gate + **entire Playwright suite run twice consecutively**
(flake check: auth timing is the risk) + a manual staging-preview login
smoke after deploy.
**Commit:** `Introduce sessionStore and AuthProvider` (+ lockfile).

## Test strategy — commands

After every step: `npm run lint && npm run test:unit && npm run build &&
npm run test:release-guardrails && npm run test:before-push`
Steps 2, 3, 5 additionally: `npx playwright test` (full; twice for step 5).
New unit tests: `routes.test.js` URL table (step 1); store action tests for
`sessionStore` (step 5, plain Zustand store — no React needed).

## Acceptance criteria

- [ ] `src/app/router/{routes.js,RootRouter.jsx,useRoute.js}`,
      `src/app/providers/{environment.js,AuthProvider.jsx}`,
      `src/stores/sessionStore.js` exist with the responsibilities above.
- [ ] `App.jsx` reduced by ≥900 lines (≤ ~12,800) with zero logic edits —
      every removed line accounted for by a move.
- [ ] `parseRoute` URL-table tests pass (≥25 cases incl. intercept, legacy
      base, `?route=`, marketing, fallbacks).
- [ ] Both routing guardrails still assert (one re-pointed, regex unchanged).
- [ ] Full e2e suite green after steps 2, 3, and twice consecutively after 5.
- [ ] Bundle: no new chunks besides zustand's ~1KB in the main chunk;
      marketing pages remain lazy (`dist/assets` chunk names comparable).
- [ ] No changes outside: `src/App.jsx`, `src/main.jsx`, new `src/app/**`,
      `src/stores/**`, `scripts/test-release-guardrails.mjs` (re-points only),
      `package.json`/lockfile (zustand), new test files.
- [ ] Staging deploy after final push: login + launcher intercept flow work
      on the Pages preview; no new rows in `client_errors` traceable to the
      refactor within the soak day.

## Rollback criteria

Each step is one commit; revert the newest first (later steps import earlier
ones, so reverts must run in reverse order). Revert rather than patch forward
if: any e2e fails twice on the same assertion post-change; the intercept boot
chain regresses in `launcher-terminal-exhaustive`; client_errors shows a
boundary/window error spike on staging traceable to the refactor; or a
guardrail cannot be preserved with an equivalent pattern. No schema, storage
or data implications — rollback is purely git.

## Sonnet execution prompt

```
You are implementing Phase 2 of the myBishBash architecture roadmap on branch
`staging`.

Read completely before touching anything:
1. docs/architecture-blueprint.md (context — do not implement beyond Phase 2)
2. docs/architecture/phase-02-composition-root.md (your work order)
3. docs/architecture/roadmap-status.md
4. scripts/test-release-guardrails.mjs (the assertions you must preserve)

Verify Phase 0/1 are live (npm run lint, npm run test:unit pass; src/services/
errors exists). Re-locate every function named in the packet BY NAME in
src/App.jsx and confirm the "Current-state evidence" still matches; on any
mismatch, STOP and report.

Rules:
- Five steps, five commits, in order; the packet's verification gate after
  each; full Playwright after steps 2/3, twice after step 5.
- Moves are VERBATIM. You may not refactor, rename, reorder hooks, or "improve"
  moved code. One concern per commit.
- Guardrail edits: re-point file reads only, regex byte-identical, listed in
  the commit message.
- The intercept boot chain (route → screen/overlay/launchSession initializers)
  must remain synchronous and order-identical — treat any test touching
  /intercept/ as stop-the-line.
- Only zustand@^5 may be added. No other dependencies.
- If the auth effect cannot be split cleanly per Decision 5, stop after step 4,
  commit what is green, and report the entanglement in detail.
- Update docs/architecture/roadmap-status.md (In progress → Complete with
  commit hashes). Push to staging only with all gates green.

Report: commit hashes, files moved per step, line-count delta of App.jsx,
guardrail edits made, verification outputs, anything that contradicted the
packet.
```
