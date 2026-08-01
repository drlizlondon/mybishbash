# Phase 6 Preflight Commit 0 — rollout evidence

**Date:** 2026-08-01
**Repository branch:** `staging`
**Runtime Phase 6 status:** **Blocked — Commit 1 has not started**
**Hosted database boundary:** staging and production share Supabase project
`ifcgomivmzwqqxhltfjj`; the hosted work below affected the production database.

## Decision

Preflight Commit 0 supplies an independent, fail-closed Sync v2 rollout
control whose only currently valid authority is `blob`. Its migration and
authenticated assignment paths have been exercised locally and against the
shared hosted database. The required operational tester cohort does not exist
on the recorded evidence, and the remaining manual Phase 5 acceptance checks
have not been recorded. Phase 6 therefore remains `Blocked`; no entity schema,
queue, transport, runtime sync service, or Commit 1 work is authorised.

## Repository implementation

Commit `def28dc317b065ed6b096023d1ea07d0f37d4304` (`Add default-blob Sync v2
rollout control`) contains:

- an RLS-enabled, default-deny rollout-rule table seeded to one catch-all
  `blob` rule;
- a security-definer assignment RPC that requires authentication, evaluates
  ordered tester/staff/percentage/all rules, and always fails closed to
  `blob` before any entity authority has been recorded;
- owner/admin-only audited rule administration and an exact default reset;
- a pure, inert client resolver and device-local pause control that are not
  connected to the production runtime;
- exhaustive unit, SQL, source-contract, CI, and before-push gates; and
- an exact rollback script that restores the one-row default-blob posture.

There is no entity-capable rule value, no entity schema, no mutation receipt,
no queue, and no `services/sync` runtime path in this commit.

## Local verification

| Check | Result |
|---|---|
| Resolver unit tests | 32 passed |
| Full unit suite | 24 files, 374 tests passed |
| Lint | Passed with 0 errors (55 existing warnings) |
| Rollout source-contract gate | Passed |
| Full `npm test` in disposable copy | Passed |
| Full `npm run test:release` in disposable commit archive | Passed; 446 Playwright tests passed |
| `npm run test:before-push` in disposable commit archive | Passed; 38/38 scoped Playwright tests passed |
| Current 10k-event second boot | Chromium 836.2 ms; WebKit 774.0 ms; both under 1,000 ms |
| Cloudflare production build | `VITE_SOURCE_SHA=def28dc317b065ed6b096023d1ea07d0f37d4304 npm run build:cloudflare` passed; 1,342 modules |
| Capacitor wrapper sync | `npx cap sync` passed for Android and iOS; sync 0.071 s |
| Migration on disposable PostgreSQL 16.14 database | Applied successfully |
| SQL rollout verifier | 21/21 checks passed inside a rolled-back transaction |
| Rollback exact-default assertion | Passed |
| Reapply after rollback | Passed |

The protected shared-checkout `public/` files were fingerprinted before and
after generated-output checks; all 28 fingerprints remained identical. All
commands that regenerate assets ran from commit-only disposable copies. The
successful Capacitor sync verifies wrapper generation only; it is not the
outstanding native install-over-upgrade proof.

## Hosted migration

The migration was applied through the signed-in Supabase SQL editor only after
confirming the dashboard showed project `ifcgomivmzwqqxhltfjj`, branch `main`,
and environment label `Production`.

- Source: `supabase/migrations/202608010001_sync_v2_rollout_control.sql`
- Source size: 500 lines, 15,260 bytes
- SHA-256:
  `df8d51815b446b3a0dad3043fef9b8bc63e3265cb9340a1d85dd476b730f42de`
- Precondition: `to_regclass('public.sync_v2_rollout_rules')` returned `NULL`
- Apply result: `Success. No rows returned`
- Apply time: `2026-08-01T20:42:01Z` (`21:42:01 BST`)

The dashboard execution did not add version `202608010001` to
`supabase_migrations.schema_migrations`. The hosted schema and RPCs are present
and verified, but the migration ledger must be reconciled with an authenticated
Supabase CLI workflow before a future `db push` is trusted. Do not edit the
Supabase internal ledger by hand or infer statement metadata. This operational
follow-up does not permit Phase 6 Commit 1 to begin.

## Hosted assignment and security probes

`scripts/verify-sync-v2-rollout-hosted.sql` was verified byte-for-byte before
execution (355 lines, 11,114 bytes, SHA-256
`e87b99a8cfe5ad895691d9ea0b145dfbbc566f9f24111b42e7566098222f3607`).
It used existing accounts without emitting identifiers, email addresses, or
tester-group values; it did not edit profiles. Temporary blob-only rules were
created through the audited admin RPC and reset exactly before commit.

All 11 corrected hosted checks passed on the shared production database at
`2026-08-01T21:08:40Z`:

| Probe | Observed result |
|---|---|
| Listed tester | `blob`, matched temporary listed-tester rule |
| Unlisted tester | `blob`, matched catch-all |
| Admin account | `blob`, matched temporary staff rule |
| Staff audience | `blob`, matched temporary staff rule through the owner/admin membership |
| Ordinary account | `blob`, matched catch-all |
| Unauthenticated assignment | Denied |
| Non-admin configuration write | Denied |
| Authenticated direct table read | Denied |
| Anonymous assignment execution | Denied |
| RLS/policy posture | RLS on; zero client policies |
| Final reset | One catch-all rule; zero non-blob rules |

The hosted project has one owner/admin operator and no distinct non-admin staff
account, so the staff audience and admin rows are not independent hosted
people. The 21-check disposable-database verifier separately exercises distinct
synthetic support and admin accounts. This limitation is recorded rather than
labelling one hosted person twice. The corrected hosted reset also compares
every default-row field (with generation permitted to advance):
`rules=1, exact=1, non_blob=0`.

This proves tester identity is only a targeting input, not an on/off switch;
the control defaults to blob and exposes no client-writable configuration
surface.

## Tester-cohort evidence

`scripts/inspect-sync-v2-tester-cohort.sql` was verified byte-for-byte before
execution (58 lines, 2,143 bytes, SHA-256
`b49497896d138f61d14d811d71320e124067dccc983b3aedcf3c63784b91b6fe`).
It returned opaque per-result group labels and aggregate counts only; no group
value or reversible group hash was emitted. General automation status, consent,
contactability, and real-participant status remain human attestations. The
corrected query completed at `2026-08-01T21:09:20Z`.

| Group label | Tester rows | Active in 30 days | Operator-account excluded | E2E-marked excluded | Structurally eligible before human attestation |
|---|---:|---:|---:|---:|---:|
| `group_01` (non-null group) | 2 | 0 | 0 | 0 | 0 |
| `unassigned` | 3 | 1 | 1 | 0 | 0 |

Aggregate conclusion:

- five tester accounts exist;
- two belong to a non-null tester group, but neither was active in the prior
  30 days;
- three lack the required non-null group; the only active tester is among
  those unassigned accounts and is also the owner/admin operator;
- zero accounts are structurally eligible before human attestation;
- zero selected participants have dated Sync v2 consent and contactability
  evidence; and
- no separate two-device test account is recorded.

The hard gate requires at least two real, active, contactable,
non-admin/non-staff/non-E2E participants in a selected non-null tester group,
plus a separate two-device account. The objectively evidenced count is **0 of
2**, so the cohort gate fails.

## Phase 5 evidence reconciliation

| Requirement | Evidence | Status |
|---|---|---|
| Implementation and dual-write retirement | Commits through `64fa40a` | Met |
| Chromium migration + WebKit persistence CI | Staging Checks runs [30564529648](https://github.com/drlizlondon/mybishbash/actions/runs/30564529648) at `c839c72` and [30596412262](https://github.com/drlizlondon/mybishbash/actions/runs/30596412262) at `64fa40a` | Met |
| 10k-event second boot | Chromium 832.2 ms; WebKit 781.0 ms at `086af6b` | Met |
| Commit 6 release entry | Release `086af6b`, 2026-07-30 22:58:59Z–23:37:26Z; 0 client errors and 0 tester reports | Met |
| Stale-localStorage recovery guardrail | Unit/source guards plus `storage-migration.spec.ts` prove stale legacy state cannot replace newer IDB and only a genuine legacy mutation can reconcile | Met |
| Manual staging kill-switch exercise | No dated browser record | **Outstanding** |
| Native iOS/WKWebView seeded-data upgrade | No install-over-upgrade record; the current live-URL wrapper does not prove a bundled web-asset upgrade | **Outstanding** |

The two CI runs prove their named browser checks, not human staging or native
upgrade exercises. Zero tester reports proves absence of reports during the
recorded release window, not active tester participation.

## Evidence still required before Phase 6 Commit 1

1. Select one non-null tester group containing at least two real, active,
   non-admin/non-staff/non-E2E/non-automated participants.
2. Record dated explicit Sync v2 consent and current contactability for both.
3. Record a separate two-device account; do not count it as a real participant.
4. If fewer than two qualifying participants exist, obtain a dated, scoped
   product-owner exception recording the smaller aggregate count and rationale.
5. Complete and record the manual staging kill-switch exercise described in
   the Phase 5 packet.
6. Complete and record the native iOS/WKWebView seeded-data upgrade exercise.
7. Reconcile the hosted migration ledger through the authenticated Supabase
   CLI workflow and verify the linked migration list before a later `db push`.

Until every hard gate has objective evidence, the safe next action is evidence
collection only. Phase 6 Commit 1 remains prohibited.
