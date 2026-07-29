// Phase 0 lint policy: correctness and dangerous-pattern rules only.
// No stylistic/formatting rules — this config must never force a
// repo-wide rewrite. TypeScript linting arrives with Phase 7.
// See docs/architecture/phase-00-safety-tooling.md.
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

// ---------------------------------------------------------------------------
// Phase 4 Decision D5 — the single local write path, mechanically enforced.
//
// Direct `localStorage` WRITES (setItem/removeItem/clear) are prohibited in
// src/features/**, src/components/**, src/editing/** and src/App.jsx. Domain
// state persists through store actions, which call storage.js. Reads
// (getItem) stay legal. sessionStorage is out of D5's scope.
//
// This is a RATCHET, not a migration: the 26 pre-existing write sites are
// enumerated below as classified debt and are NOT relocated by this commit.
// Each exception is scoped to one exact file AND one exact storage key, so:
//   - a NEW write in any scoped file fails, including inside an excepted file;
//   - COPYING an existing write to another file fails, because the exception
//     does not travel with it;
//   - retiring a debt item is a one-line deletion from D5_EXCEPTIONS.
// Known limit (the finest granularity ESLint selectors permit): duplicating an
// already-excepted key *within its own file* is not caught.
// ---------------------------------------------------------------------------
const D5_MESSAGE =
  "Phase 4 D5: no direct localStorage writes here — persist via a store action (storage.js/services).";

const D5_SCOPE = [
  "src/features/**/*.{js,jsx}",
  "src/components/**/*.{js,jsx}",
  "src/editing/**/*.{js,jsx}",
  "src/App.jsx",
];

// `allow` entries are esquery fragments appended as :not(...) to both write
// selectors, keying each exception to the exact call it authorises.
function d5RestrictedSyntax(allow = []) {
  const except = allow.map((fragment) => `:not(${fragment})`).join("");
  const write = "[callee.property.name=/^(setItem|removeItem|clear)$/]";
  return [
    "error",
    {
      selector: `CallExpression[callee.object.name='localStorage']${write}${except}`,
      message: D5_MESSAGE,
    },
    {
      selector: `CallExpression[callee.object.property.name='localStorage']${write}${except}`,
      message: D5_MESSAGE,
    },
  ];
}

const key = (name) => `[arguments.0.name='${name}']`;
const literal = (value) => `[arguments.0.value='${value}']`;

// Debt classes:
//   AUTHORISED  — D5 pre-authorised storage-layer code living in a feature.
//   DIAGNOSTIC  — debugging/diagnostic ring buffers; never domain state.
//   UI-DRAFT    — dev-only draft or transient UI state (panel position, drafts).
//   ADMIN       — administrative/HQ view state.
//   MARKETING   — marketing attribution state.
//   TEST-FLAG   — demo/e2e environment flags and seeds, dev/e2e paths only.
//   DOMAIN-DEBT — genuine domain-state persistence that must move to a store
//                 or persistence adapter. These are the only ones D5 truly owes.
const D5_EXCEPTIONS = [
  { files: ["src/features/launcher/launchSessionStorage.js"], allow: [key("LAUNCH_SESSION_STORAGE_KEY")] }, // AUTHORISED — D5-named launch-session persistence; relocate to services/ in Phase 5.
  { files: ["src/features/launcher/commitmentDebug.js"], allow: [literal("mybishbash.commitmentDebug.v1")] }, // DIAGNOSTIC — capped 100-entry commitment-card debug ring buffer.
  { files: ["src/features/launcher/launchDebug.js"], allow: [literal("bishbash.launchDebug.v1")] }, // DIAGNOSTIC — capped 100-entry launch debug ring buffer.
  { files: ["src/features/hq/HQPanel.jsx"], allow: [key("HQ_VIEW_STORAGE_KEY")] }, // ADMIN — remembers the last HQ tab; mirrors the ?view= query param.
  { files: ["src/features/explore/ExplorePanel.jsx"], allow: [key("PREMIUM_INTEREST_KEY")] }, // DOMAIN-DEBT — premium-pack interest is user domain state; owed a packsStore action.
  { files: ["src/features/marketing/EarlyAccessPage.jsx"], allow: [key("WAITLIST_SOURCE_STORAGE_KEY")] }, // MARKETING — waitlist attribution source captured from the URL.
  { files: ["src/features/onboarding/Onboarding.jsx"], allow: [key("PROTECTED_APP_SETUP_PENDING_KEY")] }, // DOMAIN-DEBT — pending protected-app setup is onboarding domain state (write + clear); owed a store action.
  { files: ["src/editing/ContentEditContext.jsx"], allow: [key("storageKey"), literal("mybishbash.editPanelPosition.v1")] }, // UI-DRAFT — dev-only content drafts and edit-panel position; not shipped domain state.
  { files: ["src/App.jsx"], allow: [key("SIGNUP_ONBOARDING_PENDING_KEY")] }, // DOMAIN-DEBT — signup/onboarding handoff flag; owed a settingsStore action.
  { files: ["src/App.jsx"], allow: [key("key")] }, // TEST-FLAG — removeDemoResetKey's UNOWNED branch (MYBISHBASH_* flags + onboarding handoff keys); the storage.js-owned keys in the same lists go through removeStorageItem.
  { files: ["src/App.jsx"], allow: [literal("MYBISHBASH_DEMO_MODE")] }, // TEST-FLAG — demo-mode environment flag.
  { files: ["src/App.jsx"], allow: [literal("MYBISHBASH_E2E_MODE")] }, // TEST-FLAG — e2e-mode environment flag.
  { files: ["src/App.jsx"], allow: [literal("MYBISHBASH_E2E_TESTER_MODE")] }, // TEST-FLAG — e2e tester-mode environment flag.
  { files: ["src/App.jsx"], allow: [literal("mybishbash.pending-launcher-install.v1")] }, // DOMAIN-DEBT — pending-install queue drain; owed a launcher persistence adapter.
];

// ---------------------------------------------------------------------------
// Phase 5 commit 1.6 — the read side of the single funnel, mechanically
// enforced. (D5 above polices WRITES; this polices READS.)
//
// Direct `localStorage.getItem` of a key OWNED BY storage.js is prohibited
// across all of src/**. Owned keys are exactly storage.js's
// SHARED_STORAGE_KEYS, plus their `bishbash.`-prefixed legacy twins — the set
// the funnel's legacy-promotion shim is responsible for. Reading one directly
// skips that shim today and, once the persistence engine seam lands (commit 2),
// would read a localStorage value the engine may no longer be the source of
// truth for. Two of the five bypasses repaired in commit 1.5 were exactly this
// shape, in src/lib/ and src/stores/ — outside D5's scope entirely.
//
// SCOPED TO OWNED KEYS ONLY, deliberately. Per Ruling R1 the app has many
// legitimate direct localStorage reads that this rule must NOT touch:
// pre-hydration flags (MYBISHBASH_E2E_*, MYBISHBASH_DEMO_MODE, the E2E auth
// keys), device-local keys (dynamic-launchers.v1, launch-session.v1,
// pending-launcher-install.v1), diagnostic ring buffers (launchDebug,
// commitmentDebug), HQ/marketing view state and the Supabase session key.
// None are storage.js-owned; none are flagged.
//
// Out of scope by design:
//   src/storage.js       — IS the funnel; its own reads are the implementation.
//   src/services/db/**   — the IndexedDB engine layer (commit 2's home).
//   src/**/*.test.{js,jsx} — tests drive the funnel against recording stubs
//                            and must be able to assert on raw keys.
//
// Known limit (the finest granularity ESLint selectors permit, and the same
// one D5's write ratchet has): a key reached through a variable rather than a
// string literal — `localStorage.getItem(SOME_KEY)` — is not matched, because
// ESLint selectors cannot resolve the constant's value. storage.js exports no
// key constants, so a bypass author must still write the literal in their own
// file; the rule catches the call-site form, not the aliased form.
// ---------------------------------------------------------------------------
const OWNED_READ_MESSAGE =
  "Phase 5 commit 1.6: no direct localStorage read of a storage.js-owned key — read it through getStorageItem() (src/storage.js).";

// Exactly storage.js's SHARED_STORAGE_KEYS, with the `bishbash.` legacy twins.
const OWNED_KEY_PATTERN =
  "^(my)?bishbash\\.(cards|setup-complete|mood|profile|home-screen-versions" +
  "|home-screen-selected|card-packs|hidden-library-packs|disliked-pack-card-ids" +
  "|global-interruption-mode|launcher-behavior-settings|action-cards" +
  "|action-card-defaults-version|notifications|notification-schedule|app-pauses" +
  "|timing-windows-prefs|event-log|offline-event-queue|user-id)\\.v1$";

// `allow` entries are esquery fragments appended as :not(...) to both read
// selectors, keying each exception to the exact call it authorises.
function ownedReadRestrictedSyntax(allow = []) {
  const except = allow.map((fragment) => `:not(${fragment})`).join("");
  const read = `[callee.property.name='getItem'][arguments.0.value=/${OWNED_KEY_PATTERN}/]`;
  return [
    { selector: `CallExpression[callee.object.name='localStorage']${read}${except}`, message: OWNED_READ_MESSAGE },
    { selector: `CallExpression[callee.object.property.name='localStorage']${read}${except}`, message: OWNED_READ_MESSAGE },
  ];
}

// Legitimate remaining direct reads of an owned key, each keyed to ONE exact
// file AND ONE exact key, each justified. Retiring one is a one-line deletion.
//
// EMPTY, and that is the finding: after commit 1.5 closed the five bypasses
// and commit 1.6 funnelled the demo-reset path, src/** contains no direct read
// of a storage.js-owned key at all. The rule asserts a real, currently-total
// property rather than papering over debt. Any entry added here is new debt
// and must carry its own justification.
const OWNED_READ_EXCEPTIONS = [];

// Composes the read selectors with D5's write selectors, because both live
// under the single `no-restricted-syntax` rule and flat config is
// last-block-wins per rule: any block that sets it must restate both halves.
function restrictedSyntax({ writeAllow = null, readAllow = [] } = {}) {
  const reads = ownedReadRestrictedSyntax(readAllow);
  if (writeAllow === null) return ["error", ...reads];
  const [, ...writes] = d5RestrictedSyntax(writeAllow);
  return ["error", ...reads, ...writes];
}

const D5_SCOPE_PREFIXES = ["src/features/", "src/components/", "src/editing/"];
const isD5Scoped = (files) =>
  files.some((file) => file === "src/App.jsx" || D5_SCOPE_PREFIXES.some((prefix) => file.startsWith(prefix)));

// The (possibly empty) D5 write allowances for a file, or null when the file is
// outside D5's scope entirely — so a read-only exception block never silently
// widens D5's write prohibition to a file it was never meant to police.
const d5WriteAllowFor = (files) =>
  (isD5Scoped(files)
    ? D5_EXCEPTIONS.filter((entry) => entry.files.join("|") === files.join("|")).flatMap((entry) => entry.allow)
    : null);

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
      // Off until Phase 4: 87 legacy useEffects would bury real signal.
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    // Unit tests call hooks directly, by design — that is what makes the
    // Phase 4b extraction testable. rules-of-hooks polices render order in
    // components and has nothing to say about a test harness.
    files: ["src/**/*.test.{js,jsx}"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  // Commit 1.6 read ratchet: the prohibition, applied to ALL of src/**.
  {
    files: ["src/**/*.{js,jsx,mjs}"],
    rules: { "no-restricted-syntax": restrictedSyntax() },
  },
  // Commit 1.6: the three out-of-scope-by-design areas (see the header above).
  // Not exceptions to the rule — places the rule has nothing to say about.
  {
    files: ["src/storage.js", "src/services/db/**/*.{js,jsx}", "src/**/*.test.{js,jsx}"],
    rules: { "no-restricted-syntax": "off" },
  },
  // D5 ratchet: the write prohibition, applied to every D5-scoped file with no
  // exceptions. Restates the read selectors because both halves share the one
  // `no-restricted-syntax` rule and flat config is last-block-wins per rule.
  {
    files: D5_SCOPE,
    rules: { "no-restricted-syntax": restrictedSyntax({ writeAllow: [] }) },
  },
  // Per-file exception blocks, generated from the two classified tables above.
  // Entries for the same file are merged so every allowance for that file
  // survives, and each block restates whichever half it is not excepting.
  ...Object.values(
    [...D5_EXCEPTIONS.map((e) => ({ ...e, kind: "write" })), ...OWNED_READ_EXCEPTIONS.map((e) => ({ ...e, kind: "read" }))]
      .reduce((groups, entry) => {
        const id = entry.files.join("|");
        groups[id] = groups[id] || { files: entry.files, writeAllow: [], readAllow: [] };
        groups[id][entry.kind === "read" ? "readAllow" : "writeAllow"].push(...entry.allow);
        return groups;
      }, {}),
  ).map(({ files, writeAllow, readAllow }) => ({
    files,
    rules: {
      "no-restricted-syntax": restrictedSyntax({
        // A file with only read exceptions still needs D5's write selectors if
        // it is D5-scoped; d5WriteAllowFor recovers them, or null if it isn't.
        writeAllow: writeAllow.length ? writeAllow : d5WriteAllowFor(files),
        readAllow,
      }),
    },
  })),
];
