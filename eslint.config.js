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
  { files: ["src/App.jsx"], allow: [key("key")] }, // TEST-FLAG — demoKeysToRemove.forEach purge in the demo/e2e reset helpers.
  { files: ["src/App.jsx"], allow: [literal("MYBISHBASH_DEMO_MODE")] }, // TEST-FLAG — demo-mode environment flag.
  { files: ["src/App.jsx"], allow: [literal("MYBISHBASH_E2E_MODE")] }, // TEST-FLAG — e2e-mode environment flag.
  { files: ["src/App.jsx"], allow: [literal("MYBISHBASH_E2E_TESTER_MODE")] }, // TEST-FLAG — e2e tester-mode environment flag.
  { files: ["src/App.jsx"], allow: [literal("mybishbash.setup-complete.v1")] }, // TEST-FLAG — demo reset seed, not a production write path.
  { files: ["src/App.jsx"], allow: [literal("mybishbash.profile.v1")] }, // TEST-FLAG — demo reset seed profile, not a production write path.
  { files: ["src/App.jsx"], allow: [literal("mybishbash.pending-launcher-install.v1")] }, // DOMAIN-DEBT — pending-install queue drain; owed a launcher persistence adapter.
];

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
  // D5 ratchet: the prohibition, applied to every scoped file with no exceptions.
  {
    files: D5_SCOPE,
    rules: { "no-restricted-syntax": d5RestrictedSyntax() },
  },
  // D5 ratchet: per-file exception blocks, generated from the classified debt
  // table above. Entries for the same file are merged so every allowance for
  // that file survives (flat config is last-block-wins per rule).
  ...Object.values(
    D5_EXCEPTIONS.reduce((groups, entry) => {
      const id = entry.files.join("|");
      groups[id] = groups[id] || { files: entry.files, allow: [] };
      groups[id].allow.push(...entry.allow);
      return groups;
    }, {}),
  ).map(({ files, allow }) => ({
    files,
    rules: { "no-restricted-syntax": d5RestrictedSyntax(allow) },
  })),
];
