# Phase 1 — Error telemetry (unhandled errors only)

**Blueprint:** `docs/architecture-blueprint.md` §19 Phase 1
**Status tracker:** `docs/architecture/roadmap-status.md`
**Depends on:** Phase 0 complete (Vitest + ESLint present and wired into CI).
**Executor:** Claude Sonnet, fresh session, branch `staging`.

---

## Objective

Make production errors visible: a root error boundary above `App`, global
`window.onerror` / `unhandledrejection` handlers, and a scrubbed, deduped,
rate-limited reporter that inserts into a new `client_errors` Supabase table
through the app's existing (nullable) Supabase client.

**Deliberately NOT attempted in this phase:**
- No product analytics, no `track()` facade, no session replay, no user
  tracking, no breadcrumbs. Only unhandled errors, unhandled promise
  rejections, and React boundary catches.
- No third-party telemetry SDK (no Sentry etc.).
- No HQ/admin UI for reading errors (read via Supabase dashboard for now).
- No sourcemap changes (production builds stay without sourcemaps).
- No refactoring of `App.jsx` beyond one import + one line in
  `AppShellErrorBoundary.componentDidCatch`.
- No changes to the existing `eventLog.js` / `saveLauncherEvent` pipelines.

## Decisions (resolved — do not relitigate during implementation)

1. **Provider:** provider-neutral, self-hosted. A tiny facade
   (`reportError`) writing to a `client_errors` Postgres table via the existing
   `supabase` client. Zero cost, zero new vendors, data stays in the project's
   Supabase. The facade is the only public API, so a vendor SDK could replace
   the transport later without touching call sites.
2. **Never included in reports:** auth tokens/JWTs, emails, access codes,
   card/pack/journal content, sync payloads, localStorage contents, URL query
   strings or hashes (handoff refs and codes travel in queries). Included
   fields are limited to: scrubbed message, scrubbed stack, `location.pathname`
   only, error kind, app release (`__MYBISHBASH_VERSION__`), platform
   (web/ios/android), user agent, authenticated user id (uuid). The scrubber
   additionally redacts JWT-shaped strings (`eyJ…`) and email-shaped strings
   from message and stack as defence in depth.
3. **Missing env → permanent silent no-op.** `supabase` from
   `src/lib/supabaseClient.js` is already `null` when `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` are absent; the reporter checks
   `isSupabaseConfigured()` once and disables itself. Console logging is
   unaffected. No error, no queue growth.
4. **Scope is unhandled errors + rejections + boundary catches only** (see
   Objective). Anything broader is out of scope until Phase 4+.
5. **Sourcemaps stay disabled in production** (current Vite default; no
   `build.sourcemap` is set and none is added). Release triage uses
   `__MYBISHBASH_VERSION__` + `version.json`'s `sourceSha` to identify the
   exact build; minified stacks are acceptable at current scale. Revisit only
   if triage proves impractical — and then prefer CI-retained (not deployed)
   sourcemaps.
6. **Authenticated-only inserts.** `client_errors.user_id` is NOT NULL with an
   RLS insert-own policy. Pre-auth errors are held in a small in-memory buffer
   (cap 10, oldest dropped) and flushed once a session exists; if the user
   never signs in they are console-only. Rationale: an anon-writable table is
   an abuse vector; nearly all real usage is behind the signup gate.
7. **Loop and flood safety:** the reporter never throws (every path wrapped);
   errors originating from the reporter's own files are ignored; per-session
   dedupe by signature (message + first stack frame) with a `count` increment
   capped at 3 reports per signature; hard cap 20 inserts per page session;
   failures (offline, missing table, RLS denial) are swallowed after one
   retry-on-next-report.
8. **Disabled contexts:** DEV (`import.meta.env.DEV` — console passthrough
   with a `[client-error]` prefix, never network), e2e
   (`localStorage.MYBISHBASH_E2E_MODE === "true"` or
   `MYBISHBASH_E2E_AUTH_MOCK === "true"`), and demo
   (`MYBISHBASH_DEMO_MODE === "true"`), matching the app's existing flags.

## Current-state evidence (verified 2026-07-10)

- `src/main.jsx` (23 lines): perf mark → `initDynamicLaunchersFromCache()` →
  `registerServiceWorker()` → `ReactDOM.createRoot(...).render(<App />)`.
  No boundary, no global handlers. This is the primary integration point.
- `src/App.jsx:738` — `AppShellErrorBoundary` exists: recovery UI
  (`data-testid="app-shell-error"`), `onRecover` prop, reset via `resetKey`,
  and `componentDidCatch` that only does
  `console.error("[APP_SHELL_ERROR]", error, info)`. It wraps the app shell at
  `App.jsx:6966–7238`. It must keep working exactly as-is; Phase 1 adds one
  report call inside `componentDidCatch`.
- `src/lib/supabaseClient.js` exports a **nullable** `supabase` and
  `isSupabaseConfigured()`. Auth storage key `mybishbash.supabase.auth.v1`.
- Global define `__MYBISHBASH_VERSION__` exists (`vite.config.js`), and the
  build emits `version.json` with `{version, sourceSha, builtAt}`. Use
  `typeof __MYBISHBASH_VERSION__ !== "undefined" ? __MYBISHBASH_VERSION__ : "dev"`.
- Capacitor 8 (`@capacitor/core`) is a runtime dependency; platform via
  `Capacitor.getPlatform()` (guard with try/catch; returns "web" in browsers).
- Admin-read RLS house style (see
  `supabase/migrations/202606120001_access_tiers_grants_audit.sql`):
  `exists (select 1 from public.admin_users admins where admins.user_id = auth.uid())`.
- Migration naming convention: `2026MMDDNNNN_snake_case_name.sql` under
  `supabase/migrations/`. Migrations are applied to the hosted project
  manually/CLI — **committing the file does not apply it** (see Step 5).
- `scripts/test-release-guardrails.mjs` regex-scans `src/App.jsx` (among
  others). Any App.jsx edit must be followed by `npm run test:release-guardrails`.
- E2E/demo mode flags (localStorage): `MYBISHBASH_E2E_MODE`
  (`src/App.jsx:212`), `MYBISHBASH_E2E_AUTH_MOCK`, `MYBISHBASH_DEMO_MODE`
  (`src/lib/mybishbashSync.js`).
- Staging smoke e2e in CI: `tests/e2e/release-smoke.spec.ts`,
  `commitment-cards.spec.ts`, `card-overlay-mobile.spec.ts` — these must pass
  unchanged.

## Packages to add

**None.** Everything uses existing dependencies (`@supabase/supabase-js`,
`@capacitor/core`, React) and Phase 0 tooling.

---

## Implementation steps (ordered)

### Step 1 — Pure scrubbing module + unit tests

**Create `src/services/errors/scrub.js`** (pure, no imports from the app, no
side effects — fully unit-testable in Node):

- `scrubText(text, maxLength)` — coerce to string; redact JWT-shaped tokens
  (`/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g` → `[jwt]`),
  redact email-shaped strings
  (`/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g` → `[email]`), strip
  full URLs' query/hash portions (`/([?#])[^\s'")]+/g` → `$1[redacted]`),
  truncate to `maxLength`.
- `getErrorSignature(report)` — `kind + "|" + first 120 chars of message +
  "|" + first stack line`.
- `buildErrorReport({ error, kind, release, platform, pathname, userAgent })` —
  returns `{ kind, message, stack, route, release, platform, user_agent }`
  where `message` = `scrubText(error?.message ?? String(error), 500)`,
  `stack` = `scrubText(error?.stack ?? "", 6000)`, `route` = pathname only
  (strip any `?`/`#` remnants), non-Error inputs handled (strings, undefined,
  objects without message).

**Create `src/services/errors/scrub.test.js`** — cases: JWT redaction, email
redaction, query-string stripping, truncation lengths, non-Error inputs,
signature stability for identical errors and difference for distinct ones.

**Verify:** `npm run test:unit`, `npm run lint`.

### Step 2 — Reporter with injectable transport + unit tests

**Create `src/services/errors/reporter.js`.** Public API:

- `configureReporter({ transport, getSession, isEnabled } = {})` — test seam;
  production defaults wire to Supabase (below).
- `reportError(error, kind, context = {})` — builds report via `scrub.js`,
  applies dedupe/caps, buffers, and triggers an async flush. **Must never
  throw and never return a rejected promise to callers.**
- `installGlobalErrorHandlers()` — idempotent (guard flag); adds
  `window.addEventListener("error", …)` mapping `event.error ?? event.message`
  → `reportError(err, "window-error")`, and
  `window.addEventListener("unhandledrejection", …)` mapping `event.reason` →
  `reportError(reason, "unhandled-rejection")`. Never calls
  `event.preventDefault()` — existing console behaviour must remain visible.

Internal behaviour (encode exactly the decisions above):

- **Enablement check** (computed once, lazily): disabled if
  `!isSupabaseConfigured()`, `import.meta.env.DEV`, or any of the three
  localStorage flags (`MYBISHBASH_E2E_MODE`, `MYBISHBASH_E2E_AUTH_MOCK`,
  `MYBISHBASH_DEMO_MODE`) is `"true"`. In DEV, `reportError` logs
  `console.warn("[client-error]", report)` and stops.
- **Self-exclusion:** if `stack` contains `services/errors`, drop silently.
- **Dedupe:** `Map<signature, count>`; per signature, insert at counts 1–3
  then drop (the `count` column exists for future server-side rollups; client
  just stops sending).
- **Session cap:** max 20 transport calls per page load.
- **Buffer & flush:** reports queue in memory (cap 10, drop oldest). Flush:
  `const { data } = await supabase.auth.getSession()`; if no session, keep
  buffered (next report or `window` `"online"` event retries); if session,
  insert each report with `user_id: session.user.id, occurred_at` via
  `supabase.from("client_errors").insert(rows)`. Any transport failure
  (offline, PGRST205 missing table, RLS denial): keep rows buffered once,
  drop on second consecutive failure. All wrapped in try/catch.
- **Default transport/platform:** `supabase` from `../../lib/supabaseClient`;
  platform via `Capacitor.getPlatform()` in try/catch (fallback `"web"`);
  release via the `__MYBISHBASH_VERSION__` guard from the evidence section.

**Create `src/services/errors/reporter.test.js`** using
`configureReporter({ transport: fake, getSession: fake, isEnabled: () => true })`:
dedupe caps at 3; session cap at 20; no-session buffering then flush after
session appears; buffer cap 10 drops oldest; transport failure does not throw;
self-originated stacks dropped; disabled mode calls transport zero times.

**Verify:** `npm run test:unit`, `npm run lint`.

### Step 3 — Root boundary + main.jsx integration

**Create `src/services/errors/RootErrorBoundary.jsx`** — class component:
`getDerivedStateFromError`; `componentDidCatch` → `reportError(error,
"boundary", …)` plus a `console.error("[ROOT_ERROR]", error, info)`; fallback
UI is deliberately dependency-free (inline styles only — it must render even
if `styles.css` or the app failed): brand name text "myBishBash", one line
"Something went wrong.", and a `<button onClick={() =>
window.location.reload()}>Reload</button>` with
`data-testid="root-error-fallback"`.

**Modify `src/main.jsx`** (only these changes):
1. `import { installGlobalErrorHandlers } from "./services/errors/reporter";`
   and `import { RootErrorBoundary } from "./services/errors/RootErrorBoundary";`
2. Call `installGlobalErrorHandlers();` immediately after the imports execute
   (before `initDynamicLaunchersFromCache()`).
3. Wrap the render: `<RootErrorBoundary><App /></RootErrorBoundary>`.

Existing order of `initDynamicLaunchersFromCache()` →
`registerServiceWorker()` → render must be preserved.

**Verify:** `npm run test:unit && npm run lint && npm run build`, then
`npm run test:before-push` (includes launcher smoke). Manual dev check:
run `npm run dev`, in the browser console execute
`setTimeout(() => { throw new Error("telemetry-dev-check") }, 0)` and confirm
`[client-error]` appears in the console and **no network request** is made.

### Step 4 — Hook the existing AppShellErrorBoundary

**Modify `src/App.jsx`** — exactly two changes:
1. Add to the imports: `import { reportError } from "./services/errors/reporter";`
2. In `AppShellErrorBoundary.componentDidCatch` (App.jsx:748), after the
   existing `console.error("[APP_SHELL_ERROR]", error, info);` add:
   `reportError(error, "boundary");`

No other App.jsx changes of any kind.

**Verify:** `npm run test:release-guardrails` (App.jsx is regex-scanned —
this is the critical check), then `npm run test:before-push`.

### Step 5 — Database migration

**Create `supabase/migrations/202607100001_client_errors.sql`:**

```sql
-- Client error telemetry (Phase 1). Unhandled errors only — no analytics.
-- Reports are scrubbed client-side; this table must never receive tokens,
-- emails, access codes or user content.
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  release text,
  source_sha text,
  platform text,
  route text,
  kind text not null,
  message text not null,
  stack text,
  user_agent text,
  count integer not null default 1
);

alter table public.client_errors enable row level security;

drop policy if exists "users can insert their own error reports" on public.client_errors;
create policy "users can insert their own error reports"
  on public.client_errors
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "admins can read client errors" on public.client_errors;
create policy "admins can read client errors"
  on public.client_errors
  for select
  to authenticated
  using (
    exists (select 1 from public.admin_users admins where admins.user_id = auth.uid())
  );

create index if not exists client_errors_occurred_at_idx
  on public.client_errors (occurred_at desc);
create index if not exists client_errors_user_id_idx
  on public.client_errors (user_id);
```

No update/delete policies (append-only from clients); no anon insert; no user
select. **Applying this migration to the hosted Supabase project is a manual
release step for the maintainer** (`supabase db push` or dashboard SQL editor)
— the code ships safely before it (reporter treats a missing table as a
transport failure and stays silent).

**Verify:** SQL review only; confirm the reporter unit test covering
transport failure passes (this is the "table not applied yet" path).

---

## Test strategy — commands that must pass

After Steps 1–2: `npm run test:unit` · `npm run lint`
After Step 3: `npm run test:unit` · `npm run lint` · `npm run build` · dev-mode manual check (above)
After Step 4 (full gate, required before final commit):

```
npm run lint
npm run test:unit
npm run build
npm run test:release-guardrails
npm run test:before-push
npx playwright test tests/e2e/release-smoke.spec.ts tests/e2e/commitment-cards.spec.ts tests/e2e/card-overlay-mobile.spec.ts
```

Existing guardrails and e2e are the regression harness; nothing replaces them.

## Acceptance criteria

- [ ] All commands in the full gate pass.
- [ ] Unit tests prove: scrubbing (JWT/email/query redaction, truncation),
      dedupe cap 3, session cap 20, pre-auth buffering + post-auth flush,
      buffer cap 10, no-throw on transport failure, disabled-mode inertness.
- [ ] With Supabase env vars absent (`VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run build`
      then preview), the app boots and the reporter makes zero network calls.
- [ ] Dev manual check: thrown async error → `[client-error]` console output,
      no network request.
- [ ] `data-testid="app-shell-error"` recovery flow behaves exactly as before
      (covered by existing e2e passing unchanged).
- [ ] Production build succeeds; `dist/` contains no `.map` files
      (`find dist -name '*.map'` is empty — confirms sourcemap posture unchanged).
- [ ] `git diff src/App.jsx` shows exactly two hunks: one import line, one
      `reportError` line in `componentDidCatch`.
- [ ] `src/main.jsx` diff limited to the three integration changes in Step 3.
- [ ] No new npm dependencies (`git diff package.json` shows no dependency changes).
- [ ] Capacitor: no diff under `ios/`, `android/`, `capacitor.config.json`;
      platform detection guarded so web builds never crash.
- [ ] Migration file present, matching the SQL above; note in the final report
      that it still needs applying to the hosted project.

## Rollback criteria

Revert (git revert; the migration file is inert until applied) rather than
patch forward if:
- any existing e2e or guardrail failure traces to the boundary/handler changes,
- the reporter is observed causing repeated network calls, console flooding,
  or any user-visible behaviour change,
- `main.jsx` integration alters boot order symptoms (service worker, dynamic
  launcher registration, first paint) in any detectable way.

If the table is already applied in production at rollback time, leave it in
place (empty tables are harmless); do not write a down-migration.

## Commit plan

| # | Message | Contents | Verify before next |
|---|---|---|---|
| 1 | `Add client error scrubbing and reporter core` | `src/services/errors/scrub.js`, `reporter.js`, both `*.test.js` | `npm run test:unit`, `npm run lint` |
| 2 | `Install root error boundary and global error handlers` | `RootErrorBoundary.jsx`, `src/main.jsx` | `npm run build`, `npm run test:before-push`, dev manual check |
| 3 | `Report app shell boundary errors to telemetry` | `src/App.jsx` (2 lines) | `npm run test:release-guardrails`, `npm run test:before-push` |
| 4 | `Add client_errors table migration` | `supabase/migrations/202607100001_client_errors.sql`, roadmap-status update | SQL review; full gate; smoke e2e |

Push to `staging` only after commit 4's full gate passes.

---

## Sonnet execution prompt

Paste the following into a fresh Claude Sonnet session in this repository:

```
You are implementing Phase 1 of the myBishBash architecture roadmap on branch
`staging`. Phase 0 (Vitest + ESLint) must already be complete — verify
`npm run lint` and `npm run test:unit` exist and pass before starting; if they
don't, STOP and report.

Read these documents completely before touching anything:
1. docs/architecture-blueprint.md (context only — do not implement it)
2. docs/architecture/phase-01-error-telemetry.md (your work order — follow it exactly)
3. docs/architecture/roadmap-status.md

Then inspect the repository to confirm the packet's "Current-state evidence"
still matches: src/main.jsx structure, AppShellErrorBoundary at src/App.jsx
(~line 738) with its console-only componentDidCatch, the nullable client in
src/lib/supabaseClient.js, and the admin_users RLS pattern in the migrations.
If ANY evidence item no longer matches, STOP and report the discrepancy.

Rules:
- Work ONLY on Phase 1. No analytics, no tracking, no session replay, no
  refactors, no new npm packages, no sourcemap changes.
- The decisions in the packet's "Decisions" section are settled — implement
  them, do not redesign them.
- src/App.jsx may change by exactly two lines (one import, one reportError
  call). src/main.jsx only per Step 3. Everything else new lives under
  src/services/errors/ and supabase/migrations/.
- The reporter must never throw, never loop on its own errors, and must be
  inert in DEV, e2e, demo, and missing-env contexts — all unit-tested.
- Run the packet's verification commands after every step; treat a
  test:release-guardrails failure after the App.jsx edit as stop-the-line.
- Follow the 4-commit plan. Push to staging only after the full gate passes:
  lint, unit, build, guardrails, before-push, and the three staging smoke
  Playwright specs.
- Update docs/architecture/roadmap-status.md: Phase 1 "In progress" in your
  first commit, "Complete" with commit hashes in your last, and note that the
  client_errors migration still requires manual application to the hosted
  Supabase project.

When finished, report: (a) each commit hash and message, (b) files
created/modified, (c) verification command results, (d) the reminder that the
migration must be applied manually, (e) anything that contradicted the packet.
```
