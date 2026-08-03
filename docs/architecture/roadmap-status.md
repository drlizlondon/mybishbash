# Architecture roadmap — status tracker

Source of truth for progress against `docs/architecture-blueprint.md` §19.
Update this file in the same commit that changes a phase's status.

**Statuses:** `Complete` · `Ready` (entry criteria met, packet exists) ·
`In progress` · `Planned` (packet not yet written) · `Blocked` (entry criteria or
prerequisites unmet)

| # | Phase | Status | Packet | Depends on | Commits |
|---|---|---|---|---|---|
| — | Architecture audit & blueprint | **Complete** | `docs/architecture-blueprint.md` | — | (this commit) |
| 0 | Safety-net tooling (Vitest + ESLint + CI) | **Complete** | `docs/architecture/phase-00-safety-tooling.md` | — | `23b663c`, `a343ec8`, `ae504f0` (+ bug fixes `11c2001`) |
| 1 | Error telemetry (errors only) | **Complete** (migration applied + RLS verified) | `docs/architecture/phase-01-error-telemetry.md` | 0 | `f57b923`, `8c7d000`, `6f17286`, `d6bdb22`, fix-forward `ce78e63` |
| 2 | Composition root (providers + router extraction) | **Complete** | `docs/architecture/phase-02-composition-root.md` | 0, 1 | `3e04058`, `01f9f2c`, `f96dadb`, `bb69e8e`, `bb88529`, `fcb85a5`, `e4e2dcf`, (this commit) |
| 3 | Feature module extraction | **Complete** | `docs/architecture/phase-03-feature-modules.md` | 2 | `de84491`, `50f2929`, `047c4e3`, `be55de1`, `200ea5b`, `199775d`, `872784f`, `54ed50c`, (this commit) |
| 4 | Domain stores & single write path (local) | **Complete** (D5 ratchet `08e776d`) | `docs/architecture/phase-04-domain-stores.md` | 3 | `85f5286`, `a4357f7`, `382379d`, `b732e8c`, `6c995f3`, `08e776d` |
| 4b | Card & commitment handler extraction | **Complete** | `docs/architecture/phase-04b-card-handlers.md` | 4 | `95a4db8`, `e96aff7`, `5ca6563`, `f8cfa41`, `816f240` |
| 4c | Launcher-engine extraction | **Closed — measured, not moved** (conditional) | `docs/architecture/phase-04c-launcher-engine.md` | 4b | `f3e7899`, `24ad5b5` |
| 5 | IndexedDB persistence engine | **Blocked** (planned implementation and kill-switch replay-authority correction landed; two founder-operated manual records outstanding) | `docs/architecture/phase-05-indexeddb.md` | 4, 4b | `d2401d5`, `e7cd249`, `088181e`, `54b6831`, `cf69528`, `c839c72`, `086af6b`, `64fa40a`, correction: this commit |
| 6 | Sync v2 — entities + mutation queue | **Blocked** (default-blob rollout control deployed and target ledger row reconciled; Phase 5 manual evidence and qualifying tester cohort absent) | `docs/architecture/phase-06-sync-v2.md` | 5 | packet: `47ef32c`; preflight 0: `def28dc` |
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

### Phase 4 — Domain stores & single write path — **COMPLETE (D5 enforcement delivered 2026-07-27)**
- ⚠️ **Correction and resolution:** Phase 4 was closed prematurely — the D5
  write-path lint rule was never implemented (planned commit 13 does not exist;
  closing commit `b732e8c` is docs-only). Criterion 6 was **reopened, not
  waived**, and has since been **met** by the D5 ratchet commit `08e776d`:
  `no-restricted-syntax` scoped to `src/features/**`, `src/components/**`,
  `src/editing/**` and `src/App.jsx`, with 26 pre-existing write sites
  enumerated as classified debt, each exception keyed to one exact file AND one
  exact storage key. No directory-wide or wildcard exemptions. Proven in both
  directions: a new/copied write fails, and deleting any single exception line
  while its legacy write remains also fails. Only four sites are genuine
  DOMAIN-DEBT owed a store action; relocating them is a separate packet.
  See `phase-04-domain-stores.md` §"D5 ratchet — delivered".
- **Entry:** Phase 3 complete. Scope note: only shared/persistent domain state
  enters stores — local transient UI state stays in components.
- **Exit as amended:** store actions are the only local-persistence writers
  (lint-enforced); launch-session reducer extracted with ≥95% branch coverage
  (achieved 100%); **Ruling R2** replaced `App() < 800`, and R2's own criterion
  1 (`App() < 2,600`) was then **waived** at measured 5,404 — see
  `phase-04-domain-stores.md` "Phase 4 closure". R2 criteria 2–5 met with
  evidence.
- **Closing commits:** `85f5286`, `a4357f7`, `382379d`. Suite 358 passed / 1
  failed (`access-gating.spec.ts:88`, documented Phase 2b baseline).
- **Structural finding:** de-prop-drilling is not a size lever — commits 9–12
  moved a net 67 lines out of `App()`. The mass is handler bodies (690), the
  JSX return (563), and the launcher engine (586). **The waiver does not make
  that work optional** — it is carried by Phases 4b and 4c.

### Phase 4b — Card & commitment handler extraction — **COMPLETE 2026-07-27**
- **Packet:** `docs/architecture/phase-04b-card-handlers.md`
- **Entry:** Phase 4 complete, D5 ratchet landed. **Blocked Phase 5; now clear.**
- **Exit — met.** All eight named handlers (690 measured lines) live in
  `src/features/cards/useCardActions.js` (4 handlers, 356 lines of handler body)
  and `src/features/commitments/useCommitmentActions.js` (4 handlers, 334 lines).
  Zero remain in `App()`, verified by per-symbol grep. Each hook takes an
  explicit dependency object and closes over nothing in App scope.
- **Commits:** `95a4db8`, `e96aff7`, `5ca6563`, `f8cfa41`, plus this closure.
  Prerequisite D5 ratchet: `08e776d`.
- **Measured:** `App.jsx` 6,383 → 5,725; `App()` 5,404 → 4,746. Against the
  packet's ≈4,700 prediction the residual is **+46 lines**, accounted for by the
  two hook call sites (26 lines of explicit dependency object) and the blank-line
  seams left where the handlers were removed. No extra code was moved to close
  the gap — the packet declares 4,700 a predicted consequence, not a target.
- **Tests:** 54 new unit tests (23 + 31), every handler carrying a recorded
  mutation that makes its test fail. localStorage byte-comparison harness
  (`tests/e2e/localstorage-bytes.spec.ts` + checked-in baseline) run at every
  commit: **empty diff throughout**. Full suite twice consecutively, minus the
  documented `access-gating.spec.ts:88` baseline.
- **Two R7 re-points were required**, contradicting the packet's prediction of
  none: `test-release-guardrails.mjs:147` and `test-launcher-flow.mjs:247` pin
  the moved code by BODY, not by name, so the packet's name-grep could not find
  them. Both re-pointed with a paired `assertNoMatch`/`doesNotMatch` against
  `appSource`. **Phase 4c must grep guardrails for handler bodies, not just
  handler names.**

### Phase 4c — Launcher-engine extraction — **CLOSED 2026-07-28 "measured, not moved" (conditional, not abandoned)**
- **Zero extraction performed.** No production file was modified; `App()` and
  `App.jsx` are unchanged at 4,744 / 5,725. Commit `f3e7899` is test-script +
  docs only.
- **Gate outcome:** the re-entrancy invariant **cannot be tested in isolation**.
  Both halves of the property live in the launch-decision effect, which the
  packet declares STAYS — not in the seven extractable functions. Recovery
  re-entry is an inline guard at `App.jsx:2848`; destination once-only is **not
  in `openDestinationApp` at all** (its body has no re-entrancy guard and calls
  `window.location.assign(href)` unconditionally) but is supplied by callers,
  chiefly `pauseBypassInitiatedRef`. Isolating either would require lifting guard
  predicates out of the effect — for the destination half that is **new
  production behaviour**, which "no behaviour change whatsoever" forbids.
- **What IS mutation-proven:** forcing the `pauseBypassInitiatedRef` guard open
  makes `pause-launcher.spec.ts:266` fail (expected 1 navigation attempt,
  received 3); reverting restores 43 passed. A genuine two-direction proof — but
  by an existing Playwright spec, not an isolated test. Removing the
  `standaloneRecoveryInFlightRef` guard produces **no** failure: it is
  defence-in-depth behind the route change and
  `consumeStandaloneLauncherRecoverySuppression()`, consistent with Phase 4's
  finding that the dependency fix was independently sufficient.
- **LIVE DEFECT FOUND AND FIXED (`f3e7899`):** the guardrail labelled
  *"openDestinationApp is the single destination href assignment"* — the repo's
  central security-shaped invariant — **was vacuous.** It used `assertMatch`
  (existence-only), so adding a second `window.location.assign(href)` left every
  guardrail script passing. Replaced with a count assertion plus an enumeration
  of every navigation sink in `App.jsx`. Independently re-verified: a duplicated
  sink fails with `found 2`; a second sink under a **different name**
  (`sneakyHref`) passes the count but fails the enumeration — the evasion the old
  form could never catch. Enumerated sinks: `href` (openDestinationApp),
  `fallbackHref` (scheduleNativeSchemeFallback), `url` (openExternalActionUrl).
  **Invariant 1 of this packet is therefore satisfied today, with no extraction.**
- **Method trap to carry forward:** Playwright's `reuseExistingServer` served a
  **stale bundle**, making a mutation look inert. Detected via the bundle content
  hash. Any future mutation proof in this repo must verify the hash changed.
- **RULING 2026-07-28 — CLOSED as "measured, not moved". Conditional, NOT
  abandoned.** Proceed to Phase 5. **Revisit 4c only if Phase 5 produces concrete
  architectural evidence that separating the engine is required** — do not reopen
  it merely to bank a structural refactor. Standing decision: **no new production
  seam or guard will be added purely to make the extraction testable.**
- **Permanent gates established here (keep):** the browser-level re-entrancy
  regression test (`pause-launcher.spec.ts:266`, sensitive in both directions),
  and the strengthened navigation guardrail (count + complete sink enumeration).
  Both proving mutations stay documented in the packet as evidence the guardrail
  catches obvious and evasive violations.
- **Mandatory method rule for all future mutation testing:** verify the served
  bundle hash changed before trusting a result — `reuseExistingServer` served a
  stale build here and made a mutation look inert.

### Phase 5 — IndexedDB engine
- **Entry:** Phase 4 complete (all writes flow through actions) **AND Phase 4b
  complete — HARD BLOCKER.** `handleSaveCard` and the commitment persistence
  handlers must be out of `App()` before any synchronous save becomes async;
  doing both in one diff combines persistence risk with structural risk. See
  `phase-04-domain-stores.md` "Sequencing constraint".
- **Exit:** stores hydrate from IndexedDB; idempotent localStorage import with
  one-release rollback (dual-write + kill switch); Chromium + WebKit e2e green
  (webkit-smoke scope per packet R4); 10k-event boot < 1s.
- **Amendments 2026-07-13 (packet Rulings R1/R3):** setup-complete and mood
  migrate with everything else behind `storage.js` (the main.jsx hydration
  gate makes the blueprint's key split unnecessary); paged event reads defer
  to Phase 6/9 — the event log stays a single kv value this phase. Blueprint
  §19 Phase 5 carries the same amendments plus R4 as of commit 1.
- **Commits 1–6 complete 2026-07-31; dual-write retired after its release
  gate.** The IndexedDB wrapper, mechanically single storage funnel, engine
  seam, pre-render hydration gate, marker-last migration, default-IDB cutover,
  kill switch, Chromium + WebKit migration e2e, and the dual-write-retirement
  guardrail are landed. The 10,000-event gate measures the second boot after
  migration: Chromium **832.2 ms** (<1,000 ms) and WebKit **781.0 ms**
  (<1,000 ms locally; <1,500 ms CI allowance). `test:perf-boot` is wired into
  `test:release`.
  **Entry-condition evidence:** staging release
  `preview-086af6b2cc28755b603fe313dc123a68b5aac8b8` (source
  `086af6b2cc28755b603fe313dc123a68b5aac8b8`; deploy run `30588984252`,
  staging-check run `30588984247`) completed its release cycle from
  `2026-07-30T22:58:59.087Z` through `2026-07-30T23:37:26.184893Z`. Review of
  `client_errors` for that release window found **0 total rows and 0
  storage-attributed rows**; review of `tester_reports` for the same window
  found **0 total reports and 0 reports of data loss**. The rollback window
  closed 2026-07-31. Commit 6 also corrects the recovery authority that changed
  at retirement: an IDB write or flush failure no longer publishes a replay
  marker, because localStorage is no longer a current fallback source and
  replaying it could overwrite newer IDB state. Legacy-engine mutations and
  all-sink clear were intended to remain the only authoritative reasons to
  request reconciliation; the isolated engine-selection and fallback paths do
  not publish authority. The 2026-08-02 finding below proves the whole-app
  kill-switch boot violates that intended boundary through an automatic
  first-render write. An all-sink clear temporarily serves the already-cleared legacy
  sink while its observed IDB deletes settle. A fully durable clear either
  acknowledges an unchanged generation or exactly imports its own same-session
  reset writes before restoring IDB; a failed, timed-out, or externally
  superseded clear stays in legacy mode so the replay source remains exact.
  External-navigation persistence now also flushes the IDB write before the
  install fallback leaves the document. Unit and source guardrails cover
  successful clear → newer IDB write → reload, same-session reset writes,
  delete failure, flush timeout, and an external concurrent generation. This
  correction belongs to Commit 6 because only dual-write retirement makes the
  localStorage rollback copy stale. Rollback after this point requires a
  fix-forward that re-enables dual-write first.
- **Acceptance-evidence reconciliation (2026-08-01):** successful Staging
  Checks runs `30564529648` at `c839c72` and `30596412262` at `64fa40a`
  objectively cover the named Chromium migration and WebKit persistence
  steps. The performance and Commit 6 release-window evidence above are also
  complete. A current isolated `test:release` (446 Playwright tests),
  Cloudflare production build, and `npx cap sync` also pass. No dated record
  exists for the manual staging kill-switch exercise or the native
  iOS/WKWebView seeded-data install-over-upgrade exercise.
  `npx cap sync` cannot prove the latter while the wrapper loads a live
  `server.url`. Precise resumable founder/human procedures were prepared on
  2026-08-02 in
  `docs/release-evidence/phase-05/manual-verification-packet-2026-08-02.md`,
  including a packaged `capacitor://localhost` over-install. No result is
  recorded. Inspection and an automated fresh-profile browser reproduction at
  `ec4f715` additionally found that the first kill-switch render
  unconditionally writes the action-card defaults version, advancing
  whole-snapshot replay authority before a human edit. The packet records this
  runtime blocker. The safety issue and two manual acceptance items remain hard
  blockers for Phase 6 readiness; see the Phase 6 preflight evidence.
- **Commit 1.5 landed 2026-07-29 — the funnel is now actually single.** A
  standalone, behaviour-preserving refactor closing the five bypasses the
  audit found (finding 1 below), executed **before** any engine seam so the
  seam lands on a premise that is true. `getStorageItem`/`setStorageItem` are
  now exported and joined by `removeStorageItem`; `storage.js`'s app-pause
  helpers and `clearSharedMyBishBashState`, `eventLog.js` (its private
  duplicate of the funnel deleted), `stores/settingsStore.js` and
  `lib/mybishbashSync.js`'s E2E shared-state bridge all route through them.
  Byte-identity proved by `src/storage.funnel.bytes.test.js` against a
  baseline captured at the pre-refactor commit: identical write/remove log,
  identical final store, identical read log across six scenarios. 15 focused
  tests in `src/storage.funnel.test.js`, each pinning the funnel's observable
  legacy-prefix contract rather than a call site's text.
  - **`app-pauses` uses the normal funnel** — no special-cased no-shim path.
    `bishbash.app-pauses.v1` has never been written by any build (0 commits),
    so the distinction has no observable value.
  - **The E2E sync bridge now uses the funnel but remains architecturally
    separate from the future persistence engine.** Whether it should operate
    *through* the engine is a **Phase 6 (sync) question and is explicitly NOT
    decided here** — 1.5 deliberately makes no commitment either way.
  - **Still open for commit 2:** `src/App.jsx`'s demo/e2e reset helpers
    directly remove eight `SHARED_STORAGE_KEYS` and directly write
    `setup-complete`/`profile`. TEST-FLAG debt, outside 1.5's ruled scope, and
    the last known direct access to shared production keys in the repo.
    **CLOSED by commit 1.6 — see below.**
- **Commit 1.6 landed 2026-07-29 — the funnel is now mechanically single, and
  this was Lizzie's stated precondition for commit 2.** After 1.5 the
  singleness was held by convention and tests only: the D5 ratchet covers
  `src/features/**`, `src/components/**`, `src/editing/**` and `src/App.jsx`,
  and polices **writes only** — it would not have caught a new direct **read**
  of an owned key in `src/lib/` or `src/stores/`, the exact shape of two of the
  five bypasses 1.5 repaired. Ruling: **commit 2 may only begin once the reset
  path is funnelled AND read-side bypasses are mechanically blocked.** Both are
  now done.
  - **Reset path funnelled.** `resetDemoSignupState`/`resetDemoOnboardingState`
    route their eight owned keys through `removeStorageItem` and their two seed
    writes through `setStorageItem`, via a `FUNNELLED_DEMO_RESET_KEYS` set and a
    per-key dispatcher that preserves the original call order. The
    `MYBISHBASH_*` flags and the two onboarding handoff keys stay direct — they
    are not storage.js-owned and are read pre-hydration (Ruling R1). Under the
    idb engine the old code would have cleared localStorage while leaving the
    mirror and IDB populated: a demo reset that does not reset.
  - **Read-side ratchet added** to `eslint.config.js`, mirroring D5's shape:
    a direct `localStorage.getItem` of a storage.js-owned key (exactly
    `SHARED_STORAGE_KEYS` + their `bishbash.` legacy twins) is an error across
    **all of `src/**`**. Scoped to owned keys only, so the app's many legitimate
    direct reads (R1 flags, device-local keys, diagnostic buffers, Supabase
    session) do not fire. Out of scope by design: `src/storage.js`,
    `src/services/db/**`, `src/**/*.test.*`.
  - **The read-exception table is EMPTY**, and that is the finding: `src/**` now
    contains no direct read of an owned key at all. Two D5 *write* exceptions
    (`setup-complete`, `profile` in `App.jsx`) were retired outright.
  - **Both proof directions run and recorded:** adding a new owned-key read in
    `src/lib/`/`src/stores/` takes lint from 0 → 3 errors; adding one exact
    exception line drops it to 2 (silencing only that call, not even the
    legacy-prefix read in the same file); deleting that line returns it to 3.
    A `MYBISHBASH_E2E_MODE` read never fires. Byte-identity for both reset
    helpers proved against a baseline captured at the pre-refactor `App.jsx`.
  - **Known limit, recorded not hidden:** a key reached via a variable
    (`getItem(SOME_KEY)`) is not matched — ESLint selectors cannot resolve a
    constant's value. Same limit D5 has. Mitigated by `storage.js` exporting no
    key constants; a real fix needs type-aware lint (Phase 7).
- **Packet audit findings (2026-07-28, before commit 1) — read before commit 2.**
  The packet was written pre-Phase-4/4b/4c; these of its claims no longer hold:
  1. **"`getStorageItem`/`setStorageItem` … already the single read/write
     funnel — verified" (R2) is false.** Bypasses that touch
     `SHARED_STORAGE_KEYS` directly: `storage.js` app-pause helpers
     (`getAppPausesMap`/`saveAppPausesMap`, `mybishbash.app-pauses.v1` — also
     the one shared key with no legacy-prefix shim) and
     `clearSharedMyBishBashState`; **all** of `eventLog.js`, which carries its
     own private duplicate of the funnel including the legacy shim, not the
     "direct `window.localStorage` calls" the packet describes;
     `stores/settingsStore.js:27` (`mybishbash.launcher-behavior-settings.v1`);
     and `lib/mybishbashSync.js:355–373`, which reads **13** shared keys for
     the E2E shared-state bridge. Commit 2 must funnel these or the idb engine
     silently splits the brain. `storage.js` cannot simply *import* from
     `eventLog.js`'s copy — R2's "import the funnel from storage.js" requires
     exporting two currently module-private functions.
     **RESOLVED by commit 1.5 (2026-07-29)** — all five closed; the two
     functions are exported and a third, `removeStorageItem`, was added.
  2. **Packet's D5 description is wrong about the mechanism.** It claims the
     write-path lint rule has "an allowlist [that] already names `storage.js`,
     `eventLog.js`, `services/**`". It does not. The D5 ratchet is *scoped* to
     `src/features/**`, `src/components/**`, `src/editing/**`, `src/App.jsx`
     with per-file/per-key exceptions. `services/db` is legal because it is out
     of scope, not because it is allowlisted. Same outcome, different mechanism
     — commit 6's proposed guardrail must not assume an allowlist exists.
  3. **`vitest.setup.js` was not optional.** `vitest.config.js` had no
     `setupFiles` and runs `environment: "node"`, so `fake-indexeddb/auto`
     needed a new setup file, not a conditional one.
  4. **`localstorage-bytes.spec.ts` postdates the packet** and is the largest
     dual-write-dependent e2e assertion in the repo: a Phase 4b invariant
     comparing exact localStorage bytes for six shared keys against a committed
     baseline. It is a free byte-identity proof for the commit-4 migration, and
     it **breaks at commit 6** when dual-write retires. Commit 4's enumeration
     must list it first.
  5. **The D5 debt table already assigns Phase 5 an obligation the packet omits:**
     `src/features/launcher/launchSessionStorage.js` is annotated "relocate to
     `services/` in Phase 5". R1 correctly keeps its keys on localStorage
     (synchronous `useState` initializers), so the obligation is a *file move*,
     not a migration — but the packet never mentions it.
  6. **Minor staleness:** `main.jsx` now also runs `installGlobalErrorHandlers()`
     first and `registerServiceWorker()` before render (commit 3 must preserve
     both); the roadmap's own Phase 5 Exit line says "stores hydrate from
     IndexedDB", which the packet's mirror design satisfies only indirectly —
     stores are explicitly unchanged.
  7. **Confirmed still accurate:** `storage.js` 538 lines, `eventLog.js` 216
     lines, `SHARED_STORAGE_KEYS` 20 entries, single Chromium Playwright
     project on `127.0.0.1:4173/mybishbash`, no `idb` dependency.
- **Non-vacuity note (commit 1).** The packet mandates "a per-key promise chain
  guaranteeing put ordering". A mutation test (bypass `chainWrite`, run the
  suite) showed ordering tests passing **either way**: IndexedDB already
  serialises same-scope readwrite transactions in creation order, and every
  write here creates its transaction immediately. The chain is therefore
  redundant *for ordering alone* today. It is kept — it makes the guarantee
  independent of code shape, and it is the only thing that makes fire-and-forget
  writes awaitable (`flushWrites`, which commit 2's hydration and tests need) —
  but the tests now claim only what they prove: a separate
  "write-chain observability" group fails (5 tests) under the bypass mutation,
  while the ordering tests are labelled behavioural coverage, not a chain proof.

### Phase 6 — Sync v2 (entities + mutation queue)
- **Entry:** Phase 5 complete; execution packet exists; a live/contactable
  tester cohort is evidenced; an independent server-evaluated Sync v2 rollout
  control is deployed with catch-all `blob` authority and verified fail-closed.
  The packet is complete at `47ef32c`. Preflight Commit 0 is complete at
  `def28dc`; its rollout migration and 11/11 hosted probes establish default
  blob authority on the shared production database. Phase 5's kill-switch
  replay-token correction and two manual acceptance records remain absent. The
  hosted cohort inspection found five
  tester accounts: two grouped but inactive and three unassigned, with one
  active row and one owner/admin row in the unassigned aggregate; the result
  does not establish whether those are the same account. This is 0 of the
  required 2 structurally eligible accounts before human attestation, with no
  separate two-device account recorded. Phase 6 is therefore
  **Blocked**, not Ready; Commit 1 has not started. The 2026-08-02
  candidate-by-candidate decision remains 0 of 2. The authenticated CLI now
  recognises migration `202608010001` without SQL reapply, with an identical
  pre/post rollout-control schema/access fingerprint. Two unrelated July
  dashboard-applied migrations remain missing from remote history, so a future
  real `db push` is separately prohibited pending reviewed reconciliation.
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
  - **Migration applied to the shared hosted Supabase project (production
    database, 2026-07-12).** Applied via the
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
- **2026-07-19 — Phase 3 complete.** Nine commits on `staging`, full
  verification gate after each (`lint && test:unit && build &&
  test:release-guardrails && test:before-push`), Playwright per the
  packet's per-commit list at `--workers=2`:
  - **Commit 1** (`de84491`): marketing/explore/onboarding relocated into
    `features/{marketing,explore,onboarding}`; dead `src/ContinueToAppCard.jsx`
    + `.css` deleted; blueprint §19 Phase 3 amended with Ruling R1.
  - **Commit 2** (`50f2929`): `src/HQPanel.jsx` → `features/hq/HQPanel.jsx`.
  - **Commit 3** (`047c4e3`): auth + settings relocated into
    `features/{auth,settings}`. `isDemoModeEnabled` (used by both App() and
    the extracted `SyncConnectionScreenContent`) moved to `src/app/e2e.js`
    alongside `isE2EModeEnabled`, mirroring the phase-02b cycle-breaker
    pattern, rather than staying in App.jsx per the packet's literal
    fallback text — the established precedent from Phase 2b for this exact
    class of helper.
  - **Commit 4** (`be55de1`): library + composer relocated into
    `features/{library,composer}`. `CardIcon` (consumed by ≥2 features)
    moved to `src/components/CardIcon.jsx` per the rule-of-three note.
    `resolveTheme`/`isCommitmentCard`/`getCommitmentStartWindow`/
    `getCommitmentTimingOptionId`/`getCommitmentTimingConfig`/
    `COMMITMENT_TIMING_OPTIONS` (shared between App() and the extracted
    Composer) moved into `src/utils.js` alongside their sibling commitment
    helpers, per the packet's own commit-7 constraint text applied one
    commit early.
  - **Commit 5** (`200ea5b`): apps + access relocated into
    `features/{apps,access}` (AppsPanel+AppsPanelClock kept in one file per
    the guardrail-pairing constraint). `AppPauseModal` moved to
    `src/components/AppPauseModal.jsx` (rule of three: App + apps, later
    launcher too). New `src/lib/launcherSetupUrl.js`, `src/lib/pauseFormat.js`,
    `src/lib/stripeCheckout.js` for App()-and-feature-shared pure helpers.
  - **Commit 6** (`199775d`): home group → `features/home`; all eleven
    glyph functions + `Masthead` → `src/app/shell/`. `isCardDoneToday`
    moved into `src/utils.js` (shared with the extracted `buildHomeState`).
  - **Commit 7** (`872784f`, "the big one"): the entire launcher/overlay
    component cluster (~1,700 lines) + the module-scope overlay/launch-session
    builder cluster (~300 lines) → `features/launcher/`. `CardRevealTemplate`
    and every `Premium*` component bundled into one file (mutual dependency
    would otherwise cycle across files). New `commitmentDebug.js` and
    `launchDebug.js` each carry a private 3-line `debugLog` duplicate rather
    than importing App.jsx's guardrail-pinned copy — matching this
    codebase's pre-existing convention (registerServiceWorker.js,
    launcherDestinations.js already did this before Phase 3).
    `getBrowserSafeDestinationHref` joined `isStandaloneDisplayMode` in
    `src/lib/launcherSetupUrl.js`. Guardrail re-points landed across all
    three guardrail-family scripts this commit needed
    (`test-release-guardrails.mjs`, plus the previously-undocumented
    `test-launcher-flow.mjs` and `test-fake-launcher-destinations.mjs`,
    both part of the `test:before-push` chain). Full Playwright suite run
    twice at `--workers=2`: 355/357 then 356/357 (only the documented
    `access-gating.spec.ts:88` baseline failure; one `onboarding.spec.ts`
    flake in the first run passed cleanly in isolation and did not recur).
  - **Commit 8** (`54ed50c`): `src/stores/uiStore.js` (descriptor stack,
    single-slot semantics preserved per Ruling R2) + `uiStore.test.js`;
    App.jsx's `const [overlay, setOverlay] = useState(...)` swapped for the
    store selector/action pair with identical local names, so all 59
    call sites and every dependency array are untouched (`git diff --stat`
    confirmed App.jsx + store files only). Full suite run twice
    consecutively at `--workers=2`: 356/357 both times (only the
    documented baseline failure) — the state-home swap flake check the
    packet required.
  - **Commit 9** (this commit): `scripts/check-feature-boundaries.mjs`
    (R3) and `scripts/check-bundle-budget.mjs` + `scripts/bundle-budget.json`
    (R6), wired into `npm run test`, `test:before-push`, and
    `staging-checks.yml`. The boundary checker's first run caught two real
    findings, both fixed in this commit: (1) `Onboarding.jsx` importing
    `features/marketing/landing.css` directly — a genuine cross-feature
    coupling introduced in commit 1, resolved by moving the shared
    `landing.css` to `src/styles/landing.css` (consumed by marketing's
    three pages and onboarding alike, none of them "owning" it); (2) the
    checker's own false-positive on App.jsx importing feature internals
    directly (permitted — only feature-to-feature imports are restricted),
    fixed in the checker itself. The bundle-budget checker's first run
    caught a real regression from commit 2: `App.jsx`'s
    `lazy(() => import("./features/hq"))` (pointed at the feature's
    `index.js`) had silently renamed the HQPanel lazy chunk to
    `index-*.js`, merging it into the generic chunk-name pool instead of
    emitting a separately identifiable `HQPanel-*.js` chunk. Fixed by
    pointing the lazy import at `./features/hq/HQPanel` directly (same
    fix pattern already used for the marketing pages' lazy imports in
    commit 1), restoring the named chunk.
  - **App.jsx: 13,206 → 6,531 lines** (R1-amended target: ≤ 6,500 — 31
    lines over; App() itself is unchanged in scope per R1's design, all
    module-scope helpers remaining in App.jsx were individually verified
    by grep to be App()-only consumers with no moved-component caller, and
    every "stays" disposition from the packet's evidence — `buildInitialState`/
    `buildSharedState`/`normalizeSharedState`/`mergeEntitiesById` (sync
    bridge, Phase 6), `TESTPILOT_CONFIG`, demo/e2e glue, memo wrappers — is
    confirmed still in place. No further move candidates remain; closing
    the last 31 lines is Phase 4's `App()` collapse, not a Phase 3 gap).
  - **No component definitions outside `App()` remain in App.jsx** except
    memo wrappers, `lazy()` calls, `TESTPILOT_CONFIG`, and the App-only
    helpers listed above — verified by grep.
  - **Guardrail re-points enumerated across all nine commits' messages**;
    zero regex/label changes; every re-point kept the assertion
    byte-identically equivalent per R7.
  - **Deviations from the packet's literal text**, both applying
    established same-codebase precedent rather than the packet's fallback
    "stays in App.jsx... STOP" instruction, recorded in their commit
    messages: commit 3 (`isDemoModeEnabled` → `app/e2e.js`) and commit 4
    (six commitment/theme helpers → `utils.js`). Both avoid an App.jsx ↔
    feature import cycle without duplicating logic, mirroring the
    phase-02b `app/e2e.js` cycle-breaker pattern this repo already
    established.
  - Phase 4 (`docs/architecture/phase-04-domain-stores.md`) entry
    criteria are now met.
- **2026-07-31 — Phase 6 packet written; phase remains Blocked.** The audit at
  `64fa40a` found no prior packet or numbered Sync v2 commit sequence, no
  independent rollout flag, and no repository evidence of a live/contactable
  hosted tester cohort. `docs/architecture/phase-06-sync-v2.md` fixes the
  entity catalogue, server-version conflict order, existing event-table reuse,
  owner-scoped local schema, blob-authority state machine, RLS/blob-consumer
  migration, non-vacuous release evidence, nine implementation commits, and an
  explicit operational cohort-expansion stage. Runtime work may start only
  after its default-blob rollout preflight is deployed and tester-cohort
  evidence is recorded.
- **2026-08-01 — Phase 6 Preflight Commit 0 deployed; phase remains Blocked.**
  `def28dc` adds the independent server-evaluated rollout table/RPC, exact
  default reset, fail-closed client resolver, and unit/SQL/source-contract
  gates without adding any Phase 6 runtime path. Migration
  `202608010001_sync_v2_rollout_control.sql` was applied to shared Supabase
  project `ifcgomivmzwqqxhltfjj` (the production database). Eleven hosted
  assignment/security probes passed for distinct listed/unlisted testers,
  admin/staff-audience membership, non-tester/non-operator, unauthenticated,
  table-access, and full-field exact-reset cases; every assignment remained
  `blob`. The
  hosted project has no distinct non-admin staff account, so that separate
  category remains locally proven rather than overstated as hosted evidence.
  The privacy-minimised cohort inspection found
  five tester accounts: two grouped but inactive and three unassigned, with one
  active row and one owner/admin row in that aggregate; it does not establish
  whether those are the same account. That is 0 of the required 2 structurally
  eligible accounts before human attestation, and no separate two-device
  account is recorded. Phase 5's manual
  staging kill-switch and native seeded iOS upgrade records are also absent.
  The dashboard apply did not populate migration version `202608010001` in the
  Supabase CLI ledger; reconcile it through an authenticated CLI workflow
  before trusting a future `db push`. Full evidence and exact script hashes are
  in `docs/release-evidence/phase-06/preflight-2026-08-01.md`. Runtime Commit 1
  remains prohibited until every hard gate is objectively satisfied.
- **2026-08-02 — target migration ledger reconciled; evidence gates remain
  Blocked.** An authenticated, documented Supabase CLI repair marked only
  `202608010001` applied. `migration list` now matches that version; the stored
  ledger name is `sync_v2_rollout_control` with 18 statement metadata entries.
  The rollout schema/access fingerprint remained
  `70933e4b483e306e93f79eda306194d6` before and after, the exact one-row
  catch-all posture remained at generation 8 with `non_blob=0`, and four
  privacy-safe assignment categories remained `blob`. Normal and include-all
  dry-runs omitted `202608010001` but exposed the already-known missing July
  history versions `202607100001` and `202607120001`; they were not repaired or
  rerun, and no real database push is authorised. Exact manual Phase 5 packets
  were prepared but remain human-operated/pending. The repository-only cohort
  decision records all five candidate slots and remains 0 of 2, with no consent,
  contactability, non-automation, or two-device evidence. Phase 6 Commit 1 is
  still unstarted and prohibited. The Phase 5 manual-packet review also found
  an unconditional first-render legacy write that advances the replay token
  before an operator edit; that safety blocker was documented, not corrected,
  in this evidence-only work.
