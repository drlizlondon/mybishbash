# Phase 4b — Card & commitment handler extraction

**Blueprint:** `docs/architecture-blueprint.md` §9–§11
**Status tracker:** `docs/architecture/roadmap-status.md`
**Depends on:** Phase 4 complete (`b732e8c`). All four domain stores live;
store actions are the only local-persistence writers.
**Blocks:** **Phase 5 (IndexedDB) — hard blocker.** See §Sequencing.
**Executor:** fresh session, branch `staging`.

> Line numbers below were measured at `b732e8c` (`App.jsx` = 6,383 lines,
> `App()` = 977–6,380 = 5,404). Re-find every symbol **by name** at execution
> time and re-measure before editing; report any drift instead of adapting to it.

---

## Objective

Move the card and commitment handler cluster out of `App()` into two feature
hooks with unit tests, **before** Phase 5 makes every persistence call async.

This phase is a *structural* change with **zero behaviour change** and zero
persistence-timing change. It exists to make Phase 5 reviewable.

## Why this phase exists (read before scoping anything down)

Phase 4's closure recorded that de-prop-drilling moved a net 67 lines out of
`App()` across four commits. The mass was never props — it is handler bodies.
This cluster is the single largest movable block in the component, and unlike
the launcher engine (Phase 4c) it is **almost entirely store mutation plus
`logEvent`**: it barely touches route, overlay, or launch-flow state. It is
therefore the biggest win available at the lowest risk, and it is the one that
Phase 5 cannot safely proceed without.

## Measured scope

Verified at `b732e8c` by locating each symbol and counting to its closing brace:

| Symbol | Lines | Extent |
|---|---|---|
| `handleSaveCard` | **211** | 4053–4263 |
| `handleCommitmentAction` | **121** | 3715–3835 |
| `handleCommitmentCheckInAction` | **100** | 3837–3936 |
| `handleAction` | **62** | 3652–3713 |
| `handleCommitmentReviewAction` | **61** | 3991–4051 |
| `handleCommitmentEncouragementAction` | **52** | 3938–3989 |
| `handleResetItem` | **43** | 4318–4360 |
| `handleDuplicateCard` | **40** | 4277–4316 |
| **Total** | **690** | |

## In scope

- Extract the eight handlers above into two feature hooks:
  - `src/features/cards/useCardActions.js` — `handleSaveCard`,
    `handleDuplicateCard`, `handleResetItem`, `handleAction`
  - `src/features/commitments/useCommitmentActions.js` — the four commitment
    handlers
- Each hook takes an **explicit dependency object** (never closes over `App`
  scope implicitly) and returns the same-named callbacks.
- Unit tests for every handler, against stubbed stores — this is the deliverable
  that makes Phase 5 reviewable, not an optional extra.
- `App()` calls the hooks and passes the returned callbacks to the same JSX
  props as today, under the same names.

## Out of scope — do not touch

- **No async conversion.** Every persistence call stays synchronous. That is
  Phase 5's job and mixing them is the exact hazard this phase exists to avoid.
- **No persistence-timing change.** The `cardsStore` 120ms trailing debounce and
  every immediate write keep today's timing and payloads byte-for-byte.
- **No launcher engine, no launch-decision effect, no sync bridge** (Phase 4c /
  never).
- **No presentational component changes.** Component bodies are untouched; only
  the source of the callback changes.
- **No `no-unused-vars` cleanup** — that is its own backlog item
  (`docs/architecture/backlog-lint-unused-vars.md`). Do not mix it in.
- No new dependencies.

## Dependency & sequencing constraints

1. **Phase 4 must be complete** — the handlers must be mutating stores, not
   `useState`, before they can move. Satisfied at `b732e8c`.
2. **Phase 5 must not begin until this phase lands.** Non-negotiable; the
   rationale is in `phase-04-domain-stores.md` §"Sequencing constraint".
3. **Phase 4c is independent** — 4b and 4c touch disjoint code and may run in
   either order, but 4b first is recommended because it is lower risk and it is
   the one on Phase 5's critical path.

## Prerequisite commit — the D5 ratchet (NOT one of the five)

**Lands before commit 1. Not part of this phase's five extraction commits; keep
it in its own diff.** Ruling 2026-07-26: ratchet first, criterion 6 not waived.

Delivers the Phase 4 D5 write-path lint rule that was never implemented. Scope:

- Prohibit new direct `localStorage` access in the D5-scoped feature/component
  directories, using **exact file and syntax matching wherever ESLint permits**.
- **No directory-wide, wildcard, or generic exemptions.** A rule that passes
  because its scoped files are broadly excluded does not satisfy criterion 6.
- Allow the pre-authorised `features/launcher/launchSessionStorage.js` path.
- **Enumerate each existing violation individually**, each with a brief
  justification and a debt classification drawn from at least: genuine
  domain-state persistence that should move to a store/persistence adapter;
  debugging or diagnostic storage; UI draft or transient state; administrative or
  marketing state; authorised launcher session storage.
- Fail if a **new** violation appears. Fail if an **existing** violation is
  **copied to another location**.
- Removing an exception when its debt is later migrated must be a one-line edit.

**Do NOT relocate the twelve existing violations in this commit.** Any relocation
needing a behavioural or ownership decision belongs to its own packet.

**Classify before enabling.** If a violation cannot be represented narrowly
without a broad exemption, **STOP and report that specific case before enabling
the rule. Do not weaken the ratchet to accommodate it.**

### Two-directional sensitivity proof (required)

Both must be demonstrated, then reverted, with commands and outcomes recorded:

1. Introduce one new direct `localStorage` access in a scoped file → **lint must
   fail**.
2. Remove or alter one exact exception while its legacy violation remains →
   **lint must fail**.

Direction 2 is the one that catches a vacuous rule: it proves the exceptions are
load-bearing and precisely targeted rather than blanket cover.

### Verification before proceeding to commit 1

- The D5 rule is active.
- All existing exceptions are explicit and documented.
- No unlisted violations exist in the scoped directories.
- Launcher storage remains covered by its authorised path.
- `access-gating.spec.ts:88` remains the only full-suite failure.

Then update `phase-04-domain-stores.md` so criterion 6 reads **met** — only after
this commit lands.

## Commit-by-commit plan

Each commit gated on the **full** chain `npm run test && npm run test:before-push`
plus the listed Playwright specs at `--workers=2`.

1. **Create `features/cards/useCardActions.js` with `handleAction` +
   `handleResetItem` only** (the two smallest, least entangled). Unit tests for
   both. App calls the hook.
   Specs: `commitment-cards`, `card-layout-stability`, `release-smoke`.
   Commit: `Extract card action handlers into useCardActions`.
2. **Move `handleDuplicateCard` + `handleSaveCard`** into the same hook. This is
   the 251-line commit and the riskiest in the phase — `handleSaveCard` is the
   densest synchronous-save site in the codebase.
   Specs: **full suite**.
   Commit: `Move card save and duplicate into useCardActions`.
3. **Create `features/commitments/useCommitmentActions.js` with
   `handleCommitmentAction` + `handleCommitmentCheckInAction`.** Unit tests.
   Specs: `commitment-cards`, `release-smoke`, `explore`.
   Commit: `Extract commitment action handlers into useCommitmentActions`.
4. **Move `handleCommitmentReviewAction` +
   `handleCommitmentEncouragementAction`.**
   Specs: `commitment-cards`, `release-smoke`.
   Commit: `Move commitment review and encouragement into useCommitmentActions`.
5. **Measurement + docs.** Re-measure `App()`; record the byte-comparison output
   (below); update `roadmap-status.md`.
   Specs: **full suite twice consecutively**.
   Commit: `Close Phase 4b; measure residual App()`.

## Behavioural invariants

These must hold at every commit, not just at the end:

1. **Persistence payloads are byte-identical.** A scripted session that creates a
   card, edits it, duplicates it, resets it, and runs each commitment action
   produces identical `localStorage` bytes before and after this phase. Write the
   comparison script in commit 1 and re-run it at every commit; include the diff
   (expected: empty) in each commit message.
2. **Persistence *timing* is unchanged** — same debounce, same immediate writes,
   same ordering relative to `logEvent`.
3. **Event log content is unchanged** — the same events with the same payloads in
   the same order.
4. **Commitment lifecycle is unchanged** — check-in, review, encouragement and
   decline transitions produce identical card state.
5. **No callback identity churn** — the hooks must not cause the memo boundaries
   to re-render more than today. If a handler must become `useCallback` to hold
   this, do it and say so.

## Mechanical guardrails

- The hooks live under `src/features/**`, so the **Phase 4 D5 write-path lint
  rule applies to them** — they cannot call `localStorage.setItem` directly. This
  is the mechanical enforcement that the extraction does not quietly reintroduce
  a second write path. Verify once with a deliberate trial violation, then revert
  it.

  > **Corrected 2026-07-26:** this bullet previously stated the D5 rule "already
  > applies". It did not — the rule was never implemented in Phase 4 (see
  > `phase-04-domain-stores.md` §CORRECTION). It is delivered by the **D5 ratchet
  > prerequisite commit** below, which must land before commit 1 of this phase.
  > This phase's exit criterion 6 depends on it.
- `npm run test:boundaries` must stay green — `features/` may not import from
  `app/`.
- Any guardrail assertion pinned to `appSource` whose subject moves must be
  re-pointed per Phase 3 R7 **and** carry an `assertNoMatch` against `appSource`
  proving the subject was moved rather than duplicated. Grep the six
  guardrail-family scripts for each handler name before moving it.

## Required regression tests

- **Unit, per handler:** given stubbed stores, asserts the exact store action
  calls, the exact persisted payload, and the exact events logged.
- **`handleSaveCard` specifically:** a test asserting that a save followed
  immediately by a second save within the 120ms debounce window results in one
  write of the final value — this is the invariant Phase 5 will most easily
  break, and it must exist *before* Phase 5 touches it.
- **Commitment lifecycle:** a test per transition asserting the resulting card
  state, including the decline path.

### Pre-change hazard proof

Unlike Phase 4's launcher hardening, **this phase fixes no existing defect**, so
there is no hazard to demonstrate failing today. Do not manufacture one.

The equivalent proof obligation here is **inverse**: prove the new unit tests are
sensitive by mutation — for each handler, deliberately corrupt one persisted
field or drop one logged event, confirm the new test fails, then revert. Record
which mutation was used per handler in the commit message. A test suite that
cannot detect a dropped write is exactly the suite Phase 5 must not rely on.

## Rollback triggers

Revert newest-first. Trigger on any of:

- The byte-comparison diff is non-empty at any commit.
- Any non-baseline e2e failing twice on the same assertion (baseline:
  `access-gating.spec.ts:88`).
- Any change in event-log content or ordering.
- A handler that cannot be moved without also moving route/overlay/launch-flow
  state — **stop and report**; do not drag launch state into a card hook.
- Evidence of extra re-renders at the memo boundaries.

Rollback is pure git — no persistence format changes, no data migration.

## Exit criteria — derived from measured structure

- [ ] All eight named handlers (690 measured lines) live in the two feature
      hooks; **zero** of them remain in `App()`. Verified by grep, per symbol.
- [ ] `App()` is re-measured and reported. Expected ≈ **4,700** (5,404 − 690, less
      the hook call sites). **This is a predicted consequence, not a target** — if
      the measured number differs, report the difference and its cause; do not
      move additional code to hit it.
- [ ] Every handler has a unit test, and every unit test has a recorded mutation
      that makes it fail.
- [ ] Byte-comparison diff empty at every commit.
- [ ] Full suite twice consecutively, minus the documented baseline.
- [ ] Write-path lint rule verified to fire on a trial violation inside the new
      hooks.

## Expected residual responsibilities in `App()`

After 4b, `App()` should hold ≈4,700 lines comprising: the launcher engine (586,
→ Phase 4c), the JSX return block (563), the launch-decision effect (383, stays
permanently), the cloud sync bridge (~270, stays), onboarding/setup handlers
(262), packs/apps/account handlers (244), the auth gate ladder (98), and ~2,190
lines of hooks, selectors, memos, refs and JSX glue.

**Explicitly permanent residents:** the launch-decision effect and its seven
concurrency-control refs, and the cloud sync bridge. Neither is a defect.
