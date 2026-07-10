# Phase 0 — Safety-net tooling (Vitest + ESLint + CI wiring)

**Blueprint:** `docs/architecture-blueprint.md` §19 Phase 0
**Status tracker:** `docs/architecture/roadmap-status.md`
**Executor:** Claude Sonnet, fresh session, branch `staging`.

---

## Objective

Add a fast unit-test harness (Vitest) and a correctness-only linter (ESLint),
with first tests around the existing pure modules in `src/lib/`, `src/utils.js`
and `src/eventLog.js`, and wire both into every existing enforcement point
(`npm test`, `test:before-push`, `staging-checks.yml`) so they cannot be
silently bypassed.

**Deliberately NOT attempted in this phase:**
- No TypeScript, no `tsconfig`, no typescript-eslint (deferred to Phase 7).
- No formatting rules, no Prettier, no repo-wide `--fix` sweep.
- No testing of `App.jsx` internals, no exports added to `App.jsx`.
- No production-code restructuring to make anything "more testable".
- No new runtime dependencies — devDependencies only.
- No changes to guardrail scripts' assertions, Playwright config, or deploy workflows.

## Decisions (resolved — do not relitigate during implementation)

1. **ESLint enforces correctness and dangerous patterns only.** Explicit rule
   list (below), not `js.configs.recommended`, so the initial run is
   deterministic and does not force edits across the 13k-line `App.jsx`.
2. **All TypeScript-related linting is deferred to Phase 7.**
3. **`react-hooks/exhaustive-deps` is OFF** in this phase (87 `useEffect` in
   `App.jsx` would bury signal in warnings). `react-hooks/rules-of-hooks` is ON
   as an error. Revisit exhaustive-deps in Phase 4.
4. **`no-unused-vars` is a warning, not an error** (visible, non-blocking; the
   codebase predates linting). Errors are reserved for rules expected to pass
   today.
5. **Vitest tests are named `*.test.js` and co-located in `src/`.** Playwright's
   `testMatch` is `**/*.spec.@(ts|js)` (see `playwright.config.ts:24`), so there
   is no collision; Vitest's `include` is restricted to `src/**/*.test.{js,jsx}`
   so it never picks up Playwright specs.
6. **Vitest gets its own `vitest.config.js`** rather than reusing
   `vite.config.js`, whose plugins (dev middleware, service-worker stamping,
   launcher prebuild expectations) are irrelevant and risky in a test context.
7. **CI enforcement is triple-redundant:** lint+unit run (a) as the first steps
   of the `checks` job in `staging-checks.yml`, (b) inside
   `scripts/test-before-push.mjs`, and (c) at the front of the `npm test`
   chain. Removing them would require visible edits in three reviewed files.

## Current-state evidence (verified 2026-07-10)

- `package.json`: no `eslint`, `vitest`, `tsconfig`, or lint script exist. The
  `test` script chain is `npm run build && npm run test:launcher-flow && …`
  (all Node `.mjs` scripts). `test:before-push` runs
  `scripts/test-before-push.mjs`, which executes a `checks` array:
  Build → Release guardrails → Launcher selector flow → Fake launcher
  destinations → a Playwright smoke spec → shell repeat.
- `.github/workflows/staging-checks.yml`: single `checks` job on Node 20 —
  `npm ci` → Build → Playwright install → `npm run test:before-push` → smoke
  Playwright specs. This is the workflow Phase 0 modifies. Do **not** touch
  `playwright.yml`, `deploy-pages.yml`, `deploy-pages-preview.yml`.
- CI Node is **20** (`node-version: 20`); local dev is Node 25. All chosen
  tool versions must support Node 20.
- `scripts/test-release-guardrails.mjs` imports `src/lib/cardSelection.js`,
  `src/lib/librarySections.js`, `src/lib/generatedCover.js` directly under
  plain Node and regex-scans many `src/` source files **by exact path**. Phase 0
  must not move or rename any `src/` file.
- Module purity check: `src/utils.js`, `src/lib/accessCapabilities.js`,
  `src/lib/cardSelection.js`, `src/lib/launcherRegistry.js`,
  `src/lib/launcherAvailability.js` contain no `window.` references.
  `src/eventLog.js` uses `window.localStorage` **inside functions only** and
  `import.meta.env` at module scope — safe under Vitest (which provides
  `import.meta.env`), so tests import it but call only pure exports.
- `src/utils.js` has a module-level singleton `_activeWindowDefs`
  (`setWindowDefs`/`getWindowDefs`, ~line 443). Tests that touch eligibility
  must reset it (`setWindowDefs(DEFAULT_WINDOW_DEFS)`) in `beforeEach`.
- Vite is `^5.4.10`; React 18.3; global define `__MYBISHBASH_VERSION__` exists
  (`vite.config.js` `define`) and must be declared as an ESLint global.
- Git branch: `staging`. Working tree contains `docs/` architecture files only.

## Packages to add (devDependencies — exact list, nothing else)

| Package | Version | Why |
|---|---|---|
| `vitest` | `^3` | Vite-5-compatible, Node ≥18 |
| `eslint` | `^9` | flat config |
| `@eslint/js` | `^9` | base rule definitions |
| `globals` | `^16` | browser globals map |
| `eslint-plugin-react-hooks` | `^5` | `rules-of-hooks` (flat-config support) |
| `eslint-plugin-react` | `^7` | only for `jsx-uses-vars` / `jsx-no-undef` |

No `jsdom` (tests are `environment: "node"`), no `prettier`, no
`typescript-eslint`, no `eslint-plugin-import`.

---

## Implementation steps (ordered)

### Step 1 — Vitest harness + first test files

**Create `vitest.config.js` (repo root):**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
    // Playwright owns *.spec.*; never collect them.
    exclude: ["node_modules/**", "dist/**", "tests/**", "e2e/**"],
  },
});
```

**Modify `package.json`:** add script `"test:unit": "vitest run"` and the six
devDependencies above. Do not touch the `test` chain yet (Step 4).

**Create the test files** (co-located, `*.test.js`). Test only existing
observable behaviour — read each module first and derive expectations from the
code as it is. If a test reveals what looks like a real bug, do **not** change
production code; note it in the final report.

1. `src/lib/accessCapabilities.test.js` — `ACCESS_TIERS` values are stable
   strings; `getEffectiveTier` for null/unknown/each-tier profiles;
   `isAccessActive`; `resolveEntitlements` shape per tier; `canAddUnder`
   at/below/above limits; `isUnlimited`.
2. `src/lib/launcherRegistry.test.js` — registry IDs are non-empty, unique and
   stable (snapshot the ID list — this encodes the static-ID invariant);
   `mergeLauncherConfig` merges an HQ override without changing the ID and
   ignores/handles unknown IDs per current behaviour.
3. `src/lib/launcherAvailability.test.js` — availability resolution for each
   status value found in the module, including default/unknown status.
4. `src/lib/cardSelection.test.js` — `selectEligibleCard` returns null/none on
   an empty pool; deterministic selection with a seeded/fixed input if the API
   allows; excluded-card handling. (This module is already imported by the
   guardrail script under Node, so importability is proven.)
5. `src/utils.test.js` — `isValidWindowDefs` accept/reject; `getTodayKey` with
   fixed `Date` + explicit timezone; `isEligible` across frequency and window
   cases with fixed dates; one commitment-lifecycle builder round-trip
   (`buildCommitmentCheckInCard` or nearest equivalent). Use
   `beforeEach(() => setWindowDefs(DEFAULT_WINDOW_DEFS))` to reset the module
   singleton.
6. `src/eventLog.test.js` — pure exports only: `mergeEventsById` (dedupe,
   ordering, both-empty), `getStartOfWeek`, `formatTwentyFourHourTime` with
   explicit timezone. Do not call functions that touch `window.localStorage`.

Aim for meaningful behavioural coverage, roughly 8–20 assertions per module.
No mocking frameworks; plain inputs and expectations.

**Verify:** `npm install` then `npm run test:unit` → all green;
`npm run build` still succeeds.

**Risks:** a module import failing under Node (unlikely — guardrails already
import some). If one fails to import, drop that test file and report; do not
patch the module.

### Step 2 — ESLint flat config

**Create `eslint.config.js` (repo root) with exactly this shape:**

```js
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "dist/**", "node_modules/**", "android/**", "ios/**", "public/**",
      "playwright-report/**", "test-results/**", "screenshots/**",
      "design-system/**", "supabase/**", "docs/**", "e2e/**", "tests/**",
      "scripts/**", "*.config.js", "*.config.ts", "vite",
    ],
  },
  {
    files: ["src/**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        process: "readonly",
        __MYBISHBASH_VERSION__: "readonly",
      },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      // Correctness / dangerous patterns only. No stylistic rules.
      "no-undef": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error",
      "no-cond-assign": ["error", "except-parens"],
      "no-compare-neg-zero": "error",
      "no-self-assign": "error",
      "no-unsafe-negation": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-debugger": "error",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "react/jsx-uses-vars": "error",
      "react/jsx-no-undef": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
    },
  },
];
```

Note `js` is imported for future use of its rule metadata; if the linter flags
it unused under this config, drop the import — do not add the recommended
preset to silence it.

**Modify `package.json`:** add script `"lint": "eslint src"`.

**Run `npm run lint`.** Expected outcome: **zero errors**, possibly many
`no-unused-vars` warnings (acceptable; do not fix them in this phase).
Handling deviations:
- `no-undef` on genuine globals (e.g. Capacitor injections, test flags):
  add the specific global to the config's `globals` block — never disable the rule.
- Any **error** from `rules-of-hooks`, `no-dupe-keys`, `no-unreachable`, etc.
  is potentially a real bug: **stop, do not refactor**, report the finding, and
  only if it is unambiguous dead code confirmed harmless may it be left with a
  targeted `// eslint-disable-next-line <rule> -- Phase 0: pre-existing, see report`
  comment. Prefer reporting over silencing.

**Verify:** `npm run lint` exits 0; `npm run test:unit` and `npm run build`
still green.

### Step 3 — (nothing) — deliberately no autofix pass

There is no formatting or `--fix` step. Skip to Step 4.

### Step 4 — Enforcement wiring

**Modify `package.json` `test` script** — prepend the fast checks so they
fail before the slow build:

```
"test": "npm run lint && npm run test:unit && npm run build && npm run test:launcher-flow && …(rest unchanged)"
```

**Modify `scripts/test-before-push.mjs`** — add two entries at the **front**
of the `checks` array (everything else unchanged):

```js
["Lint", ["npm", "run", "lint"]],
["Unit tests", ["npm", "run", "test:unit"]],
```

**Modify `.github/workflows/staging-checks.yml`** — insert two steps in the
`checks` job after "Install dependencies" and before "Build":

```yaml
      - name: Lint
        run: npm run lint

      - name: Unit tests
        run: npm run test:unit
```

(They also run inside `test:before-push` later in the job; the early steps
exist for fail-fast and for a visible, named CI signal. Do not deduplicate.)

**Verify:** `npm run test:before-push` passes end-to-end locally;
`npm run test:release-guardrails` passes; YAML parses (`npx yaml` not needed —
rely on CI or a careful read).

---

## Test strategy — commands that must pass

After Step 1: `npm run test:unit` · `npm run build`
After Step 2: `npm run lint` · `npm run test:unit` · `npm run build`
After Step 4 (full gate, required before the final commit):

```
npm run lint
npm run test:unit
npm run build
npm run test:release-guardrails
npm run test:before-push
```

The existing release guardrails and e2e suite are preserved untouched; the new
tooling only *adds* enforcement points.

## Acceptance criteria (all objective)

- [ ] `npm run test:unit` runs ≥6 test files, all green, in <10s locally.
- [ ] `npm run lint` exits 0 with zero **errors** (warnings permitted).
- [ ] `npm run build` output is byte-equivalent in structure (same chunk names
      in `dist/assets/`) — no production code changed, so bundles must not
      change beyond hashes.
- [ ] `npm run test:before-push` passes with Lint and Unit tests as its first
      two checks.
- [ ] `npm run test:release-guardrails` passes unchanged.
- [ ] `staging-checks.yml` contains Lint + Unit steps before Build; CI run on
      the pushed branch is green.
- [ ] `git diff --stat` shows **zero changes under `src/`** except new
      `*.test.js` files (and, only if unavoidable, targeted
      eslint-disable-next-line comments reported explicitly).
- [ ] No changes to `playwright.config.ts`, `vite.config.js`, deploy workflows,
      Capacitor config, or any file in `public/`, `ios/`, `android/`.
- [ ] User-visible behaviour unchanged (guaranteed by the src-diff criterion).

Capacitor note: this phase adds devDependencies only, so `npx cap sync` is not
required; `capacitor.config.json`, `ios/`, `android/` must show no diff.

## Rollback criteria

Revert the phase (git revert of its commits) rather than patching forward if:
- CI `staging-checks` cannot be made green within one working session, or
- `npm ci` fails on Node 20 due to a dependency conflict introduced here, or
- the guardrail or e2e suites fail in any way traceable to the new tooling.

Rollback is trivial by construction: no production code changes.

## Commit plan

| # | Message | Contents | Verify before next |
|---|---|---|---|
| 1 | `Add Vitest unit test harness for pure lib modules` | `vitest.config.js`, `package.json`+`package-lock.json` (vitest dep + `test:unit`), 6 test files | `npm run test:unit`, `npm run build` |
| 2 | `Add ESLint correctness-only flat config` | `eslint.config.js`, `package.json`+lock (eslint deps + `lint`) | `npm run lint`, `npm run test:unit`, `npm run build` |
| 3 | `Wire lint and unit tests into release checks` | `package.json` (`test` chain), `scripts/test-before-push.mjs`, `.github/workflows/staging-checks.yml` | `npm run test:before-push`, `npm run test:release-guardrails` |

Push to `staging` only after commit 3's verification passes.

---

## Sonnet execution prompt

Paste the following into a fresh Claude Sonnet session in this repository:

```
You are implementing Phase 0 of the myBishBash architecture roadmap on branch
`staging`.

Read these documents completely before touching anything:
1. docs/architecture-blueprint.md (context only — do not implement it)
2. docs/architecture/phase-00-safety-tooling.md (your work order — follow it exactly)
3. docs/architecture/roadmap-status.md

Then inspect the repository to confirm the packet's "Current-state evidence"
section still matches reality: package.json scripts, scripts/test-before-push.mjs,
.github/workflows/staging-checks.yml, playwright.config.ts testMatch, and the
modules listed for testing. If ANY evidence item no longer matches, STOP and
report the discrepancy instead of adapting the plan yourself.

Rules:
- Work ONLY on Phase 0. Do not begin Phase 1 or any blueprint refactoring.
- Follow the packet's implementation steps in order, with its exact configs.
- Make small, reversible changes; follow the packet's 3-commit plan.
- Run the packet's verification commands after every step; do not proceed past
  a failing check.
- Do not modify any file under src/ except adding the six *.test.js files.
  If a lint ERROR seems to require a production-code change, stop and report it.
- Do not add packages beyond the packet's devDependency list.
- Preserve all existing behaviour: guardrails, e2e, build output, Capacitor.
- Read each module before writing its tests; derive expectations from actual
  behaviour, not assumptions. If a test exposes a likely bug, keep the module
  unchanged, write the test around current behaviour, and flag it in your report.
- Update docs/architecture/roadmap-status.md: set Phase 0 to "In progress" in
  your first commit and to "Complete" (with commit hashes) in your last.
- Commit after each stage passes its checks; push to staging only after the
  full gate passes: npm run lint && npm run test:unit && npm run build &&
  npm run test:release-guardrails && npm run test:before-push.

When finished, report: (a) each commit hash and message, (b) all files
created/modified, (c) the output summary of every verification command,
(d) any lint findings that look like real bugs, (e) anything that contradicted
the packet.
```
