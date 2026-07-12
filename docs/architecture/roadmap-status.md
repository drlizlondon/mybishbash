# Architecture roadmap — status tracker

Source of truth for progress against `docs/architecture-blueprint.md` §19.
Update this file in the same commit that changes a phase's status.

**Statuses:** `Complete` · `Ready` (entry criteria met, packet exists) ·
`In progress` · `Planned` (packet not yet written) · `Blocked` (dependencies unmet)

| # | Phase | Status | Packet | Depends on | Commits |
|---|---|---|---|---|---|
| — | Architecture audit & blueprint | **Complete** | `docs/architecture-blueprint.md` | — | (this commit) |
| 0 | Safety-net tooling (Vitest + ESLint + CI) | **Complete** | `docs/architecture/phase-00-safety-tooling.md` | — | `23b663c`, `a343ec8`, `ae504f0` (+ bug fixes `11c2001`) |
| 1 | Error telemetry (errors only) | **Complete** (migration applied + RLS verified) | `docs/architecture/phase-01-error-telemetry.md` | 0 | `f57b923`, `8c7d000`, `6f17286`, `d6bdb22`, fix-forward `ce78e63` |
| 2 | Composition root (providers + router extraction) | **Ready** | `docs/architecture/phase-02-composition-root.md` | 0, 1 | — |
| 3 | Feature module extraction | Planned | — | 2 | — |
| 4 | Domain stores & single write path (local) | Planned | — | 3 | — |
| 5 | IndexedDB persistence engine | Planned | — | 4 | — |
| 6 | Sync v2 — entities + mutation queue | Planned | — | 5 | — |
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
  overlay host + descriptor stack; App.jsx < 3,000 lines; no cross-feature
  internal imports (lint rule); bundle budget respected.

### Phase 4 — Domain stores & single write path
- **Entry:** Phase 3 complete. Scope note: only shared/persistent domain state
  enters stores — local transient UI state stays in components.
- **Exit:** store actions are the only local-persistence writers
  (lint-enforced); launch-session reducer extracted with ≥95% branch coverage;
  App() < 800 lines; e2e green twice consecutively.

### Phase 5 — IndexedDB engine
- **Entry:** Phase 4 complete (all writes flow through actions).
- **Exit:** stores hydrate from IndexedDB; idempotent localStorage import with
  one-release rollback; Chromium + WebKit e2e green; 10k-event boot < 1s.

### Phase 6 — Sync v2 (entities + mutation queue)
- **Entry:** Phase 5 complete; tester cohort available; feature flag ready.
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
  - **Migration applied to hosted staging (2026-07-12).** Applied via the
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
