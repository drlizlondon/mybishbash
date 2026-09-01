# Phase 2b — sessionStore + auth lifecycle (step-5 follow-up)

**Blueprint:** `docs/architecture-blueprint.md` §9, §19 Phase 2
**Supersedes:** step 5 of `docs/architecture/phase-02-composition-root.md`
**Status tracker:** `docs/architecture/roadmap-status.md`
**Depends on:** Phase 2 steps 1–4 complete (`3e04058`, `01f9f2c`, `f96dadb`, `bb69e8e`)
**Executor:** Claude Sonnet, fresh session, branch `staging`.

---

## 1. Architectural ruling (resolves the recorded entanglement)

The step-5 stop condition fired because the auth-resolution effect sets
`syncStatus`/`syncError` in the same branches that set `session`/`authReady`,
and the original packet allowed only seven fields into `sessionStore`. This
packet resolves that with a classification ruling, not a workaround.

### 1.1 Auth and sync are separate concerns — but `syncStatus` is not sync state

Enumerating every writer of `syncStatus`/`syncError` (verified against
App.jsx at `c661529`):

| Writer group | Location | What it expresses |
|---|---|---|
| Auth-resolution effect (e2e branch, `resolveSessionWithRetry` then/catch, `onAuthStateChange`) | ~2365–2436 | identity resolved / needs login / identity check failed |
| Shared-state hydration effect (`loadSharedState` then/catch) | ~2737–2780 | profile loading / usable / load failed |
| Auth form handlers (`handleSignUp`, `handleLogIn`, `handleLogOut`, `handleDeleteAccount`, `handleResetSharedState`, `handleRefreshSession`) | ~6063–6196 | auth action in flight / back to login |

Readers: the boot-gate render ladder (`SyncConnectionScreen` branches,
~6613–6672), the cloud-save effect gate (`syncStatus === "ready"`), the
launcher decision effect, and event-log/timing dep arrays.

The value set — `"loading" | "ready" | "needs-connection" | "error"` — is a
**boot/connection funnel**: *resolving identity → needs login → hydrating
profile → usable / failed*. `syncError` is the human-readable message for
that funnel's gate screen. Neither is replication status. The Phase 6 sync
engine's `status` (`synced | pending(n) | offline | error`, blueprint §10)
is a **different variable** that will coexist with and eventually subsume
the hydration leg of today's funnel.

So the entanglement the implementer found is not accidental coupling to be
severed — it is evidence that `syncStatus`/`syncError` were misclassified.
They are **connection-lifecycle state**, and the connection lifecycle is
driven primarily by auth (two of the three writer groups are auth code).

### 1.2 Where they belong

In `sessionStore`, alongside the seven session fields, as a
connection-lifecycle slice. **Nine fields total**: `session`, `authReady`,
`isAdmin`, `adminStatus`, `testerStatus`, `accessProfile`, `accessStatus`,
`syncStatus`, `syncError`.

Rejected alternatives:

- **Keep them in App / split the status machine** — requires either
  duplicating the async resolution/retry logic or rewriting the gate ladder;
  exactly the non-verbatim change step 5 correctly refused.
- **A separate `connectionStore`** — same writers, same readers, no consumer
  reads one without the other; a second store adds a consistency seam and
  buys nothing.
- **Move them to the (future) sync engine** — the engine doesn't exist until
  Phase 6, and its status is a different variable anyway.
- **An orchestration/coordinator layer** — over-engineering for four string
  values written from three well-understood sites; revisit only if Phase 6
  shows real arbitration between auth and sync writers.

**Blueprint amendment (do in this phase):** add one row to the §9 table:

> | Connection lifecycle | `sessionStore` | none | `syncStatus`, `syncError` — pre-Phase-6 boot/connection funnel; distinct from the Phase 6 sync-engine `status`, expected to be renamed (`connectionStatus`) or partially subsumed when `services/sync` lands |

No renames in this phase — behaviour preservation includes names.

### 1.3 AuthProvider vs hook: use a hook

The original packet mounted an `AuthProvider` in `RootRouter` around
`<App/>`. Do **not** do that in this phase:

- Zustand state is globally readable — a provider adds no data access.
- A parent component hosting the effects changes mount-effect ordering
  (child effects run before parent effects), moving auth resolution from
  the middle of App's effect sequence to after all of them, and changes
  tree shape — both gratuitous risks for zero present benefit.
- Steps 3–4 already proved the safer pattern: a hook called at the exact
  source position of the state/effects it absorbs (`useRoute`,
  `useOfflineFlag`, …).

So: **`useAuthLifecycle(...)` hook, called in `App()` at the auth effect's
current position.** A provider component can be introduced trivially in
Phase 3/4 if a non-App consumer ever needs the lifecycle mounted without
App; record that as the trigger condition, not a default.

## 2. Target design

```
src/app/e2e.js                  ← shared e2e/timing helpers (verbatim moves)
src/stores/sessionStore.js      ← nine fields + static actions, lazy singleton
src/stores/sessionStore.test.js ← unit tests (plain store, no React)
src/app/providers/auth.js       ← useAuthLifecycle: the four auth effects
src/App.jsx                     ← reads via selectors; handlers call actions;
                                  hydration/save effects + form handlers stay
```

### 2.1 `src/stores/sessionStore.js`

- **Lazy singleton, not import-time creation.** Module evaluation happens
  before `RootRouter` runs `consumeSignupHandoffFromUrl` /
  `applyLocalNormalPreviewFlag` (which mutate localStorage flags); today's
  `useState` initializers run **after** that, at App's first render. Creating
  the store at import time would read flags too early. Pattern:

  ```js
  import { createStore } from "zustand/vanilla";
  import { useStore } from "zustand";

  let store = null;
  export function getSessionStore() {
    if (!store) store = createStore(buildInitialSessionState);
    return store;
  }
  export function useSessionStore(selector) {
    return useStore(getSessionStore(), selector);
  }
  export function getSessionActions() {
    return getSessionStore().getState().actions;
  }
  export function resetSessionStoreForTests() { store = null; }
  ```

  First use is App's first render — same timing as today's initializers.

- `buildInitialSessionState()` reproduces today's initializer expressions
  **verbatim** (App.jsx ~1680–1700): `session: null`, `authReady: false`,
  `syncStatus: "loading"`, `syncError: ""`, `isAdmin: false`,
  `adminStatus: e2eMode ? "ready" : "idle"`, the `testerStatus` initializer
  reading `E2E_TESTER_MODE_KEY`, `accessProfile: e2eMode ?
  loadE2EAccessProfile() : null`, `accessStatus: e2eMode ? "granted" :
  session?.user?.id ? … ` — no: the initial `accessStatus` is
  `e2eMode ? "granted" : "unknown"` (line ~1700). `e2eMode` comes from
  `isE2EModeEnabled()` imported from `src/app/e2e.js` (see 2.3) — **never
  import App.jsx from store or hook modules (circular).**

- Actions mirror today's setters one-for-one (`setSession`, `setAuthReady`,
  `setSyncStatus`, `setSyncError`, `setIsAdmin`, `setAdminStatus`,
  `setTesterStatus`, `setAccessProfile`, `setAccessStatus`). Each must accept
  **functional updates** like a `useState` setter (the `onAuthStateChange`
  callback uses `setSession((currentSession) => …)`):

  ```js
  setSession: (next) => set((s) => ({
    session: typeof next === "function" ? next(s.session) : next,
  })),
  ```

  Apply the same wrapper to all nine for uniformity.

### 2.2 App.jsx read/write swap

At the exact source lines of the nine `useState` declarations, substitute:

```js
const session = useSessionStore((s) => s.session);
// … one selector per field, same local names, same line positions …
const {
  setSession, setAuthReady, setSyncStatus, setSyncError,
  setIsAdmin, setAdminStatus, setTesterStatus,
  setAccessProfile, setAccessStatus,
} = getSessionActions();
```

Local names identical ⇒ **every one of the ~100 read/write call sites in
App.jsx is untouched**, including all dependency arrays. Zustand actions are
referentially stable, matching `useState` setter stability.

### 2.3 `src/app/e2e.js` — shared helpers (cycle breaker)

Symbol disposition (grep-verified at `c661529`; re-verify by name before
moving — the follow-the-references rule from the original packet applies):

| Symbol (App.jsx line) | Uses in App.jsx | Disposition |
|---|---|---|
| `isE2EModeEnabled` (:377) | store init + App | move → `src/app/e2e.js` |
| `E2E_TESTER_MODE_KEY` (:213) | store init, auth hook, App, timing | move → `src/app/e2e.js` |
| `loadE2EAccessProfile` (:385) | store init, access effect, `handleClaimInAppAccessCode` | move → `src/app/e2e.js` |
| `buildE2ESession` (:449) | auth effect only (2 refs) | move → `src/app/e2e.js` (or auth.js) |
| `isLaunchTimingEnabled` + `recordLaunchTiming` + `LAUNCH_TIMING_LOG_KEY` (:524–:550) | auth/tester effects + many App sites | move → `src/app/e2e.js` (self-contained: window + localStorage only) |
| `AUTH_SESSION_RETRY_DELAYS_MS` (:199) | auth effect only | move → `src/app/providers/auth.js` |
| `HQ_ADMIN_EMAILS` (:226) | admin effect only | move → `src/app/providers/auth.js` |

Everything else the effects call (`getSession`, `onAuthStateChange`,
`getSyncErrorMessage`, `checkIsAdmin`, `fetchTesterStatus`,
`fetchOwnAccessProfile`, `isAccessActive`) already lives in
`src/lib/mybishbashSync.js` / `src/lib/accessCapabilities.js` — import
directly, no cycles.

If any grep shows a disposition above is wrong (extra consumers), prefer
`src/app/e2e.js` over duplication, and STOP if a symbol can neither move nor
be imported without a cycle.

### 2.4 `src/app/providers/auth.js` — `useAuthLifecycle`

```js
export function useAuthLifecycle({ e2eMode, testerStatus, setShouldLaunchOverlay }) { … }
```

Owns, moved **verbatim** (bodies and dependency arrays byte-identical):

1. The auth-resolution effect (App.jsx ~2365–2436): e2e fake-session branch,
   `resolveSessionWithRetry`, the promise chain, the `onAuthStateChange`
   subscription, cleanup. `useState` setters become the store actions of the
   same name (imported via `getSessionActions()` inside the hook).
2. The admin effect (~2438–2470).
3. The tester-status effect (~2472–2505).
4. The access-profile effect (~2522–2545).

Parameter rules — these preserve exact current semantics; do not "improve"
them:

- `e2eMode`: passed in from App's existing `const e2eMode = isE2EModeEnabled()`.
- `testerStatus`: the auth effect reads it **stale by design** — its dep
  array is `[e2eMode]`, so `recordLaunchTiming("auth ready", …, testerStatus)`
  sees the mount-time value (null / e2e initializer). Passing the selector
  value into the hook reproduces identical closure capture. Do **not**
  switch to `getState()` — that would read the live value and change
  telemetry payloads.
- `setShouldLaunchOverlay`: the e2e branch calls it synchronously (App.jsx
  :2376); it is App-owned launch state and must stay so. Invoke the passed
  setter inline at the same statement position.

**Call position:** invoke `useAuthLifecycle(…)` in `App()` at the exact
source position the auth-resolution effect occupies today (~2365), so the
four effects register in App's effect sequence where effects 1 was —
matching the `useRoute` precedent. Known, accepted micro-reorder: the
access-profile effect currently registers **after** the `globalPacks` effect
(:2507); inside the hook it registers before it. Both effects early-return
until `authReady` and share no state, so ordering is immaterial — record
this in the commit message rather than contorting the hook.

Remaining in App.jsx, now writing via store actions (already swapped in
commit 2, so these need zero edits in commit 3):
shared-state hydration + cloud-save effects (Decision 5 of the original
packet — the sync bridge stays in App), `handleSignUp` / `handleLogIn` /
`handleLogOut` / `handleDeleteAccount` / `handleResetSharedState` /
`handleRefreshSession` / `handleClaimInAppAccessCode`, `touchUserProfile`
effect, and the gate-screen render ladder.

## 3. File ownership

| File | Status | Owns after this phase |
|---|---|---|
| `src/stores/sessionStore.js` | new | nine-field state + actions; lazy singleton; test reset |
| `src/stores/sessionStore.test.js` | new | action semantics incl. functional updates |
| `src/app/e2e.js` | new | e2e-mode detection, e2e fixtures, launch-timing log |
| `src/app/providers/auth.js` | new | the four auth effects; retry delays; admin allowlist |
| `src/App.jsx` | modified | selectors + actions binding; sync bridge; auth form handlers; gate ladder |
| `docs/architecture-blueprint.md` | modified | §9 connection-lifecycle row (§1.2 above) |
| `docs/architecture/phase-02-composition-root.md` | modified | step-5 "superseded by phase-02b" note |
| `docs/architecture/roadmap-status.md` | modified | Phase 2 → Complete + log entry |
| `package.json` / lockfile | modified | `zustand@^5` (still the only new dependency) |
| `src/app/providers/AuthProvider.jsx` | **not created** | deferred; trigger = a non-App consumer needs the lifecycle |

Nothing else may change. Guardrails: no auth-related assertions exist in
`scripts/test-release-guardrails.mjs` (verified — its App.jsx regexes cover
fake-launcher and routing structure, none of the moved lines); expect
**zero guardrail edits** this phase. If any assertion fails, STOP — that is
new information, not a re-point case.

## 4. Implementation order (one commit each)

### Commit 1 — store + helpers + docs ruling
Add `zustand@^5`. Create `src/app/e2e.js` (verbatim moves per §2.3 table,
App.jsx imports them back). Create `src/stores/sessionStore.js` +
`sessionStore.test.js` (assert: initial-state parity incl. e2e variants via
`resetSessionStoreForTests` + localStorage stubs; functional-update setters;
action stability). Amend blueprint §9 and mark original step 5 superseded.
**App behaviour untouched — the store has no consumers yet.**
Commit: `Add sessionStore and shared e2e helpers; classify connection lifecycle`.

### Commit 2 — state-home swap
Replace the nine `useState` declarations with selectors + `getSessionActions()`
per §2.2. **Zero other lines change** — verify with
`git diff --stat` (App.jsx only) and by grepping that no
`useState` remains for the nine names and no call site changed.
Commit: `Move session and connection state into sessionStore`.

### Commit 3 — core auth lifecycle extraction
Create `src/app/providers/auth.js` with the auth-resolution effect +
subscription only (item 1 of §2.4), moved verbatim; hook called at the
effect's current position; params per §2.4.
Commit: `Move auth resolution into useAuthLifecycle`.

### Commit 4 — derived-status effects
Move admin, tester-status, and access-profile effects (items 2–4) into
`useAuthLifecycle`, in their current relative order; record the accepted
globalPacks micro-reorder in the commit message. Update roadmap-status
(Phase 2 → Complete, hashes, log).
Commit: `Move admin/tester/access resolution into useAuthLifecycle`.

## 5. Verification gates

After **every** commit:
`npm run lint && npm run test:unit && npm run build && npm run test:release-guardrails && npm run test:before-push`

Additionally:
- **Commit 2:** full Playwright at `--workers=2` (this is the highest-risk
  commit — the state-home swap touches every consumer at once).
- **Commit 3:** targeted intercept suites (`launcher-flow-trace`,
  `launcher-terminal-exhaustive`) then full suite at `--workers=2`.
- **Commit 4:** full Playwright at `--workers=2` **twice consecutively**
  (auth-timing flake check, per the original packet).
- **Expected baseline failures (do not count against the gates, do not fix):**
  `access-gating.spec.ts:88` (pre-existing, reproduced on pre-Phase-2 HEAD)
  and intermittently `timing-windows.spec.ts:187`. Any failure **outside**
  this baseline, twice on the same assertion, is stop-the-line.
- **Launch-timing spot check** (commit 3): in an e2e run, confirm
  `window.__MYBISHBASH_LAUNCH_TIMINGS` still contains `auth ready`,
  `sync ready`, `tester status ready` entries with the same payload keys.
- **Post-push:** staging Pages preview manual smoke — login, launcher
  intercept, logout, log back in; then one soak day watching `client_errors`
  for boundary/window errors traceable to the refactor.

## 6. Acceptance criteria

- [ ] `sessionStore` holds exactly the nine fields; unit tests cover initial
      state (normal + e2e), functional updates, and `SIGNED_OUT` semantics
      (`setSession(fn)` path).
- [ ] App.jsx contains no `useState` for the nine fields; all writes go
      through actions; read-site names and dependency arrays unchanged
      (reviewable as a near-zero-noise diff outside the declaration block).
- [ ] `useAuthLifecycle` owns the four effects; App.jsx no longer contains
      `onAuthStateChange` / `resolveSessionWithRetry` / `checkIsAdmin` /
      `fetchTesterStatus` / `fetchOwnAccessProfile` **effect bodies**
      (handlers that call sync-lib functions remain).
- [ ] No circular imports (`src/stores/**` and `src/app/providers/auth.js`
      never import `App.jsx`); `npm run build` proves it.
- [ ] Blueprint §9 row added; original packet step 5 marked superseded;
      roadmap Phase 2 Complete with all commit hashes.
- [ ] Bundle: zustand ~1KB in main chunk; no new chunks; marketing pages
      still lazy.
- [ ] **Line-count note:** the original packet's "App.jsx reduced by ≥900
      lines" was an estimate that steps 1–5 cannot meet (steps 1–4 removed
      318; this phase removes roughly another 200–250). The criterion is
      restated as: every removed line accounted for by a move; no padding
      moves to chase a number. Real reduction lands in Phase 3.
- [ ] No changes outside the §3 ownership table.

## 7. Regression risks

1. **`useState` → Zustand semantics.** Both batch under React 18 automatic
   batching (including promise callbacks), and both give stable setter/action
   identities. The real differences: `getState()` reads current-not-queued
   values, and store state survives component unmount. Mitigations: never
   introduce `getState()` reads in moved code (closure capture only, §2.4);
   store lifetime — App never remounts within a page lifetime (`RootRouter`'s
   marketing/app choice is fixed per load; transitions are full navigations),
   and e2e tests start from fresh page loads. Verify the no-remount claim by
   inspecting `RootRouter.jsx` before commit 2; if App can remount, STOP.
2. **Store creation timing.** Import-time creation would read e2e/demo
   localStorage flags before `RootRouter`'s handoff consumption; the lazy
   singleton (§2.1) is mandatory, not a style choice.
3. **Stale-by-design `testerStatus`** in the auth effect's timing calls —
   must remain closure-captured with deps `[e2eMode]`; "fixing" it changes
   telemetry payloads and could mask/introduce ordering assumptions.
4. **`setShouldLaunchOverlay(false)` in the e2e branch** — App-owned; passed
   in and called at the same statement position so e2e boot ordering is
   byte-identical.
5. **Effect registration order.** Hook call sits at the auth effect's current
   source position; the only reorder is access-profile vs globalPacks
   (analyzed and accepted, §2.4). Any other reorder is a defect.
6. **Functional-update fidelity** — the `SIGNED_OUT` branch depends on
   `setSession((current) => …)`; a naive value-only action would break
   token-refresh events (`newSession` null, event ≠ SIGNED_OUT must keep the
   current session). Unit-test this exact case.
7. **Lint churn on moved code** — moved effects may carry existing
   exhaustive-deps warnings; warnings may move files but the error count must
   stay 0 and dep arrays byte-identical.
8. **Auth-timing e2e flake** — mitigated by `--workers=2` and the
   double-run after commit 4; known baseline failures listed in §5.

## 8. Rollback points

Four commits, each independently green; revert newest-first (later commits
import earlier ones). Trigger rollback if: any non-baseline e2e fails twice
on the same assertion; the intercept boot chain regresses in
`launcher-terminal-exhaustive`; `client_errors` shows a staging spike
traceable to the refactor; or a guardrail fails (no re-points are budgeted).
The store is in-memory only — no schema, storage, or data implications;
rollback is purely git. Commit 1 is safe to leave in place even if 2–4
revert (dead code, no consumers).

## 9. Sonnet execution prompt

```
You are implementing Phase 2b of the myBishBash architecture roadmap on
branch `staging`.

Read completely before touching anything:
1. docs/architecture/phase-02b-session-store.md (your work order)
2. docs/architecture/phase-02-composition-root.md (context: Decisions 1–5
   still bind; its step 5 is superseded by this packet)
3. docs/architecture/roadmap-status.md (the 2026-07-13 entanglement log)
4. docs/architecture-blueprint.md §9–§11
5. scripts/test-release-guardrails.mjs

Re-locate every symbol in the §2.3 disposition table BY NAME in src/App.jsx
and re-verify its consumer count with grep; on any mismatch with the table,
STOP and report. Verify no writer of the nine fields exists outside App.jsx.

Rules:
- Four commits, in order; the §5 gates after each; Playwright per §5.
- Moves are VERBATIM: no refactors, renames, dep-array edits, or hook
  reordering beyond the single documented micro-reorder.
- Store/hook modules must never import App.jsx.
- Actions must support functional updates (§2.1); unit-test the SIGNED_OUT
  functional-update path.
- The two baseline e2e failures in §5 are expected; anything else failing
  twice on one assertion is stop-the-line.
- Only zustand@^5 may be added.
- Update roadmap-status.md in commit 4 (Phase 2 → Complete + hashes + log).
  Push to staging only with all gates green.

Report: commit hashes, symbol dispositions actually applied, App.jsx
line-count delta, verification outputs (including the launch-timing spot
check), and anything that contradicted this packet.
```
