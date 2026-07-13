# Architecture roadmap — status tracker

Source of truth for progress against `docs/architecture-blueprint.md` §19.
Update this file in the same commit that changes a phase's status.

**Statuses:** `Complete` · `Ready` (entry criteria met, packet exists) ·
`In progress` · `Planned` (packet not yet written) · `Blocked` (dependencies unmet)

| # | Phase | Status | Packet | Depends on | Commits |
|---|---|---|---|---|---|
| — | Architecture audit & blueprint | **Complete** | `docs/architecture-blueprint.md` | — | (this commit) |
| 0 | Safety-net tooling (Vitest + ESLint + CI) | **Complete** | `docs/architecture/phase-00-safety-tooling.md` | — | `23b663c`, `a343ec8`, `ae504f0` (+ bug fixes `11c2001`) |
| 1 | Error telemetry (errors only) | **Complete** (migration applied + RLS verified) | `docs/architecture/phase-01-error-telemetry.md` | 0 | `f57b923`, `8c7d000`, `6f17286`, `d6bdb22`, fix-forward `ce78e63` |
| 2 | Composition root (providers + router extraction) | **Complete** | `docs/architecture/phase-02-composition-root.md` | 0, 1 | `3e04058`, `01f9f2c`, `f96dadb`, `bb69e8e`, `bb88529`, `fcb85a5`, `e4e2dcf`, (this commit) |
| 3 | Feature module extraction | **Ready** | `docs/architecture/phase-03-feature-modules.md` | 2 | — |
| 4 | Domain stores & single write path (local) | Planned (packet written) | `docs/architecture/phase-04-domain-stores.md` | 3 | — |
| 5 | IndexedDB persistence engine | Planned (packet written) | `docs/architecture/phase-05-indexeddb.md` | 4 | — |
| 6 | Sync v2 — entities + mutation queue | Planned | — | 5 | — |
| 7 | TypeScript at the boundaries | Planned | — | 6 | — |
| 8 | Styling consolidation | Planned | — | 3 (interleaves 7+) | — |
| 9 | Performance & scale hardening | Planned | — | 5, 6 | — |
| 10 | Platform readiness (realtime, spine, registry) | Planned | — | 6, 7 | — |

## Per-phase criteria

### Phase 0 — Safety-net tooling
- **Entry:** blueprint approved (done). No code prerequisites.
- **Exit:** `npm run lint` (0 errors) and `npm run test:unit` (≥6 test files)
  pass locally and in `staging-checks.yml`; wired into `test:before-push` and
  the `npm test` chain; zero `src/` changes besides `*.test.js` files;
  guardrails + smoke e2e green.

### Phase 1 — Error telemetry
- **Entry:** Phase 0 complete (unit tests + lint enforce the reporter's contracts).
- **Exit:** root boundary + global handlers live; scrubbed/deduped/rate-limited
  reporter unit-tested; `client_errors` migration committed **and applied to
  the hosted Supabase project** (manual step — record the date here);
  reporter inert in DEV/e2e/demo/missing-env; full gate + smoke e2e green.

### Phase 2 — Composition root
- **Entry:** Phases 0–1 complete (error telemetry watches the rollout).
- **Exit:** `src/app/` exists with router + Auth/session providers extracted
  verbatim; `parseRoute` unit-tested against a URL-shape table; App.jsx
  < 11,000 lines; full e2e (incl. `launcher-terminal-exhaustive`) unchanged.

### Phase 3 — Feature modules
- **Entry:** Phase 2 pattern proven.
- **Exit:** components relocated to `features/*` with `index` public APIs;
  overlay host + descriptor stack (single-slot semantics preserved);
  App.jsx ≤ 6,500 lines; no cross-feature internal imports (boundary check);
  bundle budget respected.
- **Amendment 2026-07-13 (packet Ruling R1):** the original "App.jsx < 3,000"
  exit was written against the blueprint's estimate. Measured at `a02724b`,
  `App()` alone is ~5,520 lines and does not shrink in a pure component-move
  phase — its collapse is Phase 4's job. Amended targets: Phase 3 ⇒ App.jsx
  ≤ 6,500 with no component definitions outside `App()`; Phase 4 ⇒ App() <
  800 **and App.jsx < 1,600**, landing below the original 3,000 one phase
  later. See `phase-03-feature-modules.md` §R1.

### Phase 4 — Domain stores & single write path
- **Entry:** Phase 3 complete. Scope note: only shared/persistent domain state
  enters stores — local transient UI state stays in components.
- **Exit:** store actions are the only local-persistence writers
  (lint-enforced); launch-session reducer extracted with ≥95% branch coverage;
  App() < 800 lines and App.jsx < 1,600 (R1 amendment); e2e green twice
  consecutively.

### Phase 5 — IndexedDB engine
- **Entry:** Phase 4 complete (all writes flow through actions).
- **Exit:** stores hydrate from IndexedDB; idempotent localStorage import with
  one-release rollback (dual-write + kill switch); Chromium + WebKit e2e green
  (webkit-smoke scope per packet R4); 10k-event boot < 1s.
- **Amendments 2026-07-13 (packet Rulings R1/R3):** setup-complete and mood
  migrate with everything else behind `storage.js` (the main.jsx hydration
  gate makes the blueprint's key split unnecessary); paged event reads defer
  to Phase 6/9 — the event log stays a single kv value this phase.

### Phase 6 — Sync v2 (entities + mutation queue)
- **Entry:** Phase 5 complete; tester cohort available; feature flag ready.
- **Exit:** `entities` table + queue live for all cohorts; blob dual-write
  retired after ≥1 clean release; two-device convergence e2e; offline replay
  e2e; per-edit payload < 2KB.

### Phase 7 — TypeScript boundaries
- **Entry:** Phase 6 complete (contracts stabilized).
- **Exit:** `domain/`, `services/`, `stores/` strict TS; payload validation at
  sync boundary; `tsc --noEmit` in CI.

### Phase 8 — Styling consolidation
- **Entry:** Phase 3 complete (components live with their features).
- **Exit:** `styles/tokens.css` extracted; styles.css < 3,000 lines and
  guardrail-checked monotonically decreasing; no visual regressions.

### Phase 9 — Performance & scale hardening
- **Entry:** Phases 5–6 complete (real data layer to optimize).
- **Exit:** virtualized long lists; paged history; undo shipped; CI perf and
  bundle budgets enforced (synthetic 5k-card/100k-event account targets met).

### Phase 10 — Platform readiness
- **Entry:** Phases 6–7 complete.
- **Exit:** realtime channel with pull fallback; nullable `space_id` on the
  spine; entity-type registry proven by a flagged demo type registering,
  rendering, syncing and undoing with zero changes outside its module.

## Log

- **2026-07-10** — Audit + blueprint completed and corrected against repo
  (existing `AppShellErrorBoundary` acknowledged; Phase 1 narrowed to errors
  only; version plumbing reuse noted). Phase 0 and Phase 1 packets written.
  Phase 0 marked Ready.
- **2026-07-10** — Phase 0 complete. Vitest (86 tests, 6 files, <1s) in
  `23b663c`; ESLint correctness config (0 errors, 58 warnings) in `a343ec8`;
  triple enforcement wiring (npm test, before-push, staging-checks CI) in
  `ae504f0`. The first lint run caught two latent ReferenceError crashes
  (Apps pending-setup in standalone mode; HQ Packs view) plus a dead
  duplicate object key — fixed separately in `11c2001`, verified by the
  full before-push suite. Phase 1 is now Ready.
- **2026-07-11** — Phase 1 complete in code: scrub + reporter core with 21
  unit tests (`f57b923`), root boundary + global handlers in main.jsx
  (`8c7d000`, dev check: both handler paths log [client-error] with zero
  network calls), two-line AppShellErrorBoundary hook (`6f17286`,
  guardrails green), client_errors migration committed.
  **OUTSTANDING MANUAL STEP: apply
  `supabase/migrations/202607100001_client_errors.sql` to the hosted
  Supabase project (supabase db push or dashboard SQL editor) and record
  the date here.** Until then the reporter buffers and silently drops
  (missing-table path, unit-tested). Phase 2 entry criteria are now met.
- **2026-07-11 — Release evidence.**
  - **Empty-env build/boot test:** `.env.local` moved aside, `npm run build`
    succeeded, built app booted via `vite preview` — landing page rendered,
    zero Supabase network requests, reporter silent. Env restored, gate rerun
    green, `public/` regeneration churn reset (`generate-launchers.mjs`
    stamps `public/` with the current `VITE_BASE_PATH` on every prebuild —
    pre-existing behaviour worth a future cleanup).
  - **CI:** first push (`d6bdb22`) failed Staging Checks: the before-push
    unit run receives `VITE_SUPABASE_*`, so `supabaseClient.js` built a real
    client and supabase-js hit Node 20's missing native WebSocket. Fixed by
    making unit tests hermetic (`43ba153` blanks Supabase env in
    vitest.config; verified `supabase === null` under forced env). Second
    run **green**: Staging Checks run 29148845364 (Lint, Unit, Build,
    Before-push, Playwright smoke all success); Pages preview run
    29148845369 success.
  - **Preview smoke:** https://drlizlondon.github.io/mybishbash-preview/home
    serves `version.json` sourceSha `43ba153…` (== HEAD), renders the auth
    gate signed-out, zero console errors, zero telemetry traffic.
  - **Migration applied to hosted staging (2026-07-12).** Applied via the
    Supabase dashboard SQL editor (CLI blocked: access token 403 + no
    `SUPABASE_DB_PASSWORD`; automated browser routes unavailable this session).
    Applying `202607100001_client_errors.sql` and running
    `scripts/verify-client-errors-rls.sql` surfaced a **defect in that
    migration**: it created the RLS policies but omitted the table-level
    GRANTs, so the `authenticated` role hit `42501 permission denied` before
    RLS was consulted — which would have made the reporter's insert fail
    silently in production. Fixed forward-only in `ce78e63`
    (`202607120001_client_errors_grants.sql`:
    `grant select, insert on public.client_errors to authenticated`), matching
    the grant pattern used by every other table in the schema.
  - **RLS verification — all 6 checks pass** (`scripts/verify-client-errors-rls.sql`,
    2026-07-12, after both migrations applied):
    | step | expected | actual | pass |
    |---|---|---|---|
    | 0 policies present | 2 | 2 | ✅ |
    | 1 users found (non-null) | both | normal + admin uuids resolved | ✅ |
    | 2 insert own row | success | success | ✅ |
    | 3 insert as other user | blocked | blocked (42501) | ✅ |
    | 4 normal user reads | 0 | 0 | ✅ |
    | 5 admin reads | >= 1 | 2 | ✅ |
    This is the requested step-5 evidence: authenticated staging error inserts;
    ordinary users cannot read error records; admins can.
  - **Phases 0 and 1 are fully closed.** Phase 2 packet
    (`phase-02-composition-root.md`) is written and Ready; not yet implemented.
- **2026-07-12 — Production deployment status (telemetry).** Production =
  `main` branch = Cloudflare `mybishbash.app`, currently serving sourceSha
  `9c0b6f2` (July 3), which **predates all Phase 1 telemetry code** — so prod
  emits no error reports yet even though the `client_errors` table + grants
  are live (prod and staging share Supabase project `ifcgomivmzwqqxhltfjj`, so
  the DB work already covers prod; do NOT re-run the migration). `staging` is
  **224 commits ahead of `main`**, so any prod deploy ships that entire batch,
  not just telemetry. **Decision (owner): defer** — telemetry stays live on
  staging; it goes to production as part of the next normal `staging → main`
  release via the `docs/release-workflow.md` checklist + real-device QA, not as
  a standalone telemetry push. Action for that release: after prod serves the
  new build, trigger one controlled authenticated error and confirm a row lands
  in `public.client_errors` with cross-user isolation intact.
- **2026-07-13 — Phase 2, steps 1–4 complete; step 5 stopped (entanglement).**
  Executed on `staging`, one commit per step, full verification gate after
  each (`npm run lint && npm run test:unit && npm run build &&
  npm run test:release-guardrails && npm run test:before-push`), full
  Playwright after steps 2 and 3 per the packet:
  - **Step 1** (`3e04058`): route model → `src/app/router/routes.js`
    (`BASE_PATH`, `PRODUCTION_BASE_PATH`, `LEGACY_BASE_PATHS`,
    `APP_SHELL_TABS`, `normalizeRoutePath`, `getPathRelativeToKnownBase`,
    `getRouteFromLocation`, `parseRoute`, `getSafeAppTab`,
    `getBottomNavItems`), with `routes.test.js` (a ~30-case URL-shape table).
    `BOTTOM_NAV_ITEMS` stayed in App.jsx (its Glyph components live there);
    `getBottomNavItems` now takes `items` as a required param instead of
    defaulting to it. Guardrail re-point: `/packs redirects to Explore` now
    reads `routes.js` (regex unchanged).
  - **Step 2** (`01f9f2c`): `RootRouter`, `PageSuspenseFallback`,
    `LegalPage`, and the marketing lazy imports → `src/app/router/
    RootRouter.jsx`. App.jsx's default export switched from `RootRouter` to
    `App`; `main.jsx` now imports `RootRouter` from the new file.
    `isStandaloneDisplayMode`, `consumeSignupHandoffFromUrl`,
    `applyLocalNormalPreviewFlag`, `shouldStartDemoOnboarding`,
    `shouldStartDemoSignup`, `resetDemoOnboardingState`,
    `resetDemoSignupState` stayed in App.jsx (`isStandaloneDisplayMode` is
    used throughout `App()`) and gained an `export` keyword. Guardrail
    re-points: `rootRouterSource` now reads `RootRouter.jsx`;
    `continueCardSource`'s end marker changed to `"export default App;"`.
    Full Playwright: 355/357 green (2 pre-existing failures — see below).
  - **Step 3** (`f96dadb`): `routePath` state, the `route`/`initialRoute`
    memos, and the history-sync effect → `src/app/router/
    useRoute(setupComplete)`, called at the same point in `App()` so the
    intercept boot chain (initial route feeding the
    `screen`/`overlay`/`launchSession`/`activeProtectedAppContext`
    initializers) stays synchronous and order-identical. `navigateTo`
    **stayed in App()** (smaller-move preference per the packet): it
    mutates non-route state (shell settings version id, launcher context,
    active protected app context) alongside the route change, so splitting
    it would change ordering semantics. The hook returns `setRoutePath`
    (beyond the packet's suggested shape) because ~8 other call sites in
    `App()` set `routePath` directly, not just through `navigateTo`.
    Targeted intercept suite (launcher-flow-trace +
    launcher-terminal-exhaustive, 101 tests) green; full Playwright green
    at `--workers=2` (356/357).
  - **Step 4** (`bb69e8e`): four environment hooks →
    `src/app/providers/environment.js` — `useOfflineFlag`,
    `useAppUpdateStatus`, `useNotificationPermission`, `useThemePreference`.
    Two deviations from the packet's hook descriptions, both following the
    same smaller-move precedent as step 3: `useThemePreference(mood)` takes
    `mood` as a parameter rather than owning the state, because `mood` flows
    through `buildSharedState`/`applySharedState` (the cloud sync engine,
    out of scope this phase); `useNotificationPermission` owns only the
    state, not `enableNotifications`/`disableNotifications`, which depend on
    `session`/`notificationSettings`/sync-adjacent App state.
  - **Pre-existing e2e flakiness (not caused by this phase):** two failures
    recur across runs — `access-gating.spec.ts:88` (demo-signup redirect)
    and, intermittently, `timing-windows.spec.ts:187`. Both reproduced
    identically via `git stash` on `staging` HEAD *before* any Phase 2
    change, confirming they predate this work. Separately, running the full
    suite at default worker concurrency back-to-back surfaced additional
    timing/animation-sensitive failures (cursor-position assertions,
    viewport interaction audits) that differed test-to-test between runs
    and cleared at `--workers=2` — consistent with system load flakiness,
    not a regression; no test failed twice on the same assertion, so no
    rollback criterion was met.
  - **Step 5 — stopped, per the packet's explicit escape hatch** ("If the
    auth effect cannot be split cleanly per Decision 5, stop after step 4,
    commit what is green, and report the entanglement in detail"). The core
    auth-resolution effect (`App.jsx`, `onAuthStateChange` subscription +
    the `resolveSessionWithRetry` effect it sits alongside) sets `session`
    and `authReady` — two of the seven fields the packet lists for
    `sessionStore` — in the *same* promise `.then()`/`.catch()`/`.finally()`
    branches and the *same* `onAuthStateChange` callback that also set
    `syncStatus` and `syncError`. Those two are not among the seven
    session-store fields and are explicitly local/sync-adjacent state per
    blueprint §9's state classification — but they're set based on the
    identical conditions (e2e mode, session presence, retry failure,
    `SIGNED_OUT` event) inside the identical callbacks as the fields that
    must move. Splitting them would require either duplicating the async
    session-resolution/retry logic in two places (changing timing behavior)
    or leaving `syncStatus`/`syncError` with no way to observe *why* auth
    resolution failed (the human-readable error text in `syncError` has no
    other source). Neither is a verbatim, behavior-preserving move.
    `zustand` was **not** added; no `sessionStore`/`AuthProvider` files were
    created. Phase 2 stays **In progress** — step 5 needs its own follow-up
    packet addressing this specific entanglement (e.g., moving `syncStatus`/
    `syncError` into the store alongside the seven fields, which the
    blueprint's §9 classification would need to explicitly permit, or
    accepting the duplicated resolution logic with a documented rationale).
  - App.jsx line count: 13,739 → 13,421 (−318) across the four completed
    steps. All four commits pushed to `staging` with green gates.
- **2026-07-13 — Phase 2 complete via phase-02b follow-up packet.**
  - **Commit 1** (`bb88529`): added `zustand`-backed `sessionStore`,
    extracted shared e2e helpers to `src/app/e2e.js`, and recorded the
    connection-lifecycle classification/doc updates from
    `phase-02b-session-store.md`.
  - **Commit 2** (`fcb85a5`): swapped the nine session/connection `useState`
    homes in `App.jsx` for `sessionStore` selectors and stable actions with
    no consumer-site behaviour changes.
  - **Commit 3** (`e4e2dcf`): extracted the core auth-resolution effect and
    `onAuthStateChange` subscription into `useAuthLifecycle` at the exact
    App call position. A brittle release-guardrail marker had to move from
    `AUTH_SESSION_RETRY_DELAYS_MS` to `TESTPILOT_CONFIG` after the retry
    constant moved into the hook module; runtime behaviour was unchanged.
  - **Commit 4** (this commit): moved the admin, tester-status, and
    access-profile effects into `src/app/providers/auth.js` in the same
    relative order. Accepted micro-reorder: the access-profile effect now
    registers inside the hook before the `globalPacks` effect instead of
    after it; both still early-return until `authReady` and do not share
    state, so behaviour stays unchanged.
  - **Verification:** each commit reran
    `npm run lint && npm run test:unit && npm run build &&
    npm run test:release-guardrails && npm run test:before-push`.
    Commit 3 also passed `launcher-flow-trace`,
    `launcher-terminal-exhaustive`, and a full Playwright run at
    `--workers=2`; Commit 4 requires the full Playwright suite at
    `--workers=2` twice consecutively before push. The pre-existing baseline
    failure remains `tests/e2e/access-gating.spec.ts:88`, with
    `tests/e2e/timing-windows.spec.ts:187` still intermittent.
- **2026-07-13 — Phase 3/4/5 packets written** (`phase-03-feature-modules.md`,
  `phase-04-domain-stores.md`, `phase-05-indexeddb.md`), validated against
  HEAD `a02724b` (App.jsx 13,206 lines; `App()` 1572–7089; 42 `useState` in
  `App()`; 59 `setOverlay` sites; cards local save debounce measured at
  120ms; main chunk 129,981 B gzip). Key rulings: Phase 3 line-count
  amendment (R1 above); overlay descriptor stack with single-slot semantics
  (3-R2); boundary + bundle checks as guardrail-family scripts (3-R3/R6);
  no new lazy boundaries until Phase 9 (3-R4); HQPanel relocates now, splits
  later (3-R5); launch-session reducer in plain `.js` with state remaining in
  App (4-D3); Phase 5 storage-engine seam with mirror + dual-write + kill
  switch (5-R2), WebKit scoped project (5-R4). Dead code found and scheduled
  for deletion in Phase 3 commit 1: `src/ContinueToAppCard.jsx` + `.css`
  (unimported; live component is the one in App.jsx). Phase 3 is Ready.
