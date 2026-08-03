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
successful Capacitor sync verifies optional live-URL wrapper generation only.
It is not evidence of distribution and does not replace the installed Home
Screen PWA update-and-persistence proof.

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

The dashboard execution did not initially add version `202608010001` to
`supabase_migrations.schema_migrations`. That exact row was safely reconciled
through the authenticated Supabase CLI on 2026-08-02; see the dated
reconciliation addendum below. The CLI did not execute the migration SQL.
Two older dashboard-applied July migrations remain absent from remote history,
so a future real `db push` remains prohibited until that separate historical
scope is reviewed. This operational follow-up does not permit Phase 6 Commit 1
to begin.

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
| Non-tester/non-operator account | `blob`, matched catch-all |
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
every canonical configuration field (generated ID/timestamps excluded, with
generation permitted to advance):
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
- three lack the required non-null group; that aggregate contains one active
  row and one owner/admin operator row, but does not establish whether those
  facts belong to the same account;
- zero accounts are structurally eligible before human attestation;
- zero selected participants have dated Sync v2 consent and contactability
  evidence; and
- no separate two-device test account is recorded.

The hard gate requires at least two real, active, contactable,
non-admin/non-staff/non-E2E participants in a selected non-null tester group,
plus a separate two-device account. The objectively evidenced count is **0 of
2**, so the cohort gate fails.

The repository-only candidate-by-candidate decision, evidence limitations,
smallest founder action list, and unapproved owner-exception fallback are in
`docs/release-evidence/phase-06/tester-cohort-decision-2026-08-02.md`.

## Phase 5 evidence reconciliation

| Requirement | Evidence | Status |
|---|---|---|
| Implementation and dual-write retirement | Commits through `64fa40a` | Met |
| Chromium migration + WebKit persistence CI | Staging Checks runs [30564529648](https://github.com/drlizlondon/mybishbash/actions/runs/30564529648) at `c839c72` and [30596412262](https://github.com/drlizlondon/mybishbash/actions/runs/30596412262) at `64fa40a` | Met |
| 10k-event second boot | Chromium 832.2 ms; WebKit 781.0 ms at `086af6b` | Met |
| Commit 6 release entry | Release `086af6b`, 2026-07-30 22:58:59Z–23:37:26Z; 0 client errors and 0 tester reports | Met |
| Stale-localStorage recovery guardrails | Unit/source guards plus `storage-migration.spec.ts` cover write/flush failure, normal-IDB stale snapshots, deliberate legacy edits, and the full-render kill-switch pre-edit boundary in Chromium and WebKit | **Met — whole-app gap closed 2026-08-03** |
| Manual staging kill-switch exercise | Resumable human procedure prepared in `docs/release-evidence/phase-05/manual-verification-packet-2026-08-02.md`; the render-time replay-authority blocker was corrected with focused engine and browser regression proof on 2026-08-03; no dated human staging result | **Outstanding — founder-operated** |
| Installed iOS Home Screen PWA update and persistence | Representative same-origin staging deploy/service-worker procedure supersedes the synthetic packaged-native gate; no dated real-iPhone result | **Outstanding — founder-operated** |

The two CI runs prove their named browser checks, not human staging or installed
PWA update exercises. Zero tester reports proves absence of reports during the
recorded release window, not active tester participation.

## 2026-08-02 authenticated migration-ledger reconciliation

### Supported workflow and safety decision

Supabase's documented [database-migration
workflow](https://supabase.com/docs/guides/deployment/database-migrations) and
[CLI reference](https://supabase.com/docs/reference/cli/supabase-migration-repair)
state that dashboard SQL changes bypass migration history and that
`migration repair --status applied` updates only
`supabase_migrations.schema_migrations`; it does not apply or revert SQL.
Installed CLI `2.98.2` exposes the same `migration repair [version] ...
--status applied|reverted --linked` contract. Its matching source records the
local migration version, name, and parsed statements as ledger metadata without
calling the migration execution path. The installed-version implementation was
checked against Supabase CLI
[`repair.go`](https://raw.githubusercontent.com/supabase/cli/v2.98.2/internal/migration/repair/repair.go)
and
[`history.go`](https://raw.githubusercontent.com/supabase/cli/v2.98.2/pkg/migration/history.go).

The CLI had no active token, so the observed `supabase login --no-browser`
browser-assisted flow was completed; the command and credential-storage
contract are in the official [CLI login
reference](https://supabase.com/docs/reference/cli/getting-started). No
credential, verification code, or token is committed. All Supabase commands
ran from a disposable archive at `ec4f715`; the shared checkout's tracked
`.temp` state was not used.

The exact SELECT-only SQL inputs are preserved, with their original filenames
and SHA-256 values, in
`docs/release-evidence/phase-06/ledger-reconciliation-readonly-probes-2026-08-02.sql`.
At `2026-08-02T22:23:27Z`, the repeatable post-reconciliation command record
from `/private/tmp/mybishbash-ledger.u1l3vp` was:

```text
/opt/homebrew/bin/supabase db query --linked --file rollout-schema-posture.sql
/opt/homebrew/bin/supabase db query --linked --file assignment-grouped.sql
/opt/homebrew/bin/supabase db query --linked --file assignment-unassigned.sql
/opt/homebrew/bin/supabase db query --linked --file assignment-ordinary.sql
/opt/homebrew/bin/supabase db query --linked --file assignment-operator.sql
/opt/homebrew/bin/supabase db query --linked --file ledger-target-postcheck.sql
/opt/homebrew/bin/supabase migration list --linked
/opt/homebrew/bin/supabase db push --linked --dry-run
/opt/homebrew/bin/supabase db push --linked --dry-run --include-all
```

All six `db query` commands and `migration list` exited 0. The ordinary dry-run
exited 1 only because the two older July files precede the newest remote
version; the include-all dry-run exited 0. Both explicitly stated that no
migration would be pushed, and neither listed `202608010001`.

Before the mutation:

- `supabase projects list --output json` marked only project
  `ifcgomivmzwqqxhltfjj` as linked and `ACTIVE_HEALTHY`;
- `supabase migration list --linked` showed local `202608010001` with an empty
  remote column, and a direct SELECT returned `target_ledger_rows=0`;
- the local migration was 500 lines / 15,260 bytes with SHA-256
  `df8d51815b446b3a0dad3043fef9b8bc63e3265cb9340a1d85dd476b730f42de`,
  matching the dashboard-applied source recorded above;
- the read-only rollout-control schema/access fingerprint was
  `70933e4b483e306e93f79eda306194d6`;
- rollout posture was `total_rules=1`, `exact_default_rules=1`,
  `non_blob=0`, `generation=8`, all enabled;
- RLS was enabled and policy count was 0; anonymous and authenticated direct
  table reads were unavailable; anonymous assignment/admin execution was
  unavailable; and authenticated had `EXECUTE` on the assignment and admin
  RPCs as designed. The fingerprint covers the unchanged RPC definitions,
  including the owner/admin guards inside the security-definer admin bodies;
- existing grouped tester, unassigned tester, non-tester/non-operator, and
  operator probes all returned `blob / blob / catch-all-blob`.

The only hosted-database-mutating command was:

```text
/opt/homebrew/bin/supabase migration repair 202608010001 --status applied --linked
```

Result: `Repaired migration history: [202608010001] => applied`. No migration
SQL was rerun and no rollout/profile row was changed.

After the mutation:

- `supabase migration list --linked` showed
  `202608010001 | 202608010001`;
- a privacy-safe ledger query returned version `202608010001`, name
  `sync_v2_rollout_control`, and 18 stored statements without printing their
  bodies;
- the rollout-control schema/access fingerprint remained exactly
  `70933e4b483e306e93f79eda306194d6`;
- default posture remained `1 / 1 / non_blob=0 / generation=8`, with identical
  RLS, policies, table grants, and RPC grants; and
- all four assignment categories again returned
  `blob / blob / catch-all-blob`.

The documented [`db push --dry-run`
inspection](https://supabase.com/docs/reference/cli/supabase-db-push) produced
the following summarised results (not verbatim CLI formatting):

```text
/opt/homebrew/bin/supabase db push --linked --dry-run
  exit 1: older local migrations exist before the newest remote version;
  listed 202607100001 and 202607120001 only.

/opt/homebrew/bin/supabase db push --linked --dry-run --include-all
  exit 0: would push 202607100001 and 202607120001 only.
```

Neither dry-run listed `202608010001`; it will not be reapplied. The two July
migrations are documented as already applied through the dashboard in the
2026-07-12 roadmap evidence (migration commits `d6bdb22` and `ce78e63`), but
their ledger rows are outside this authorised reconciliation. They were not
repaired or rerun. Therefore the **target migration is safely reconciled**,
while the **global ledger remains operationally inconsistent** and no real
`db push` may run until a separate, evidence-backed review authorises exact
treatment of those two versions. Reconciliation completed by
`2026-08-02T21:51:11Z`; the repeatable postchecks above completed by
`2026-08-02T22:23:27Z`.

## Exact evidence still required before Phase 6 Commit 1

The execution packet and independent default-blob rollout control are met,
including the target migration-ledger record above. The remaining hard entry
gates are:

1. A founder/human must complete and date the Phase 5 kill-switch staging
   procedure in
   `docs/release-evidence/phase-05/manual-verification-packet-2026-08-02.md`.
   The pre-edit replay path has a runtime correction and automated regression
   proof as of 2026-08-03; the human staging result is still absent.
2. A founder/human must complete and date that packet's real installed iOS
   Home Screen PWA update-and-persistence procedure against the normal staging
   deployment and service-worker flow.
3. The founder must evidence two active real, contactable,
   non-staff/non-admin/non-owner/non-E2E/non-automated participants in one
   selected non-null group, each with dated Sync v2 consent.
4. The founder must evidence a separate designated account with two-device
   availability; it does not count toward the two participants.

Current qualifying tester count remains **0 of 2**. No product-owner exception
exists. Separately, the two July ledger gaps must be resolved before any later
real database push, but they do not turn this documentation work into Phase 6
Commit 1.

Until every hard gate has objective evidence, the safe next work is the
separately reviewed Phase 5 correction and founder-operated evidence
collection. Phase 6 Commit 1 remains prohibited.
