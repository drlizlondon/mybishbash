// Phase 0 lint policy: correctness and dangerous-pattern rules only.
// No stylistic/formatting rules — this config must never force a
// repo-wide rewrite. TypeScript linting arrives with Phase 7.
// See docs/architecture/phase-00-safety-tooling.md.
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
];
