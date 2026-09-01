# myBishBash — Staging Performance & Bug Audit

**Date:** 2026-07-08 · **Branch audited:** `staging` · **Scope:** performance, visible bugs, UX polish. **Audit only — no fixes applied.**

Method: static analysis of the built bundle (`dist/`), source review of `App.jsx`, `LogPanel.jsx`, `service-worker.js`, routing and demo-mode logic, plus a live run of the dev server (home, Log, onboarding) with console/network inspection.

---

## 1. Executive summary

### Top 5 problems slowing or damaging staging

1. **420 KB of gzipped JS/CSS on the critical path of *every* route** — including the marketing landing page. The charting library `recharts` (153 KB gz) is `modulepreload`-ed on first paint even though it only powers two small charts, because `LogPanel` (which imports recharts) is a static import of `App.jsx`. This is the single biggest first-load cost. *(Perf-1)*
2. **The service worker re-downloads all JS/CSS on every launch.** It fetches every script/style `network-first` with `cache: "no-store"`, which bypasses the browser HTTP cache for content-hashed, immutable chunks. Returning users and the installed PWA pay the full ~1 MB download every single time instead of getting instant cache hits. *(Perf-2)*
3. **`App.jsx` is a 13,716-line component with 132 `useState`, 87 `useEffect`, 76 inline child components, and zero `React.memo` anywhere in the codebase.** Every state change (including timers/intervals) re-renders the entire tree. This is the main source of interaction sluggishness. *(Perf-3)*
4. **Demo/test mode is reachable in production and destroys real user data.** `?demoOnboarding=1`, `/demo-onboarding`, and `?demoSignup=1` are *not* dev-gated. Hitting one wipes local data (cards, profile, event log, setup flag), enters E2E/tester/demo mode, and sets the profile to `plan: premium`. *(Bug-2)*
5. **Rules-of-Hooks violation in `App()`.** The component returns early for marketing routes *before* calling its hooks. It only survives because marketing→app navigation is a full page reload; any future client-side transition throws "Rendered more hooks than during the previous render." *(Bug-1)*

### Is it production-ready?

**Not yet.** The app *functions* — flows render, empty states are thoughtful, the service worker is safe against stale HTML — but it is not ready for a fresh round of user testing. Two P0 issues (production demo-mode data wipe, hooks fragility) are correctness/trust risks, and the load performance will read as "slow and heavy" on the mobile devices this product targets. These are fixable in days, not weeks.

### Biggest retention & trust risks

- **Data loss / premium bypass via public URL params** (Bug-2) — the most serious trust risk. A shared or mistyped link can wipe a real user and silently unlock premium.
- **First-load weight** (Perf-1/2) — a wellbeing app that feels heavy contradicts its own promise; slow first paint is the #1 predictor of bounce on a landing page.
- **PII in console logs** — `[AUTH] Email:` and session-storage probing ship to the production console (Perf-5).
- **Apple-only serif branding** — the elegant serif renders as Times New Roman on Android/Windows, cheapening the look on a platform that has a shipping Android build (UX-6).

---

## 2. Performance findings

### Perf-1 — 420 KB gz critical-path payload; recharts loaded on every route
- **Symptom:** Heavy first load; large JS parse/exec before interactive, even on the landing page and for brand-new users with no data.
- **Where:** All routes. Confirmed on landing, app home, and Log empty state.
- **Evidence:**
  - `dist/index.html` `modulepreload`s: `recharts` (514 KB raw / **153 KB gz**), `motion` (39 KB gz), `supabase` (52 KB gz), plus `index` (124 KB gz) and one `index.css` (272 KB raw / **51 KB gz**). Measured total critical path ≈ **420 KB gz (~1.5 MB uncompressed)**.
  - `recharts` is a *static* dependency of the main `index` chunk: `App.jsx:2` eagerly imports `./components/LogPanel`, and `LogPanel.jsx:2` does `import { BarChart, ... } from "recharts"`.
  - Live: the Log screen renders the "Your last 14 days" recharts card even with zero events.
- **Likely cause:** Eager import chain `App → LogPanel → recharts`. `supabase` and `framer-motion` are also imported at module top-level rather than lazily.
- **Severity:** **Critical**
- **Recommended fix:** Replace the small 14-day bar chart in `LogPanel` with a lightweight inline SVG/CSS bar chart (the data is 14 integers — recharts is wildly oversized for it), **or** lazy-load the entire Log panel behind `React.lazy`. Removing recharts from the critical path alone cuts ~153 KB gz. Then lazy-init the Supabase client on first auth/sync use, and confirm `framer-motion` is only pulled by code that actually animates.
- **Difficulty:** Medium (SVG chart swap is small; auditing the motion/supabase import graph is the longer part).

### Perf-2 — Service worker defeats HTTP caching of immutable hashed assets
- **Symptom:** Repeat visits and PWA relaunches are as slow as first load; no benefit from content-hashing.
- **Where:** `public/service-worker.js`.
- **Evidence:** Fetch handler routes scripts/styles through `networkFirst` (`service-worker.js:94-97`), which calls `fetch(request, { cache: "no-store" })` (`:190`, and `:176` for HTML). `no-store` bypasses and refuses to populate the browser HTTP cache. The SW's own `RUNTIME_CACHE` is only consulted as an *offline fallback*, so online every hashed chunk (recharts 514 KB, index 456 KB, etc.) is re-fetched from the network on every navigation.
- **Likely cause:** A single caching policy applied to both mutable HTML and immutable hashed assets. `no-store` is correct for `index.html` (prevents stale shells) but wrong for `/assets/*-[hash].js`.
- **Severity:** **High**
- **Recommended fix:** Split the policy: keep `network-first` + `no-store` for navigations/`index.html`/`version.json`; use **cache-first** (or stale-while-revalidate) for `/assets/*` hashed files — they never change under a given name, so a cache hit is always safe and instant. Let normal HTTP caching handle them by dropping `no-store` on that branch.
- **Difficulty:** Low–Medium.

### Perf-3 — Monolithic `App.jsx`, no memoization, whole-tree re-renders
- **Symptom:** Input latency, janky interactions, slow HMR in dev.
- **Where:** `src/App.jsx` (13,716 lines).
- **Evidence:** `132 useState`, `87 useEffect`, `44 useMemo`, `41 useRef`, `76` top-level `function Component` definitions inside the file; **0** occurrences of `React.memo` in the whole `src/` tree. Dev server logs a Babel deopt: *"has deoptimised the styling of App.jsx as it exceeds the max of 500KB."* Any state update in the root (timers, sync ticks, notification state) re-renders all 76 children.
- **Likely cause:** All app state and all screen components live in one root component; children receive fresh props/closures each render and are never memoized.
- **Severity:** **High**
- **Recommended fix (incremental, low-risk order):** (a) wrap the expensive screens — `LogPanel`, home, library, explore, overlays — in `React.memo` and stabilise their props with `useCallback`/`useMemo`; (b) move high-frequency state (intervals, "now" clocks, launch overlay timers) into small isolated child components or a context so ticks don't re-render the whole app; (c) longer term, extract screens into their own modules to restore fast-refresh and shrink the main chunk. Do (a)/(b) first — they're safe and measurable.
- **Difficulty:** Medium (a/b) → High (full split).

### Perf-4 — 261 KB hand-written `styles.css` shipped as one blocking stylesheet
- **Symptom:** ~51 KB gz of render-blocking CSS, much of it likely unused per route.
- **Where:** `src/styles.css` (12,840 lines) + Tailwind → `dist/assets/index-*.css` 272 KB raw / 51 KB gz.
- **Evidence:** File sizes above; single `<link rel="stylesheet">` in built HTML.
- **Likely cause:** One global stylesheet for every screen; marketing pages already split their CSS but the app CSS is monolithic.
- **Severity:** **Medium**
- **Recommended fix:** Not urgent. Later, audit for dead selectors and consider per-route CSS. Don't hand-optimise before measuring.
- **Difficulty:** Medium.

### Perf-5 — 51 ungated `console.log`s in production, some leaking PII
- **Symptom:** Console noise; privacy/trust exposure.
- **Where:** Throughout `App.jsx` and libs (51 `console.log` outside `/testing/`).
- **Evidence:** `App.jsx:2575` `console.log("[AUTH] Email:", currentSession.user.email)` and `:2576` probes `localStorage` for the auth token — **both ungated**. `App.jsx:4496` `[NOTIFICATIONS] Saving notification preferences` fires on load (observed live). Some logs *are* correctly flag-gated (`debugLaunch`, `App.jsx:466-468`), so this is inconsistent rather than absent.
- **Likely cause:** Debug logging left in; no central gate.
- **Severity:** **Medium** (Low for perf, Medium for trust — PII in console)
- **Recommended fix:** Remove or route all logging through a single `import.meta.env.DEV`-gated logger; never log email/session details.
- **Difficulty:** Low.

### Perf-6 — Dead Google Fonts preconnects
- **Symptom:** Two unnecessary DNS/TLS handshakes on first load.
- **Where:** `index.html:50-51` preconnect to `fonts.googleapis.com` / `fonts.gstatic.com`.
- **Evidence:** No web fonts are loaded anywhere — the app uses system stacks only (`styles.css:70` Inter fallback, `:184+` "Iowan Old Style"/Baskerville serif). No `@font-face`, no font stylesheet link.
- **Severity:** **Low**
- **Recommended fix:** Delete the two preconnects.
- **Difficulty:** Trivial.

---

## 3. Bug findings

### Bug-1 — Rules-of-Hooks violation in `App()` (latent crash)
- **What happens:** `App()` conditionally `return`s JSX for `/early-access`, `/download`, `/about`, `/terms`, `/privacy`, and `/` (`App.jsx:1755-1780`) **before** it calls `useMemo`/`useRef`/`useState` (starting `App.jsx:1782`). Hooks are therefore called on some renders and not others.
- **Expected:** Hooks must run unconditionally in the same order every render (React's first rule).
- **Steps to reproduce:** Not currently reproducible in the UI because marketing CTAs (`Get myBishBash`, etc.) are `<a href>` full-page navigations, so React remounts and never transitions between the two hook paths within one mounted tree. It **will** throw "Rendered more hooks than during the previous render" the moment any client-side/SPA transition is introduced between a marketing route and the app.
- **Likely cause:** Route dispatch was placed at the top of the component instead of above it / in a router.
- **Relevant file:** `src/App.jsx:1735-1804`.
- **Severity:** **High** (latent crash + it disables reliable Fast Refresh and invites subtle bugs).
- **Recommended fix:** Lift route selection above `App` (a tiny `RootRouter` that renders `<App/>` or the marketing/legal page), so `App` always runs its hooks. No behaviour change for users.

### Bug-2 — Demo/test mode reachable in production; wipes data and unlocks premium
- **What happens:** Visiting `…/?demoOnboarding=1`, `…/demo-onboarding`, or `…/?demoSignup=1` triggers `resetDemoOnboardingState()` / `resetDemoSignupState()`, which **removes** localStorage keys (`mybishbash.cards.v1`, `…profile.v1`, `…event-log.v1`, `…setup-complete.v1`, launcher/pause settings, offline queue) and sets `MYBISHBASH_E2E_MODE`, `E2E_TESTER_MODE`, `DEMO_MODE = true` plus a `plan: "premium"` demo profile.
- **Expected:** Demo/E2E/tester scaffolding must never run in production; real user data must never be cleared by a URL param.
- **Steps to reproduce:** In a browser with a real (or in-progress) local session, load `/<base>/?demoOnboarding=1` → local cards/profile/log are cleared and the app enters demo onboarding as a premium tester.
- **Likely cause:** `shouldStartDemoOnboarding()` / `shouldStartDemoSignup()` (`App.jsx:1655-1671`) are **not** `import.meta.env.DEV`-gated, and are invoked unconditionally in `App()` (`App.jsx:1740-1746`). Note the sibling `applyLocalNormalPreviewFlag()` *is* correctly `DEV`-gated (`:1724`) — so this is an inconsistency, not a deliberate prod feature.
- **Relevant file:** `src/App.jsx:1655-1671`, `:1695-1746`.
- **Severity:** **Critical** (data loss + entitlement bypass + demo-data leakage).
- **Recommended fix:** Gate all demo/E2E entrypoints behind `import.meta.env.DEV` (or a build flag), exactly like `applyLocalNormalPreviewFlag`. Add a release-guardrail test asserting these params are inert in a production build.

### Bug-3 — `[NOTIFICATIONS] Saving notification preferences` logs on load (minor)
- **What happens:** The log at `App.jsx:4496` fires during normal load/onboarding (observed).
- **Expected:** No production logging.
- **Severity:** **Low** (subset of Perf-5).
- **Fix:** Remove/gate.

### Verification notes (checked, no bug found)
- **"Plant moved from Logs/homepage":** The plant is the pure-SVG `GrowthFlower` (`LogPanel.jsx:88`), which currently renders **only** in the Log hero card when `weeklyShiftCount > 0`. The home screen uses `HomeProgressRing` (`App.jsx:8507`), not a plant. No orphaned/dead plant code was found (the only other "plant" string is unrelated onboarding copy at `Onboarding.jsx:38`). **Action:** confirm the intended placement is Log-only; nothing is broken, but the ask implies a design decision worth double-checking against the current build.
- **Failed assets / network errors:** none observed in the live run.
- **Service worker update loop:** none — `controllerchange` only logs (`registerServiceWorker.js:44-46`); reload is user-initiated (`appUpdate.js:43`).

---

## 4. UX polish issues

- **UX-6 — Apple-only serif branding (trust):** the display serif is `"Iowan Old Style", "Baskerville", "Times New Roman", serif` (`styles.css:184+`). On Android and Windows this falls back to **Times New Roman**, which looks dated — and there is a shipping Android Capacitor build. *Recommend:* self-host one lightweight serif (subsetted, `font-display: swap`) or choose a cross-platform stack. **Medium.**
- **Lag / re-renders:** covered by Perf-3 — input and screen transitions will feel heavier than they should until memoization lands.
- **Empty states:** strong, actually — home ("Your next step" checklist) and Log ("Your first little shift will appear here") are on-brand and reassuring. Keep them.
- **Loading state:** `PageSuspenseFallback` is used for lazy routes — verify it isn't a bare flash; a branded skeleton reads more premium.
- **Demo-data leakage:** the production reachability of demo mode (Bug-2) is also a leakage vector — a public link drops a real user into fake premium demo content.
- **Console PII:** logging the user's email (Perf-5) is a trust issue if a user opens devtools.
- **Broken navigation / confusing labels / overcrowding:** none blocking found in the audited flows (home, Log, onboarding step 1). Recommend a dedicated pass over the full 8-step onboarding and the Apps/Packs setup once P0s are resolved.

---

## 5. Prioritised action plan

**P0 — must fix before users test again**
- **Bug-2** Gate demo/E2E URL entrypoints behind `DEV`/build flag + add guardrail test. *(trust + data loss)*
- **Bug-1** Lift routing above `App()` so hooks always run. *(latent crash)*
- **Perf-1** Remove recharts from the critical path (SVG chart or lazy Log). *(−153 KB gz first load)*

**P1 — should fix for retention**
- **Perf-2** Cache-first for hashed `/assets/*` in the service worker. *(fast repeat loads / PWA)*
- **Perf-3(a/b)** Memoize the main screens + isolate timer/tick state. *(interaction smoothness)*
- **Perf-5** Strip/gate all `console.log`, especially `[AUTH] Email:`. *(privacy)*

**P2 — polish**
- **UX-6** Cross-platform serif (fix Android/Windows Times New Roman).
- **Perf-6** Remove dead Google Fonts preconnects.
- Onboarding full-flow polish pass; branded Suspense skeleton.

**P3 — later improvements**
- **Perf-3(c)** Split `App.jsx` into route/screen modules (restores Fast Refresh, shrinks main chunk).
- **Perf-4** CSS dead-code audit / per-route CSS.
- Lazy-init Supabase; audit framer-motion usage.

---

## 6. Suggested implementation order (safe, incremental)

1. **Bug-2 first** — smallest, highest-risk-reduction change: add `import.meta.env.DEV` guards to `shouldStartDemoOnboarding`/`shouldStartDemoSignup` (and any other demo/E2E entrypoint), then add a release-guardrail test that a production build ignores `?demoOnboarding=1`. Verify a prod build no longer wipes data.
2. **Perf-5** — remove/gate `console.log`s (pure deletion, no behaviour change) so later diffs are clean. Do the `[AUTH] Email:` line immediately.
3. **Bug-1** — introduce a thin `RootRouter` above `App` and move the six early-return route branches into it. Verify every route still resolves (landing, /about, /download, /terms, /privacy, app home) and the app mounts once.
4. **Perf-1** — swap the `LogPanel` recharts chart for an inline SVG/CSS bar chart *or* wrap `LogPanel` in `React.lazy`. Rebuild and confirm `recharts` is gone from `dist/index.html` `modulepreload` and the main chunk. Measure critical-path gz before/after.
5. **Perf-2** — split the SW fetch handler: cache-first for `/assets/*`, keep network-first/no-store for navigations, `index.html`, and `version.json`. Test: install PWA, reload offline (must still work), reload online (assets should be cache hits, HTML fresh). Bump `SERVICE_WORKER_VERSION` handling is already automatic per build.
6. **Perf-3(a)** — `React.memo` + stable props on `LogPanel`, home, library, explore, overlays. Verify with React DevTools Profiler that a timer tick no longer re-renders all screens.
7. **Perf-3(b)** — extract interval/"now" state into isolated components.
8. **P2/P3** — serif font, preconnect cleanup, onboarding polish, then the larger `App.jsx` split and CSS audit once the above are stable and measured.

Each step is independently shippable and verifiable; none depends on a later one. Land 1–2 immediately (they're near-zero-risk), then batch 3–7 with before/after bundle + Profiler measurements.
