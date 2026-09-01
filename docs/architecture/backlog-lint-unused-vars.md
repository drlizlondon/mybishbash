# Backlog — promote `no-unused-vars` from warning to error

**Type:** standalone backlog item, not a phase.
**Do NOT fold into Phase 4b or 4c** — it touches many files and would obscure
those phases' diffs, which must stay reviewable per their own rollback criteria.
**Depends on:** nothing. Can run any time the tree is otherwise quiet.

---

## The problem

`no-unused-vars` is configured as a **warning**, not an error, in
`eslint.config.js`. There are **48 such warnings** repo-wide, and because they
never fail a gate, dead code accumulates unnoticed.

Confirmed dead symbols found incidentally during Phase 4, in `src/App.jsx`:

- `completionEvents` — computed every render, consumed nowhere
- `interruptionTodayCount` — computed every render, consumed nowhere
- `getInstallUrl` — unused
- `isMeaningfulEvent` — unused

These four are the *symptom*. The rule severity is the *cause*. Per the planning
doctrine (fable-core §1.5: constraints must be mechanical, not textual; when you
find a systematic defect, fix the incentive that produced it, not just the
instance), the deliverable is the severity change — deleting four symbols without
it just resets the counter.

## Controlled clean-up sequence

1. **Audit** all 48 warnings and classify each: genuinely dead / intentionally
   unused (destructuring rest siblings, catch params, signature-shape args) /
   needs an underscore-prefix convention. Commit the classification as a table
   before changing any code, so the deletions are reviewable against a stated
   intent rather than taken on trust.
2. **Delete** the genuinely dead code. One commit, no behaviour change, full
   chain green.
3. **Rename** the intentionally-unused to `_`-prefixed names.
4. **Promote** the rule to `error` with `argsIgnorePattern: "^_"` and
   `varsIgnorePattern: "^_"`. Verify it fires on a deliberate trial violation,
   then revert the trial.

Each step is its own commit; each gated on `npm run test && npm run
test:before-push`.

## Exit criteria

- [ ] Zero `no-unused-vars` warnings.
- [ ] Rule severity is `error` with the `^_` ignore patterns.
- [ ] Trial violation verified to fail lint, then reverted.
- [ ] No behaviour change: full suite green, minus the documented
      `access-gating.spec.ts:88` baseline.

## Note on scope

If the audit finds a "dead" symbol that is actually load-bearing (referenced from
a guardrail script's source-shape assertion, a test, or a string-keyed lookup),
**stop and report it** rather than deleting. The six guardrail-family scripts
assert against source text, so a symbol can be unused by the compiler and still
required by a gate.
