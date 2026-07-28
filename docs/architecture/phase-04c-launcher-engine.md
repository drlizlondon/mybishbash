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

> **Grep for BODIES, not just names — learned in Phase 4b (2026-07-27).** 4b's
> packet predicted zero re-points on the strength of a name-grep that returned
> zero hits. **Two re-points were nonetheless required**:
> `test-release-guardrails.mjs:147` and `test-launcher-flow.mjs:247` pin the
> moved code by its **body** (e.g. `/event_type: action === "done" ? .../`),
> which no name-grep can find. Before moving any function here, grep the six
> guardrail scripts for distinctive *code fragments* from inside it — string
> literals, ternaries, property names — not only its identifier. Assume a
> silent body-pin exists until you have looked for one.

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

## GATE — the re-entrancy invariant test comes FIRST (ruling 2026-07-26)

**This is commit 0 and it precedes every extraction commit.** Lizzie's ruling:
begin with the isolated re-entrancy invariant test *before* extracting any
launcher function. If the invariant cannot be tested, the extraction does not
start.

**The required property, stated exactly:** *launcher recovery and destination
opening cannot execute twice or re-enter for the same launch lifecycle.*

**The test must:**
- **fail** against a deliberately exposed pre-fix hazard (e.g. one concurrency
  ref disabled), and
- **pass** with the current protections in place.

Both directions recorded with commands and outcomes, mutation reverted.

**Do not manufacture a failing test. Do not weaken the invariant. Do not proceed
on implied coverage alone** — "the launcher specs would probably catch it" is
exactly the reasoning this gate exists to refuse.

### If the invariant cannot be tested in isolation — STOP before extraction

If testing it would require **materially changing the launcher engine** or
**introducing production seams that exist solely for the test**, stop and report
all five of:

1. **Why** the current architecture prevents isolated testing.
2. **What behaviour is still covered** by the existing launcher specifications.
3. **What additional seam** would be required.
4. **Whether introducing that seam is safer** than retaining the engine in
   `App()`.
5. **Your revised recommendation for Phase 4c** — including "don't do it" if
   that is where the evidence points.

A seam added only to make a test possible is a production change with no
product justification; it may still be the right call, but it is Lizzie's call,
not the executor's.

### GATE OUTCOME — STOPPED at commit 0 (2026-07-27, HEAD `82003f5`)

**No extraction was performed. No production file was changed.** The gate's
"stop and report" branch was taken. Awaiting Lizzie's ruling.

**1. Why isolated testing is prevented.** Both halves of the invariant are
implemented as *render-lifecycle* state inside `App()`, not as logic in the
seven engine functions:

- *Recovery re-entry* is the inline guard at `App.jsx:2848`
  (`if (standaloneRecoveryInFlightRef.current === recoveryKey) return;`), inside
  the launch-decision effect — the block this packet declares **STAYS**.
- *Destination-opening once-only* is **not implemented inside
  `openDestinationApp` at all.** Its body (`App.jsx:3121–3237`) has no
  re-entrancy guard; it calls `window.location.assign(href)` unconditionally on
  the success path. The once-only property is supplied by callers — chiefly
  `pauseBypassInitiatedRef` at `App.jsx:2730`, again inside the launch-decision
  effect.

So the invariant does not live in the extractable unit. Reaching it requires
rendering `App()`. The unit runner cannot: `vitest.config.js` sets
`environment: "node"`, and neither `jsdom`/`happy-dom` nor
`@testing-library/react` is installed — adding either is barred by this packet's
"no new dependencies". Even with them, rendering a 5,725-line component wired to
Supabase, `localStorage` and the router is an integration test, not isolation.

**2. What is covered today — proven by mutation, not assumed.** Two mutations
were applied, each with a verified fresh build, and reverted:

| Mutation | Spec run | Result |
|---|---|---|
| `standaloneRecoveryInFlightRef` re-entry guard removed (`:2848`) | `launch-decision-loop` + `launcher-shell-repeat` | **15 passed — no failure** |
| `pauseBypassInitiatedRef` guard forced open (`:2730`) | `pause-launcher` (`-g "pause"`) | **1 failed, 42 passed** — `pause-launcher.spec.ts:266` expected 1 navigation attempt, **received 3** |

The destination-opening half is therefore genuinely covered and genuinely
ref-sensitive — a real two-direction proof, but delivered by an existing
Playwright spec, not an isolated test. The recovery half is **not observable**:
that guard is defence-in-depth behind the route change and
`consumeStandaloneLauncherRecoverySuppression()`, consistent with Phase 4's
finding that the dependency fix was independently sufficient. The packet
anticipates this: "If a mutation does not produce a failure, that is itself the
finding."

> Method note: Playwright's `reuseExistingServer` silently served a **stale
> build** on the first mutation attempt, making the mutation appear inert.
> Every result above was re-run against a manually rebuilt bundle with a
> confirmed new content hash. Any future mutation proof in this repo must
> verify the bundle hash changed.

**3. The seam that would be required.** Lifting the two guard predicates out of
the launch-decision effect into pure functions — e.g.
`shouldBeginStandaloneRecovery({ inFlightKey, recoveryKey, … })` and a
once-only wrapper owning destination opening. That is a change to the effect
this packet places out of scope, and for destination opening it is not a
refactor but **new production behaviour** (a guard that does not exist today),
which "no behaviour change whatsoever" forbids.

**4. Is the seam safer than leaving the engine in `App()`?** No. It buys a unit
test for a property already mutation-proven at the browser level, at the cost of
editing the one block the packet identifies as the highest-risk code in the
repo, and of inventing a guard whose absence is currently load-bearing (multiple
call sites rely on `openDestinationApp` being re-callable — `App.jsx:5144`,
`:5233`, `:5356`, `:5682`).

**5. Revised recommendation — do not extract under this gate as written.** In
preference order:

1. **Preferred: re-scope the gate to the coverage that exists.** Accept the
   `pause-launcher.spec.ts:257` mutation proof as the re-entrancy gate, add a
   comment in that spec naming it as the invariant's guard, and proceed to the
   extraction commits. The extraction itself is closure-correctness work that
   `launcher-shell-repeat` / `launcher-terminal-exhaustive` verify per function,
   exactly as §Risk designs.
2. **Or: close Phase 4c as "measured, not moved."** The exit criteria already
   pass on that outcome. `App()` stays ~4,746 lines; the remaining candidates
   are JSX decomposition and onboarding handlers, not the launcher engine.
3. **Not recommended: build the seam.** Only if Lizzie decides an isolated unit
   test of launcher re-entrancy is worth a behaviour-bearing change to the
   launch-decision effect. That is her call, not the executor's.

### Independent finding — the uniqueness guardrail was vacuous (FIXED)

Not part of the gate, and fixed without touching any production file, because
§Pre-change hazard proof 1 instructs exactly this ("If it passes, the guardrail
was already vacuous — record that as a finding, fix it").

`test-release-guardrails.mjs:117` was labelled *"openDestinationApp is the
single destination href assignment"* but used `assertMatch`, which is
**existence-only**. Proof: a second `window.location.assign(href)` was added to
`App.jsx` and **both** `test-release-guardrails.mjs` and
`test-fake-launcher-destinations.mjs` passed unchanged. The repo's central
security-shaped invariant was asserting nothing about uniqueness — the exact
defect class §Mechanical guardrails predicts.

Replaced with two counted assertions, both mutation-proven:

| Direction | Result |
|---|---|
| unmutated | both PASS |
| duplicate `assign(href)` added | both FAIL (`found 2`; `[href, href, fallbackHref, url]`) |
| second sink added under a **different variable name** (`sneakyHref`) | count check passes, **enumeration check FAILS** — the evasion the old guardrail could never catch |

The enumerated sinks in `App.jsx` are exactly `href` (openDestinationApp, the
single launcher destination sink), `fallbackHref` (`scheduleNativeSchemeFallback`,
fed only by openDestinationApp) and `url` (`openExternalActionUrl`,
https-validated action-card links). Adding, removing or renaming one now fails
the release guardrails and must update the list in the same commit.

**Unrelated flake observed:** `selectPersonalFirstLauncherCard handles large
event history under 50ms` failed once at 56.29ms, then passed three times at
36–44ms. Pre-existing, timing-sensitive, not caused by this work.

## Required regression tests

- **`openDestinationApp` uniqueness:** a source-shape assertion that exactly one
  destination href assignment exists repo-wide. This must fail if a second is
  introduced anywhere.
- **Re-entrancy:** the commit-0 gate test above.
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

0. **The re-entrancy invariant test — GATE, no extraction in this commit.**
   Per §GATE above: write the isolated test, prove it fails with a concurrency
   ref disabled and passes with protections intact, revert the mutation. **If it
   cannot be written without a production seam, STOP and file the five-part
   report — do not proceed to commit 1.**
   Commit: `Assert launcher re-entrancy invariant`.
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
