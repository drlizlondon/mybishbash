# Phase 4c — Launcher-engine extraction

**Blueprint:** `docs/architecture-blueprint.md` §9–§11
**Status tracker:** `docs/architecture/roadmap-status.md`
**Depends on:** Phase 4 complete (`b732e8c`); **Phase 4b complete** (recommended
ordering — 4b is lower risk and on Phase 5's critical path).
**Blocks:** nothing. Phase 5 does **not** depend on this phase.
**Executor:** fresh session, branch `staging`. This is the highest-risk packet
in the roadmap so far — read every guardrail script before editing.

> Line numbers measured at `b732e8c`. Re-find every symbol **by name** and
> re-measure before editing; report drift rather than adapting to it.

---

## Objective

Move the launcher engine out of `App()` into
`src/features/launcher/useLauncherEngine.js`, taking an **explicit dependency
object** rather than closing over `App` scope — while leaving the
launch-decision effect, its seven concurrency-control refs, and every
guardrail-pinned invariant exactly where they are.

## The governing constraint (read first)

**Do not move launcher-critical code merely to reduce `App()` line count.** This
is Ruling R2's standing prohibition and it is the single most important sentence
in this packet. Phase 4 waived its own size criterion rather than force it; this
phase inherits that stance. If a function cannot be moved safely, it stays, and
the packet is *still successful* — report the measured shape.

## Measured scope

| Symbol | Lines | Extent | Disposition |
|---|---|---|---|
| `selectLauncherActivationCard` | **187** | 2281–2467 | MOVE |
| `handleRevealCompletion` | **120** | 3531–3650 | MOVE |
| `openDestinationApp` | **119** | 3119–3237 | MOVE — *see security invariant* |
| `renderInterceptionDecision` | **72** | 3020–3091 | MOVE |
| `handleFakeLauncherLaunch` | **36** | 3298–3333 | MOVE |
| `scheduleNativeSchemeFallback` | **27** | 3245–3271 | MOVE |
| `beginInterceptionFlow` | **25** | 3093–3117 | MOVE |
| **Engine total** | **586** | | |
| Launch-decision effect | **383** | 2607–2989 | **STAYS** |

### Why the launch-decision effect stays

It is a **router, not engine**. It reads `route`, `overlay`, `screen`, `session`,
`syncStatus` and seven refs, and its dependency array carries 22 entries. Moving
it means moving the refs, and **the refs are the actual concurrency control** —
they are what prevents double-launches, re-entrant recovery, and duplicate event
logging. Relocating that machinery to gain ~383 lines would trade a measured
size win for an unmeasured correctness risk.

It stays in `App()` and calls into the extracted engine. This is a decision, not
a deferral: do not revisit it to hit a number.

### The seven concurrency-control refs — preserve exactly

Verified by scanning the effect body at `b732e8c`. All seven stay in `App()`:

1. `handledResumeLaunchNonceRef`
2. `interceptActivationRef`
3. `launchCompletedCardIdsRef`
4. `loggedLauncherOpenRef`
5. `pauseBypassInitiatedRef`
6. `standaloneRecoveryInFlightRef` — *the idempotence guard that masked the
   Phase 4 dependency defect; see `phase-04-domain-stores.md`. Do not remove it
   on the grounds that the dependency fix made it redundant — Phase 4 proved the
   fix independently sufficient, but both are retained deliberately.*
7. `suppressNextHomeAutoLaunchRef`

Extracted engine functions that need ref state receive it through the explicit
dependency object. **No ref moves into the hook.**

## In scope

- `src/features/launcher/useLauncherEngine.js` exporting the seven engine
  functions, taking an explicit dependency object (refs, store actions, route
  helpers, `logLauncherEvent`) — never implicit closure over `App`.
- Re-pointing guardrail assertions per §Mechanical guardrails.
- Making the engine's internal dependency graph explicit (see §Risk).

## Out of scope — do not touch

- The launch-decision effect and the seven refs (above).
- The cloud sync bridge (~270 lines) and `buildSharedState` /
  `normalizeSharedState` / `mergeEntitiesById`.
- Card/commitment handlers (Phase 4b), onboarding/setup handlers, the auth gate
  ladder, the JSX return block.
- Any behaviour change whatsoever, including event-log content and launch timing.
- `no-unused-vars` cleanup (separate backlog item).
- No new dependencies.

## Behavioural invariants

1. **`openDestinationApp` remains the single destination href assignment.** This
   is a **security-shaped invariant**, not a style rule: it is the one place a
   destination URL reaches the browser, and duplicating it creates a second,
   unreviewed navigation sink. There must be exactly one such assignment in the
   codebase after this phase.
2. **Launch timing is unchanged in shape** — `window.__MYBISHBASH_LAUNCH_TIMINGS`
   spot-check matches pre-phase.
3. **Event-log content and ordering unchanged**, including launcher events.
4. **No double-launch, no re-entrant recovery** — the properties the seven refs
   exist to guarantee.
5. **Native-scheme fallback behaviour unchanged**, including the silent-failure
   web fallback path.

## Mechanical guardrails

**The re-point rule for this phase is stricter than Phase 3 R7.** Eight
assertions across `test-release-guardrails.mjs`, `test-launcher-flow.mjs` and
`test-fake-launcher-destinations.mjs` are pinned to `appSource` for engine
subjects. Enumerate them by grep before moving anything.

For **every** re-pointed invariant:

- a **positive assertion** against the new source file, and
- an **`assertNoMatch` against `appSource`**, proving the subject *moved* rather
  than being *duplicated*.

A re-point that only relocates the positive assertion is a **weakening** and is a
stop-the-line defect. Phase 4 found a live instance of exactly this failure: an
assertion whose regex ended in the literal `events,` kept passing against a
replacement expression that merely *contained* that substring — passing while
asserting nothing. Assume every regex in the guardrail family has this property
until you have checked it.

Additionally: `npm run test:boundaries` green; the Phase 4 D5 write-path lint
rule applies to the new file.

## Required regression tests

- **`openDestinationApp` uniqueness:** a source-shape assertion that exactly one
  destination href assignment exists repo-wide. This must fail if a second is
  introduced anywhere.
- **Re-entrancy:** a test that a second launch attempt while one is in flight is
  suppressed — the property the refs guarantee, currently untested in isolation.
- **Per-function move verification:** `launcher-shell-repeat` and
  `launcher-terminal-exhaustive` after **each function moved**, not once at the
  end. See §Risk for why.

### Pre-change hazard proof

Two proofs are required, both by deliberate mutation, reverted after recording:

1. **Guardrail sensitivity.** Before re-pointing any assertion, prove the
   existing one is sensitive: introduce a second href assignment and confirm the
   `openDestinationApp` guardrail fails. If it passes, the guardrail was already
   vacuous — record that as a finding, fix it, and note it in the commit.
2. **Re-entrancy test sensitivity.** Disable one concurrency ref and confirm the
   new re-entrancy test fails; restore it.

As in 4b, this phase fixes no existing defect — do not manufacture a failure. If
a mutation does not produce a failure, that is itself the finding.

## Commit-by-commit plan

Full chain after each commit; the two launcher specs after **each function
moved**.

1. **Scaffold + guardrail sensitivity proof.** Create the hook with the explicit
   dependency object and move `beginInterceptionFlow` (25) only — the smallest,
   with the clearest boundary. Record proof 1 above.
   Commit: `Scaffold useLauncherEngine; move beginInterceptionFlow`.
2. **`scheduleNativeSchemeFallback` (27) + `handleFakeLauncherLaunch` (36).**
   Commit: `Move native-scheme fallback and fake launcher launch into engine`.
3. **`openDestinationApp` (119)** — alone, because of the security invariant.
   Both assertions re-pointed; uniqueness test added.
   Commit: `Move openDestinationApp into engine; assert single href sink`.
4. **`renderInterceptionDecision` (72).**
   Commit: `Move interception decision rendering into engine`.
5. **`handleRevealCompletion` (120).**
   Commit: `Move reveal completion into engine`.
6. **`selectLauncherActivationCard` (187)** — the largest; alone.
   Commit: `Move launcher activation selection into engine`.
7. **Re-entrancy test + measurement + docs.** Full suite twice consecutively.
   Commit: `Close Phase 4c; measure residual App()`.

## Risk — the reason for one-function-at-a-time

The engine functions are plain hoisted `function` declarations, mutually
recursive across ~600 lines, with **no explicit dependency graph**. Extraction
forces that graph to become explicit — which is the value of the phase and also
its hazard: a missed closure variable becomes a **stale-value bug that no unit
test catches**, because it only manifests on a *second* launcher open, after the
first has mutated a ref.

`launcher-shell-repeat` and `launcher-terminal-exhaustive` are the specs that
exercise exactly that second-open path. Run both after each function moved. A
batch move that defers verification to the end will find the bug with six
candidate causes instead of one.

## Rollback triggers

Revert newest-first. Trigger on any of:

- More than one destination href assignment exists (invariant 1 broken).
- Any guardrail re-point that cannot carry an `assertNoMatch`.
- Any non-baseline e2e failing twice on the same assertion (baseline:
  `access-gating.spec.ts:88`).
- Launch timings changed in shape.
- Any launcher event added, dropped, or reordered.
- A function that cannot be moved without relocating a ref or the
  launch-decision effect — **stop and report; leave it in `App()`.**

## Exit criteria — derived from measured structure

- [ ] The seven named engine functions (586 measured lines) live in
      `useLauncherEngine.js` with an explicit dependency object — **or** any that
      remained are named with the evidence that moving them was unsafe. Both
      outcomes pass this criterion; forcing a move does not.
- [ ] The launch-decision effect and all seven refs remain in `App()`.
- [ ] Exactly one destination href assignment exists repo-wide, asserted
      mechanically.
- [ ] Every re-pointed invariant carries both a positive assertion and an
      `assertNoMatch` against `appSource`; the list is enumerated in the closing
      commit.
- [ ] Re-entrancy test present and proven sensitive by mutation.
- [ ] `App()` re-measured and reported. Expected ≈ **4,100** after 4b and 4c
      together. **A predicted consequence, not a target.**
- [ ] Full suite twice consecutively, minus the documented baseline.

## Expected residual responsibilities in `App()`

After 4b + 4c, ≈4,100 lines: the JSX return block (563), the launch-decision
effect (383) and its seven refs, the cloud sync bridge (~270),
onboarding/setup handlers (262), packs/apps/account handlers (244), the auth
gate ladder (98), and ~2,190 lines of hooks, selectors, memos, refs and glue.

**Permanent residents by decision:** the launch-decision effect, the seven
concurrency-control refs, and the cloud sync bridge. `App()` remaining in the
4,000-line range after both phases is the *expected, accepted* outcome — the
remaining candidates (JSX decomposition, onboarding handlers) are separate work,
not a deficiency of this phase.
