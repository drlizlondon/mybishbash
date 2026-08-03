# Phase 6 — Sync v2: entities + mutation queue

**Blueprint:** `docs/architecture-blueprint.md` §10–12, §16, §19 Phase 6
**Status tracker:** `docs/architecture/roadmap-status.md`
**Depends on:** Phase 5 complete; independently switchable Sync v2 audience
rules deployed with catch-all `blob` authority; a live, contactable tester
cohort recorded.
**Status at packet creation:** **Blocked at preflight.** Phase 5 implementation
is complete at `64fa40a`, and TestPilot targeting/reporting infrastructure
exists, but the repository did not prove a live hosted tester cohort and
contained no Sync v2 rollout flag. No runtime Phase 6 work may begin by
treating `is_tester` itself as the missing flag.

**Hosted database boundary:** staging and production share Supabase project
`ifcgomivmzwqqxhltfjj`. Every hosted migration, rule change, and probe in this
packet is production-database work even when the application branch is
`staging`; staging-only wording below is superseded by this boundary.

---

## Objective

Replace whole-profile blob replication with an offline-first entity sync
engine while retaining a reversible, observable path through the existing
`mybishbash_state` blob for the full rollout:

1. Add a generic, owner-scoped entity spine in Supabase and IndexedDB.
2. Persist local entity changes and an idempotent mutation queue before network
   delivery; replay them after offline sessions and process restarts.
3. Push and pull bounded per-entity changes using a deterministic server order,
   not client wall clocks.
4. Explode each user's version-1 shared blob into entities idempotently, then
   dual-write blob + entities while a durable blob outbox keeps rollback
   current and the rollback window remains open.
5. Prove shadow equality before changing reads; then roll entity reads through
   testers → staff/admins → deterministic percentages → everyone.
6. Retire blob writes only after one non-vacuous clean release at 100% entity
   reads. Keep the blob read-only for at least one further release; do not drop
   it in this phase.
7. Preserve the current local IndexedDB engine, TestPilot reporting, account
   clearing/deletion, notification delivery, HQ pack-adoption reporting, and
   launcher behavior throughout the migration.

**Exit:** the entity table and local mutation queue are live for all cohorts;
two-device convergence and offline replay e2e are green; a representative edit
payload is <2KB; blob writes are mechanically absent; the retained blob is
read-only migration/diagnostic evidence; the final release window contains exercised Sync
v2 traffic with no lost-write report, unresolved shadow mismatch, or stuck
queue.

## Deliberately not attempted

- No realtime channel (Phase 10); pull remains the remote-change mechanism.
- No collaboration, spaces, shared ownership, documents, plugins, or AI reads.
- No per-field merge or CRDT. The conflict rule is per entity.
- No TypeScript conversion or runtime schema library (Phase 7). Phase 6 uses
  explicit hand-written validators at the transport boundary.
- No event-history pagination or tombstone garbage collection (Phase 9).
- No blob table drop. Write retirement and table deletion are different gates.
- No migration of device-local state merely because an entity table exists.
- No reuse of launcher-specific `rollout_percent`, marketing `cohort`, or the
  Phase 5 storage-engine kill switch as the Sync v2 feature flag.

## Hard entry gate

All four items are required before Phase 6 Commit 1:

1. **Phase 5 complete — not met.** `64fa40a` retired local-storage dual-write
   and left `staging` at the IndexedDB authority boundary. CI browser checks,
   the performance gate, and the Commit 6 release window are recorded, but the
   manual staging kill-switch and installed iOS Home Screen PWA
   update-and-persistence exercises remain outstanding. Precise resumable human
   procedures were prepared on 2026-08-02 and architecture-corrected on
   2026-08-03 in
   `docs/release-evidence/phase-05/manual-verification-packet-2026-08-02.md`;
   preparing them does not satisfy either check. The kill-switch first-render
   replay-authority defect found on 2026-08-02 was corrected with focused
   engine and browser regression proof on 2026-08-03: automatic defaults/theme
   housekeeping and byte-identical card normalization no longer advance the
   legacy retry generation, while a deliberate legacy edit still does. The two
   required founder-operated manual results remain absent.
2. **Execution packet exists — met.** This document landed at
   `47ef32c8950d8c3f3495a6dd7775ca1becdd66e7`.
3. **Independent rollout control deployed — met.** Preflight Commit 0 landed at
   `def28dc317b065ed6b096023d1ea07d0f37d4304`; its migration is present in the
   shared hosted database, and 11/11 authenticated/security probes prove every
   tested audience resolves to `blob`, the table is default-deny, and the exact
   catch-all default is restored. On 2026-08-02 the authenticated Supabase CLI
   safely recorded `202608010001` as applied without rerunning SQL; the
   pre/post rollout-control schema/access fingerprint and blob-only assignment
   probes were identical. Two older dashboard-applied July migrations remain
   absent from remote history,
   so no future real `db push` is permitted until that separate ledger scope is
   reviewed.
4. **Tester cohort operationally available — not met.** The privacy-minimised hosted
   inspection found five tester accounts: two are in a non-null group but were
   inactive for the prior 30 days; three are unassigned. Within that unassigned
   aggregate, one row was active and one row was an owner/admin operator, but
   the privacy-minimised result does not prove whether they are the same row.
   Zero accounts are structurally eligible before
   consent/automation/contactability attestation, and no separate two-device
   account is recorded. The objective evidence is 0 of the required 2
   qualifying participants. The repository-only
   candidate-by-candidate decision is
   `docs/release-evidence/phase-06/tester-cohort-decision-2026-08-02.md`.

Full evidence is recorded in
`docs/release-evidence/phase-06/preflight-2026-08-01.md`. The tracker moves from
`Blocked` to `Ready` only after every hard gate is objectively recorded.
Before an account has ever recorded entity-read authority, unavailable rollout
control or assignment failure uses the existing blob path. After cutover, R1's
durable authority rule applies: failure never silently downgrades to stale blob.

## Current-state audit (at `64fa40a`)

### Local persistence

- `src/services/db/index.js` is IndexedDB schema v1 with `kv` + `meta` only.
  There is no local entity store, mutation store, sync cursor, or durable device
  identifier.
- `storage.js` is the mechanically enforced local persistence funnel. Its
  synchronous mirror API is load-bearing for first render and must remain so.
- Store actions are synchronous. Cards persist through a 120ms timer; tests pin
  `handleSaveCard` as synchronous. Phase 6 may change internal durability work,
  but public actions do not become promise-returning.
- Phase 5's local-storage recovery marker is unrelated to cloud replication and
  must not be reused for Sync v2.

### Cloud blob bridge

- `src/lib/mybishbashSync.js` reads/writes `mybishbash_state`, with a legacy
  `bishbash_state` table-name fallback. It is canonical-first fallback, not
  table dual-write.
- Saves upsert one `{ user_id, state_json, updated_at }` row; App compares the
  client-generated `state_json.updatedAt`, not the row timestamp.
- `src/App.jsx` still owns blob construction, normalization, per-id partial LWW,
  initial load, 500ms whole-blob save, and 5s polling. A failed save is logged
  but not durably queued, and an unchanged state may never retry.
- `sessionStore.syncStatus/syncError` describe auth/cloud connection readiness
  and gate launch/UI behavior. They are not mutation-queue status.

The version-1 blob contains exactly:

`cards`, `setupComplete`, `mood`, `profile`, `homeScreenVersions`,
`launcherBehaviorSettings`, `cardPacks`, `hiddenLibraryPacks`,
`dislikedPackCardIds`, `globalInterruptionMode`, `events`, `actionCards`, plus
envelope fields `version` and `updatedAt`.

### Existing event path (do not create a third one)

- `eventLog.js` already stores a local log and offline queue, then idempotently
  upserts individual events into `mybishbash_events` (legacy table fallback).
- `mybishbash_events` is already indexed, RLS-protected for own-user reads and
  inserts, and consumed by HQ analytics. The same recent events are redundantly
  embedded in the shared blob.
- There is no focused queue/failure/replay unit matrix today. Existing
  `offline-fallback.spec.ts` tests launcher UI, not sync replay.

### Server consumers and security debt

- `send-mybishbash-notifications` reads cards from blob JSON.
- `hq_pack_adoption_summary()` and a release guardrail parse
  `mybishbash_state.state_json->cards`.
- `user_summary`, staging two-device diagnostics, and cloud-save waits know the
  blob shape or endpoint.
- `delete-account` explicitly deletes canonical and legacy blob/event rows.
- The original blob migrations retain anonymous `select/insert/update` policies
  and grants while later migrations add authenticated owner policies. The
  deployed grants are not contract-tested. The new entity spine must be
  default-deny, and Phase 6 must close the legacy anonymous blob path only after
  verifying no supported sync-code client still uses it.

### Missing acceptance coverage

There is no `services/sync`, fake transport conflict matrix, entity/schema
contract test, RLS audit, interleaved offline two-device convergence test,
crash-mid-queue replay test, clock-skew test, or <2KB edit-envelope assertion.
The existing staging two-context test proves only one-way blob polling.

## Rulings (resolved — do not relitigate during implementation)

### R1 — Sync v2 has independent, server-evaluated audience rules

Create server-owned ordered `sync_v2_rollout_rules` and a
`get_sync_v2_assignment(sync_protocol_version, entity_schema_version)` RPC.
Rules target an explicit TestPilot group (`user_profiles.is_tester` +
`tester_group`), staff/admin membership (`admin_users`), a deterministic
user-id percentage bucket, or the final catch-all. Each matching audience has
its own mode, so an established tester group may read entities while the next
staff/percentage audience shadows. The RPC returns only the assignment
contract: read authority, mode, audience label, config generation, owner
override/rollback generation, and supported protocol/schema versions.

Modes are `blob`, `shadow`, `entities`, and `paused`:

- `blob`: current blob read authority; entity code inert except an explicitly
  requested rollback reconciliation.
- `shadow`: blob remains read authority; entity bootstrap, mutation push/pull,
  and normalized shadow comparison run; durable blob writes continue.
- `entities`: entities are read authority; durable blob writes continue only
  while the rollback window is open.
- `paused`: keep the account's current read authority and active local projector;
  continue journalling/queuing local edits and stop ordinary entity/event pull/
  push. Assignment refresh, rollback status, bounded catch-up pull through the
  frozen required version, and the accepted-state blob outbox remain allowed
  only when an owner rollback is actively `preparing`; otherwise paused means no
  replication traffic. Never hydrate a stale blob merely because sync failed.

`get_sync_v2_assignment` evaluates a server-owned account override before the
ordered audience rules. An override may be `paused`, or `blob` only after that
owner's two-phase rollback watermark is current. For an audience incident, set
the audience rule to `paused`; then prepare and release each affected owner to a
`blob` override independently. One offline owner therefore remains safely
paused without blocking ready owners or causing the whole audience to flip to
an unready blob. After all owners are safe, the audience rule may return to
`blob` and the temporary overrides may be cleared.

Seed one catch-all `blob` rule and no entity-enabled audience. Only an
admin/security-definer path may change rules. For an account that has never
entered entity reads, RPC error, missing rules, unknown mode, or unsupported
protocol/schema safely remains `blob`. Once durable local metadata records
entity authority, an assignment failure keeps that authority offline/paused;
it **never downgrades to blob implicitly**.

An account-wide `entities → blob` rollback is a two-phase server generation,
not a per-device flag. Before assignment returns blob authority, the current
materialized state must be durably projected through the blob outbox and the
server must record that the blob is current through the required entity
version. If that acknowledgement cannot complete, clients remain on their
current local/entity state. Every push carries the assignment generation, and
the server fences entity acceptance as soon as rollback preparation freezes its
required version; a stale offline writer must re-resolve assignment instead of
writing past that fence. Commit 9 closes this rollback window: after blob writes
retire, the only emergency mode is `paused`; restoring blob authority requires
a fix-forward that re-enables/resynchronizes blob writes first.

An offline/paused device's mutations are never discarded when it later sees an
owner `blob` override. This includes every edit created under prior entity read
authority before that device durably observes blob authority, whether the edit
was made before or after the server fence. While rollback is open, the device
retains the optimistic overlay and sends the immutable semantic mutations to a
compatibility reconciliation RPC with the current override attempt generation.
Under the owner lock, that RPC applies each mutation to retained entities **and**
projects it onto the current blob atomically, advances the transactional
version/watermark, and writes the normal idempotency receipt. It never uploads
the device's stale whole blob. The overlay clears only after acknowledgement.
This path exists solely for draining old-authority work during rollback and is
removed with blob writes in Commit 9.

A device-local diagnostic key may request `paused` only. It cannot select blob
or enable Sync v2. An E2E key may select the injected scripted transport only
when both the existing E2E auth mode and a test-build transport capability are
present; it never overrides a real server assignment or talks to hosted
Supabase. Marketing `cohort` remains non-behavioral, and launcher rollout
fields remain launcher-only.

### R2 — Domain IDs stay strings; server order defeats clock skew

Existing domain IDs include UUIDs, fixed strings, and fallback-generated
strings. Do not rewrite them or pretend they are all UUIDs.

The server entity row therefore has:

- an internal UUID primary key;
- `owner_id uuid` with `on delete cascade`;
- `entity_type text` + `entity_key text`, unique per owner;
- `schema_version integer` + validated JSON payload for live rows; payload is
  null exactly when the row is a hard tombstone;
- an optional stable `sort_order` for blob arrays whose order is observable;
- `deleted_at` for a **hard entity tombstone**;
- server-owned `updated_at` for diagnostics;
- a monotonically increasing server `version bigint` used for conflict order
  and pull cursors.

Clients never author server `version` or server `updated_at`. Entity mutations
and legacy blob changes call one per-owner transactional version allocator: it
locks the owner's `mybishbash_sync_accounts` row, increments `current_version`,
and commits the entity/blob change with that value in the same transaction.
This is not a free-running Postgres sequence; sequence allocation alone is not
commit order and could let a cursor skip a blocked lower-version transaction.
A cursor is a server-certified `pageThroughVersion` from a completely applied
pull page, not a client timestamp, push acknowledgement, or bare
`updated_at > cursor`. Pull also returns a snapshot high-watermark and `hasMore`;
on the final page the server may certify scanned blob-only version gaps even
though no entity row represents them. The owner-row lock makes accepted version
order equal commit order and prevents timestamp ties, clock skew, transaction
interleaving, or compatibility-only gaps from skipping entity rows. Tests must
hold one transaction open while another attempts acceptance and prove pull sees
both in order, and must cover blob-only gaps plus page boundaries.

Every queued change has a UUID `mutation_id`. A server receipt table/RPC makes
retries idempotent even if the response is lost. Queue order is preserved per
`(entity_type, entity_key)`; different entities need no client-side total order,
although the owner-version lock serializes server acceptance. The server's
later accepted mutation wins. Delete-vs-edit therefore has one
deterministic rule: later server acceptance wins, and a later edit may resurrect
a hard tombstone. Tests must cover both arrival orders, clock skew, and retrying
an older already-acknowledged mutation after a newer one. The last case is an
ack-only duplicate: it removes that pending mutation but never reapplies the
older accepted entity over a newer local/server version.

Domain-level soft deletion (for example a restorable card's payload
`deletedAt`) is **not** a server tombstone. The row stays live so restore still
works. Server `deleted_at` means the entity was removed from its collection.
No tombstone GC occurs in Phase 6.

### R3 — The entity catalogue is fixed and round-trippable

Only fields already in the shared blob migrate. Exact catalogue:

| Blob field | Entity type/key | Payload rule |
|---|---|---|
| `cards[]` | `card` / existing card `id` | Full card object + envelope order; domain `deletedAt` remains payload data |
| `cardPacks[]` | `card_pack` / existing pack `id` | Full pack object + envelope order |
| `actionCards[]` | `action_card` / existing card `id` | Full action-card object + envelope order |
| `profile` | `profile` / `core` | Full profile object |
| `setupComplete` | `setup_state` / `core` | Boolean singleton |
| `mood` | `mood` / `core` | Theme singleton |
| `globalInterruptionMode` | `global_interruption_mode` / `core` | Boolean singleton |
| `homeScreenVersions{}` | `home_screen_version` / launcher id | One value per launcher key |
| `launcherBehaviorSettings{}` | `launcher_behavior` / launcher id | One value per launcher key |
| `hiddenLibraryPacks[]` | `hidden_library_pack` / pack id | Presence entity + envelope order; decoder restores the string array |
| `dislikedPackCardIds[]` | `disliked_pack_card` / existing string key | Presence entity + envelope order; decoder restores the string array |

`version` and blob `updatedAt` become migration provenance, not entities.
`events` use R5. Empty collections, missing optional fields, ordering, soft
deletes, and legacy defaults must round-trip through
`blob → entities → blob-compatible state` without semantic drift. Comparisons
normalize ordering only where the application already treats a collection as
a set.

Notification preferences, timing-window preferences, app pauses, the existing
anonymous/event user ID, launch-session keys, selected-home-screen state,
cached launcher data, Supabase session storage, and TestPilot/E2E flags remain
on their current paths. The event log/outbound queue follows R5's explicit
atomic migration. Global packs/configuration remain server-managed, not
personal entities.

### R4 — IndexedDB v2 is additive and actions remain synchronous

Bump the existing `mybishbash` IndexedDB schema from v1 to v2. Keep `kv` and
`meta`; add generic `entities` and `mutations` stores. A generic local store
matches the generic server spine and avoids a database version bump for every
future entity type. Add a separate, bounded recovery journal under a new
Sync-v2-only key. It is not a shared-state mirror, never becomes cloud
authority, and must not reuse Phase 5's retired legacy snapshot/replay marker.

- Local entity key: `[ownerId, entityType, entityKey]`. Never let one signed-in
  account reuse another account's entity rows on a shared device.
- Mutation key: `mutationId`, with owner id plus indexes for queue order and
  entity identity. The same store carries entity changes, `event_append`
  records, and, during rollback-open stages, one coalesced `blob_snapshot`
  outbox item per owner/generation.
- `meta`: durable device id plus owner-scoped server cursor, bootstrap
  intent/provenance/replay cursor, rollout generation, owner quarantine state,
  and supported entity schema. Pull cursor + pinned high-watermark are per local
  owner/device, never stored as one server-side account cursor.

The existing KV mirror remains the materialized local read model that hydrates
stores synchronously and lets the app boot offline before an assignment/network
response. Phase 6 does not make components fetch entities. Local actions update
the materialized KV plus entity/queue state; accepted pulls decode entities back
into that materialized view through the origin-aware no-echo path.

Freeze each local mutation record as a validated discriminated union:

```text
semantic base (immutable):
  mutationId uuid
  ownerId uuid
  syncClientId uuid
  localSequence decimal-string
  syncProtocolVersion integer
  kind entity_upsert|entity_delete|event_append|blob_snapshot
  createdAt timestamptz

delivery attempt (mutable; excluded from semantic hash):
  assignmentGeneration decimal-string
  rollbackOrOverrideGeneration decimal-string|null
  state pending_unsent|inflight|retry_unknown|blocked_generation|blocked_conflict|quarantined_owner
  quarantinedFromState nullable-state
  attempts integer
  nextAttemptAt timestamptz|null

entity_upsert:
  entityType text
  entityKey text
  entitySchemaVersion integer
  payload validated-json (non-null; server clears deleted_at)
  sortOrder integer|null
  baseServerVersion decimal-string|null

entity_delete:
  entityType text
  entityKey text
  entitySchemaVersion integer
  payload null (server sets deleted_at)
  baseServerVersion decimal-string|null

event_append:
  clientEventId text
  eventPayload validated-json

blob_snapshot:
  snapshotSchemaVersion integer
  coversEntityVersion decimal-string
  baseBlobSyncVersion decimal-string|null
  stateJson validated-json
```

Fields belonging to another `kind` are rejected, not ignored. `syncClientId` is
a new durable random device UUID, distinct from the existing anonymous/event
user ID. `localSequence` is monotonically allocated per
`(ownerId, syncClientId)` and is the local queue/recovery order; UUID generation
is never treated as ordering. Every bigint crosses JSON as a canonical unsigned
decimal string and is range-validated.

After a push, the acknowledgement's `acceptedVersion` is atomically applied to
the local entity only if it is newer than that entity's stored server version;
receipt state is recorded and the pending record is removed atomically. It does
**not** advance the pull cursor: only atomic application of a bounded ordered
page may accept its server-certified `pageThroughVersion`. A duplicate mutation ID returns its original
result version plus `duplicate=true` only when its request hash matches; a
different body with the same ID is rejected. The client treats the duplicate as
ack-only, never reapplies an old result, and removes that exact queue record
idempotently. A record left `inflight` after response loss or reload becomes
`retry_unknown` with the same immutable ID/body and retries before any successor
for that entity or outbox. Only `pending_unsent` records may be coalesced. The
server receipt, not a client retry counter, defines prior acceptance.
An explicit assignment/rollback fence rejection moves the immutable record to
`blocked_generation`; it is not resent to ordinary push until assignment
resolution selects a permitted drain/resume path. Generation changes update only
delivery-attempt metadata; they never mutate the semantic body or request hash.
On every handler retry, the server authenticates/validates and computes the
canonical semantic hash, checks a matching receipt **before** generation
fencing, then either returns the prior result or evaluates the current attempt
generation for a new effect.

Add one transaction API capable of committing local entity records, affected
KV values, queue entries, owner-local sequence, and rollback blob outbox
watermark atomically. Before the synchronous in-memory mirror changes, allocate
the sequence and synchronously append/read-back a write-ahead record containing
the exact owner, mutation union, and previous/next affected KV values to the
dedicated recovery journal. The journal supports multiple ordered records; it
may coalesce only uncommitted changes for the same entity when doing so preserves
the earliest previous value, latest next value, and every event append. If the
journal cannot be durably read back, do not apply the optimistic update; present
a blocking durability error. Public actions still return synchronously, and an
explicit flush promise reports the result.

Immediately start the atomic IndexedDB transaction. Remove that journal record
only after the transaction commits. On IDB rejection/timeout, leave the journal
durable, report the failure, and retry; never mark a remote snapshot current.
Navigation/logout/account switching cannot proceed while a mutation is neither
committed to IDB nor verified in the journal. At next boot, replay a journal
record only when its `(syncClientId, localSequence)` is newer than the committed
local sequence and no local acknowledgement/server receipt supersedes its
mutation ID. Otherwise discard it. Replay uses the normal atomic transaction,
is idempotent, and clears each record only after commit. Thus a crash before an
IDB callback, a failed IDB write, or stale localStorage cannot overwrite newer
IndexedDB state.

Make this ordering implementable with a synchronous storage-funnel preparation
call: each shared-state store action computes `next`, asks `storage.js` to
prepare/journal it, and only then publishes `next` to Zustand/React. A successful
ticket starts the async atomic commit; a failed ticket aborts publication and
reports through sync status/errors. Components still call the same synchronous
actions. A guardrail plus mutation test must fail if a store publishes a
cloud-shared value before preparation. In catch-all `blob` mode, the preparation
adapter is absent and existing Phase 5 behavior remains byte-equivalent.

The storage layer must not import the sync engine. Register a narrow projector
adapter from the composition root; `storage.js` invokes it only for the exact
cloud-shared keys in R3. With blob-only rollout or the adapter absent, Phase 5
behavior is byte-equivalent. The adapter receives previous + next raw values so
it can produce entity diffs and hard tombstones.

Remote application uses a separate origin-aware transaction path that updates
local entities/KV without enqueuing the received change back to the server.
Every projector call carries one explicit origin:

- `user_mutation` writes entity mutations or hard tombstones;
- `remote_apply` updates entity/KV state without entity requeue;
- `bootstrap_reconcile` records only the controlled bootstrap delta;
- `local_device_reset`, `logout`, `account_switch`, `signup_preclear`, and
  `demo_reset` cover both key removal **and the defaults written immediately
  afterwards** without remote tombstones or a blob outbox write; their pending-
  work disposition follows the boundary rules below;
- `account_delete` first uses the existing privileged server deletion path,
  then performs the same local purge; it never emits a mass tombstone batch.

While rollback is open, accepted `remote_apply` materialization refreshes the
coalesced blob outbox, but it does not create a new entity mutation. A guardrail
and unit mutation must prove that removing origin suppression creates an entity
echo and fails the suite. Another test must prove that local clear/logout/reset
cannot delete cloud state, while account deletion removes every server and
local Sync v2 surface.

Logout captures and stops the outgoing owner's service before authentication is
lost, then requires remote acknowledgement of all mutations. If acknowledgement
is unavailable, the UI offers only cancel logout or an explicit confirmed
discard; it never silently cancels durable work. A user-requested local-device
reset follows the same pending-work confirmation. Account deletion is different:
after privileged server deletion succeeds, pending local work is intentionally
purged; if deletion fails, preserve session and local state exactly as today.

An involuntary auth transition from one non-null user ID to another cannot use
the old session to flush. Atomically mark its unacknowledged records
`quarantined_owner` with their prior state, then blank/purge the outgoing
materialized/entity/cursor view before rendering the new owner. Quarantined
records are invisible to every other owner and every transport drain; they are
restored only after the same owner authenticates and explicitly accepts replay
or discard. Signup pre-clear has no owner and may not attribute its default
writes to either account. No boundary may deliver an old queue under new auth.

Extend, do not bypass, `clearSharedMyBishBashState()` and its existing all-sink
clear fence: synchronous deletion visibility, its durability promise, writes-
during-clear reconciliation, cross-context acknowledgement protection, and
failure/timeout reporting remain intact. The outgoing owner ID is captured
before logout so v2 entity/mutation/meta/journal rows join that local purge only
after acknowledgement/confirmed discard; an account-switch clear explicitly
preserves its owner quarantine. The purge never changes cloud authority or
creates remote deletes. Preserve the current storage-engine kill-switch and
migration-clear tests unchanged except for explicit pending/quarantine v2
assertions.

Public store actions and card handlers stay synchronous. Do not make React
callers await persistence. When the Sync v2 projector is active, Commit 6
bypasses `cardsStore.setCards`' existing 120ms persistence debounce and updates
its timing test intentionally; catch-all `blob` mode retains the Phase 5 timer.
`setCardsAndPersistImmediately` remains immediate and still cancels any stale
timer. The projector and atomic KV/entity/queue write start in the same action
turn, while network batching remains asynchronous. Pin ordinary `setCards`,
immediate card-save, remote no-echo, reset-origin, mode transition, and
navigation/account-switch flush behavior separately. No 120ms timer may delay
Sync v2 durability.

### R5 — Reuse `mybishbash_events`; remove its blob duplication safely

`mybishbash_events` is the Phase 6 append-only event spine. Do not add another
generic events table. Preserve its internal UUID primary key and add
`client_event_id text`, unique per owner, because the current client ID fallback
is not guaranteed to be a UUID. Adapt event delivery to the generic local
mutation store as `kind=event_append`; one atomic local transaction updates the
500-event KV log, enqueues its matching event mutation, and—while rollback is
open—refreshes the blob outbox so event duplication remains current.

Backfill existing rows' `client_event_id` and every retained-blob event using
the client event ID as the idempotency key; never coerce an arbitrary client ID
into the server UUID primary key. Migrate the current standalone offline queue
into `event_append` mutations idempotently, then prove every source event is
either accepted or durably pending before retiring that queue. Keep events in
rollback blob snapshots until the rollback window closes, and keep the local
500-event log unchanged; paging is Phase 9. Account deletion continues to
remove event rows explicitly because the current FK is `on delete set null`.

For `(owner, client_event_id)`, canonically identical content is an idempotent
duplicate and returns the existing acknowledgement. Different canonical content
is a hard `client_event_id_conflict`: never overwrite either row, retain/block
the local mutation for diagnosis, and report only scrubbed IDs/counts—not event
content.

During staged rollout, an untouched `blob` account keeps the current event path
byte-equivalent. Its first shadow bootstrap atomically imports the standalone
queue and records an owner-local `eventQueueV2` marker before new appends use the
generic mutation store. That migration is one-way and authority-independent:
afterward, event append continues through the normalized event RPC even if the
owner rolls back to blob, because event-table authority never changed. Event
append validates supported protocol/schema but is not blocked by an entity
rollback-generation fence.

### R6 — Authority changes only at release gates

The migration is a state machine, not one code flip:

1. **Blob:** blob authority; entity code inert.
2. **Shadow:** post-merge current state is transactionally exploded once;
   subsequent local writes queue entities and continue blob writes. Blob reads
   remain authoritative. Entity pulls are decoded and compared, never rendered.
3. **Entity reads, rollback open:** entity state renders and the durable,
   coalesced blob outbox keeps a provenance-stamped rollback snapshot current.
   The blob is monitored, but it is not merged into live entity state. A
   markerless write from an old client requests account-wide rollback
   preparation and controlled blob reconciliation; it does not itself change
   authority. The switch completes only after server acceptance is generation-
   fenced and the reconciled blob is acknowledged current through the frozen
   required entity version.
4. **Entity reads, blob read-only:** after a clean 100% release, blob writes and
   the blob outbox stop mechanically, and blob rollback authority closes.
   Assignment failure or emergency pause stays on local/entity state. The table
   remains readable as evidence for at least one further release.
5. **Archive later:** table/archive removal is a separate post-Phase-6 decision.

Register the projector and recovery journal **before** taking a bootstrap
snapshot. Capture the owner's current `localSequence` as `cutSequence`, derive
both the normalized authoritative blob baseline and intended merged local state,
and durably store an owner-local bootstrap intent: baseline/intended hashes,
canonicalization version, ordered baseline→intended operations with stable IDs,
the cut sequence, status, and replay cursor. Snapshot absence alone is not an
explicit delete; a hard tombstone in that delta requires recorded deletion of a
baseline-known key. Replay every local mutation with a sequence greater than the
cut after finalize. This closes the snapshot-vs-live-write race and makes loser
reconciliation restart-safe.

Bootstrap is a bounded `begin / batch / finalize` RPC protocol, serialized per
owner with an account-row/advisory lock. `begin` records provenance, expected
entity counts/types, and a bootstrap generation in a durable server manifest.
The manifest fixes status, provenance, canonicalization version, per-type
counts, total items/bytes, snapshot hash, created/updated/expiry timestamps, and
eventual finalized version. Repeating `begin` resumes only an identical active
manifest; incompatible input fails.

Batches are bounded by item count and serialized bytes and append only to
generation-scoped server staging rows; they never write live entities. Repeating
a staged entity key is accepted only when its canonical bytes/hash are identical,
otherwise the generation fails. `finalize` validates manifest counts, bytes,
and hash, then computes changed rows/tombstones in deterministic
`(entity_type, entity_key)` order. Under the owner lock it reserves a contiguous
counter range and gives every changed row a distinct version, then atomically
merges with **replace semantics**, writes the finalized manifest version, and
writes the owner marker last. `unique(owner_id, version)` makes equal-version
page splits impossible. An interrupted generation is not readable authority
and can be resumed or safely abandoned/expired. Retry after response loss is
idempotent.

Two first devices cannot both finalize divergent snapshots. The winner writes
the complete generation; the loser receives the completed marker/current
version and pulls that state. It then three-way-applies its durable
baseline→intended operations onto the winner as ordinary idempotent queued
mutations, followed by mutations after `cutSequence`, advancing the stored replay
cursor after each atomic enqueue. It never two-way-diffs whole snapshots or
deletes a winner-only key; tombstones apply only to explicit baseline-known
deletions. Existing versioned rows are never overwritten by stale bootstrap
batches, and replay survives a crash without duplication.

Add a server-owned `sync_version` to `mybishbash_state`, advanced by a trigger
through the same locked per-owner transactional counter as entity versions on
every blob change. New
dual-writers include Sync v2 provenance in the blob envelope (source entity
version, protocol/schema version, device id); old clients omit or strip it. A
markerless blob write updates the owner's `last_legacy_blob_version` and starts
the two-phase rollback preparation from R1. Entity-read clients remain on their
current local/entity state until the server generation is safe to return
`blob`. Reconciliation is serialized inside that preparation and then records
`reconciled_blob_version`. Never use the blob's client-generated `updatedAt` to
decide compatibility order, and never merge a legacy whole-blob snapshot
directly into an active entity-read session.

Current App blob saves are not durable enough for rollback. Commit 6 replaces
the enabled-account save timer with a coalesced IDB `blob_snapshot` outbox
record containing owner, snapshot schema, `coversEntityVersion`,
`baseBlobSyncVersion`, mutation/local sequence, retry state, attempts, and next
attempt time; rollout/rollback generation belongs to mutable attempt metadata.
A local optimistic edit may prepare a successor but that snapshot cannot send
until its entity mutation is accepted **and** bounded pull has certified/applied
every server change through its coverage version. Pending/unaccepted **entity**
overlays are excluded from the accepted-state rollback snapshot and drain later
through R1's compatibility path if a fence intervenes. R5's append-only event
duplication remains the explicit exception and is also durably queued.

Refreshing accepted materialized state may coalesce only a `pending_unsent`
snapshot. Once a body is sent, `inflight`/`retry_unknown` keeps that exact
mutation ID, server-computed request hash, body, base blob version, and coverage
immutable; a later materialized change queues a successor. The idempotent blob-
write RPC stores its effect/version/receipt atomically and returns the original
blob `sync_version`/coverage after response loss. A duplicate acknowledgement
removes only its matching predecessor and can never advance the successor's
watermark. Delivery is ordered by attempt generation then local sequence,
survives reload, and retries unknown outcomes before successors.

Under the owner lock, the server rejects/no-ops coverage lower than
`blob_current_through_entity_version`. Equal coverage requires a matching
`baseBlobSyncVersion` CAS; the server computes the new canonical body hash.
Higher coverage advances the watermark monotonically. A CAS/coverage rejection pulls the current blob and
entity delta, rebases locally, and enqueues a new successor ID—never mutating the
sent body. Only an acknowledgement whose receipt/body covers that exact entity
version advances the watermark; rollback cannot complete while it trails
accepted entity state.
Every entity push is checked against the account's current assignment and
rollback generation in the same server transaction as acceptance. Once the
generation enters `preparing`, no old-generation entity mutation can advance
the frozen required version; rejected clients retain/reclassify the mutation as
`blocked_generation` and resolve assignment again. If the owner has safely moved
to blob, the compatibility drain above handles it; otherwise it remains queued.
This fence includes devices that were offline when rollback began.

Shadow equality is evaluated only after the local queue is drained, or after
overlaying pending local mutations on the pulled server snapshot. Expected
in-flight lag is not reported as divergence; a mismatch that remains after the
drain is.

Schema-version stamps exist in IndexedDB meta, rollout assignment, mutation
envelopes, entity rows, and bootstrap provenance. A client that cannot support
the assigned schema remains on blob and refuses entity writes. Shadow mismatch,
partial bootstrap, queue failure, or unsupported remote payload never causes an
authority flip.

### R7 — Connection lifecycle and replication status are different state

Rename existing `sessionStore.syncStatus/syncError` to
`connectionStatus/connectionError` in a behavior-preserving commit before the
sync engine lands. Preserve all launch-readiness and connection-screen behavior
exactly.

Create a separate sync status surface with:

`disabled | bootstrapping | synced | pending(n) | offline | error`.

The service owns it; Settings may display it. Launcher readiness must not start
waiting for a background mutation drain. Errors flow through the existing
scrubbed reporter with operation, mode, cohort, queue count, and schema version,
never payload contents.

### R8 — Blob consumers and RLS migrate before blob retirement

Before entity reads expand beyond testers:

- notification delivery reads entity cards with blob fallback for un-migrated
  owners;
- HQ pack-adoption and user-summary surfaces become entity-aware with the same
  fallback;
- staging diagnostics wait for sync acknowledgements rather than hard-coded
  blob HTTP verbs;
- release guardrails enumerate every remaining blob writer and consumer;
- account deletion covers entities, receipts, bootstrap manifests/staging, sync-account/
  rollback overrides, health rows, and events; local deletion covers entities,
  mutations/outbox, cursors, sequence, journal, and materialized KV;
- schema-contract tests assert tables, indexes, grants, RPC signatures, and
  default-deny RLS.

The entity migration must explicitly grant the minimum authenticated
permissions required by its RPCs. Do not rely on hosted defaults. Revoke the
legacy sync-code surface only after a read-only audit proves no supported client
uses it. That closure explicitly inventories and removes anonymous grants and
policies from `public.profiles`, canonical `public.mybishbash_state`, deployed
legacy state aliases such as `public.bishbash_state`, and any renamed profile/
state relation still present in the shared hosted production database.
Unrelated intentional anonymous
surfaces (launcher events, waitlist, access-code validation) are out of this
closure and must not be revoked accidentally. The source has no supported
sync-code consumer, but deployed state must be verified. Completing this legacy
closure is a hard gate before expansion beyond testers, not optional cleanup.

### R9 — E2E uses a shared scripted transport, not localStorage as cloud

Unit tests inject an in-memory fake transport. Playwright uses one test-process
scripted transport shared by two browser contexts; both contexts may intercept
the same transport endpoints/state while retaining independent IndexedDB,
network status, device IDs, and queues. The existing E2E auth mock stays, but
its blob scratch key is not evidence of entity convergence.

Required browser scenarios:

- two contexts start equal, edit different entities offline, reconnect in both
  orders, and converge;
- both edit one entity, including artificial client clock skew, and converge to
  server acceptance order;
- delete-vs-edit in both arrival orders;
- response lost after server acceptance, reload, replay same mutation ID, no
  duplicate or rollback;
- crash/reload with queued mutations, then drain;
- entity pull while a local mutation for that entity is pending does not erase
  optimistic local state;
- local device reset/logout/signup reset clear only the correct owner-local
  surfaces and never delete or overwrite cloud state; pending work requires
  acknowledgement or explicit discard, never silent cancellation;
- a non-null owner-to-owner auth transition never renders or delivers the old
  owner's state under the new session, and quarantined work restores only for
  the original reauthenticated owner;
- failed account deletion preserves session/local state; successful account
  deletion clears every local/server Sync v2 surface;
- pre-retirement, an account-wide two-phase rollback reaches a provably current
  blob without losing dual-written edits; post-retirement, emergency `paused`
  never reads the stale blob;
- a device that reconnects with old-authority mutations after its owner reached
  blob authority drains them through compatibility reconciliation without a
  stale whole-blob overwrite.

Put the Sync v2 scenarios in a named `tests/e2e/sync-v2.spec.ts` (or its final
equivalent) and add that exact path to `webkitSmokeTestMatch` in
`playwright.config.ts`; the current fixed six-file WebKit list will not discover
it automatically. CI must list/assert that the spec executed in both
`release-smoke` and `webkit-smoke`. The Sync v2 spec itself reproduces the
shared-device logout/account-switch privacy contract because the existing
`access-gating.spec.ts` is not in the WebKit project.

### R10 — Release health has a denominator and contains no user content

`client_errors` remains the scrubbed failure-reporting path, but it cannot prove
traffic or success ratios. Add append-only `mybishbash_sync_health` with: owner
ID, observed-at, operation, outcome, assignment mode/audience generation,
protocol/schema/app version, platform, queue count, maximum queue age, duration,
payload bytes, and nullable shadow-match result. It contains no entity type/key,
mutation ID, payload, titles, text, profile data, raw error message, or device
fingerprint.

Assignment/bootstrap/push/event/blob/pull RPCs insert authoritative rows for
server-observed request and acceptance outcomes inside their own code path; the
client cannot self-report these successes. A separate rate-limited
`reportSyncClientHealth` RPC accepts only enumerated client-only observations
such as shadow comparison completion, offline-replay completion, queue age, and
apply duration. For every row the server derives `owner_id`, `observed_at`,
current assignment/generation, and deliberate-test classification; it validates
bounded protocol/app/platform fields and numeric ranges. There is no direct
client table insert and no client-supplied test label, owner, time, assignment,
or server-operation outcome.

Clients receive no health-row read surface. An admin-only aggregate SQL/RPC
provides eligible, assigned, and distinct-active owner counts plus operation/
outcome totals for a bounded release window. Retain raw rows for 30 days, then
delete them with a scheduled server job. Commit 4 adds schema/RLS/rate-limit/
negative contracts; Commit 6 instruments client-only facts and adds the
repeatable aggregate query/script. Deliberate E2E traffic is labelled from
server-known test principals/build capability and reported separately from real
cohort traffic.

## Server and transport contract

Names may be adjusted once against existing SQL naming conventions, but the
semantics below are fixed:

```text
mybishbash_entities
  id uuid primary key
  owner_id uuid not null -> auth.users on delete cascade
  entity_type text not null
  entity_key text not null
  schema_version integer not null
  payload jsonb null
  sort_order integer null
  deleted_at timestamptz null
  updated_at timestamptz not null (server-owned)
  version bigint not null (server-owned monotonic order)
  check ((deleted_at is null) = (payload is not null))
  unique(owner_id, entity_type, entity_key)
  unique(owner_id, version)
  index(owner_id, version)
  index(owner_id, entity_type, version)

mybishbash_mutation_receipts
  owner_id uuid not null -> auth.users on delete cascade
  mutation_id uuid not null
  mutation_kind entity_upsert|entity_delete|event_append|blob_snapshot
  request_hash text not null (server-computed canonical semantic hash)
  accepted_version bigint null
  covers_entity_version bigint null
  created_at timestamptz not null
  primary key(owner_id, mutation_id)

mybishbash_sync_accounts
  owner_id uuid primary key -> auth.users on delete cascade
  current_version bigint not null default 0 (transactional owner counter)
  entity_schema_version integer not null
  bootstrap_blob_sync_version bigint null
  bootstrapped_at timestamptz null
  last_legacy_blob_version bigint null
  reconciled_blob_version bigint null
  entity_authority_version bigint null
  blob_current_through_entity_version bigint null
  rollback_generation bigint null
  rollback_state text null
  rollback_required_version bigint null
  authority_override blob|paused|null
  override_generation bigint null

mybishbash_sync_bootstraps (manifest; no direct client grants)
  owner_id uuid not null -> auth.users on delete cascade
  bootstrap_generation bigint not null
  status begun|finalizing|finalized|abandoned|expired
  provenance/canonicalization_version/expected_type_counts
  total_items/total_bytes/snapshot_hash
  created_at/updated_at/expires_at/finalized_at
  finalized_version bigint null
  primary key(owner_id, bootstrap_generation)

mybishbash_sync_bootstrap_items (server-staged; no direct client grants)
  owner_id uuid not null -> auth.users on delete cascade
  bootstrap_generation bigint not null
  entity_type/entity_key/schema_version/payload/sort_order/deleted_at
  primary key(owner_id, bootstrap_generation, entity_type, entity_key)
  foreign key(owner_id, bootstrap_generation) -> manifest on delete cascade

mybishbash_events (existing; additive compatibility field)
  id uuid primary key (existing internal row id)
  user_id uuid (existing owner column)
  client_event_id text not null
  client_event_hash text not null (server-computed canonical content hash)
  unique(user_id, client_event_id)

sync_v2_rollout_rules
  id uuid primary key
  priority integer unique
  audience_kind tester_group|staff|percentage|all
  audience_value text/integer as constrained by audience_kind
  mode blob|shadow|entities|paused
  sync_protocol_version integer
  entity_schema_version integer
  generation bigint
  admin-only writes

mybishbash_sync_health
  id uuid primary key
  owner_id uuid not null -> auth.users on delete cascade
  observed_at timestamptz not null (server-owned)
  operation/outcome text (server RPC or bounded client-only enum)
  mode/audience_generation text/integer (server-derived)
  protocol_version/entity_schema_version/app_version/platform text/integer
  queue_count/max_queue_age_ms/duration_ms/payload_bytes integer
  shadow_match boolean null
  is_deliberate_test boolean not null (server-derived)
  append-only; 30-day retention

mybishbash_state (existing; additive compatibility fields)
  sync_version bigint (server-owned, same transactional owner counter)
  state_json._syncV2 (new-client provenance; old clients omit/strip it)
```

Transport boundary:

- `getAssignment(syncProtocolVersion, entitySchemaVersion)`
- `beginBootstrap(provenance, canonicalizationVersion, catalogueCounts,
  totalBytes, snapshotHash)` → create/resume durable manifest
- `appendBootstrapBatch(generation, entities)`
- `finalizeBootstrap(generation)`
- `pushEntityMutations(mutations, assignmentGeneration)` → per-mutation
  acknowledgement/version or typed generation-fenced rejection
- `appendEvents(events, protocolVersion)` → client-event/mutation
  acknowledgements using the existing event table; independent of entity
  authority generation after per-owner queue migration
- `writeBlobSnapshot(snapshot, assignmentGeneration, rollbackGeneration)` →
  idempotent blob sync-version/coverage acknowledgement
- `reconcilePendingToBlob(mutations, overrideGeneration)` → old-authority mutation
  acknowledgements with atomic entity + current-blob projection (rollback-open
  only)
- `pull(afterVersion, throughVersion|null, limit)` → ordered entities + server-
  certified `pageThroughVersion`, fixed snapshot high-watermark, and `hasMore`
- `reportSyncClientHealth(clientOnlyMetrics)` → accepted/rejected, no content
  fields and all identity/assignment/test labels server-derived
- `requestRollback()` / `getRollbackStatus()` while the rollback window is open

One local mutation store does not imply one ambiguous server endpoint: the
dispatcher routes each discriminated kind only to the matching handler above.
The server derives owner identity, validates/canonicalizes the semantic input,
and computes the request hash itself; it never trusts a client hash. Every
entity, event, blob-snapshot, and compatibility handler commits its effect,
transactional version/watermark, idempotency receipt, and authoritative health
row atomically. No receipt may exist without its effect and no effect may commit
without the matching receipt. Receipt lookup/hash comparison precedes generation
fencing for an authenticated valid retry. Bootstrap finalize provides its own
manifest-backed idempotency and atomic replace boundary.

Direct client table writes are not part of the contract. Pull is always the
bounded RPC above, never an ordered select: its first page (`throughVersion =
null`) captures the owner's committed high-watermark; every later page supplies
that same durable watermark so concurrent changes wait for the next cycle. Rows
are ordered uniquely across types through `(owner_id, version)`, and the RPC
writes authoritative request/outcome health. The client persists the in-progress
`throughVersion` with its cursor so reload resumes the same snapshot.

Every security-definer RPC sets a fixed `search_path`, derives owner identity
from `auth.uid()`, rejects unauthenticated callers, and never trusts an
`owner_id` supplied by the client. Revoke default `PUBLIC` and `anon` execute,
then grant only the required execute surface to `authenticated` (and the
explicit admin/service role for rollout administration/aggregate health reads).
Validate the operation enum, entity catalogue/type-key pairing, schema version,
JSON shape, per-entity payload bytes, total batch bytes/items, pull limit, and
bootstrap totals at the server boundary.

Contract tests include unauthenticated/anon invocation, supplied-owner spoofing,
cross-owner entity/receipt/bootstrap/rollback/health access, non-admin rollout
writes, unsupported type/schema/op, oversized entity/event/health payload,
oversized batch/bootstrap, invalid cursor/limit, stale/future assignment or
rollback generation, old-generation push after rollback freeze, and default
function grants. Positive probes still prove two authenticated owners can use
only their own rows. These are executable SQL/RPC tests, not manual assumptions.
Failure-injection probes prove effect/version/receipt/health atomicity for every
mutation handler, receipt lookup before generation fencing, server hash
ownership, event-ID conflict rejection, blob coverage/CAS monotonicity, and
pinned pull high-watermark validation.

## Preflight Commit 0 — rollout control (before Phase 6 Commit 1)

**Implementation status (updated 2026-08-02):** repository control landed at
`def28dc317b065ed6b096023d1ea07d0f37d4304`; the shared hosted database was
migrated and verified in default-blob posture, and migration version
`202608010001` is now recognised by the remote CLI ledger without SQL reapply.
The unrelated July ledger gaps still prohibit a future real `db push`. The
cohort and remaining Phase 5 safety/manual gates below are still blockers, so
Commit 1 has not started.

### `Add default-blob Sync v2 rollout control`

- Add the ordered rollout-rule table and assignment RPC from R1, seeded with a
  catch-all `blob` rule and no entity-enabled audience.
- Add a pure client assignment parser/resolver and exhaustive fail-closed unit
  tests for missing client/session, RPC error, malformed response,
  protocol/schema mismatch, stale generation, and prior entity authority.
- Add SQL/RPC probes that actually exercise listed vs unlisted tester groups,
  staff/admin matching, normal users, stable percentage boundaries, rule
  priority, generation, protocol/schema rejection, and catch-all precedence.
  Prove non-admin config writes fail; prove the admin path can change a rule and
  restore the exact default-blob configuration.
- Add the device-local pause key and E2E scripted-transport selector from R1;
  neither can force blob/entity authority against a real assignment.
- Add a schema-contract check for the flag migration and wire it into the
  normal gates.
- Apply to the shared hosted Supabase project (production database), verify
  assignment remains `blob` for listed tester, unlisted tester, admin/staff,
  and normal accounts, and record only aggregate counts/groups — no emails or
  user IDs.
- Record one selected non-null tester group, contact/consent attestation, and
  activity within the prior 30 days for at least two real non-admin/non-E2E
  participants. If fewer are available, require an explicit dated product-owner
  exception recording the smaller aggregate count and rationale. Record a
  separate two-device test account; it does not count as a real participant.
  If this evidence is absent, remain `Blocked`; do not begin Commit 1. The
  2026-08-02 decision record finds 0 of 2 and provides an unapproved exception
  template only; no exception exists.

The cohort gate before dark Commits 1–5 is intentionally strict because it is
the blueprint's Phase 6 entry condition: do not build a load-bearing migration
that has no operationally available first audience. Relaxing it requires a
standalone packet amendment, not an executor assumption.

## Implementation steps (one commit each after the hard entry gate)

### Commit 1 — Separate connection status from replication status

- Rename `sessionStore.syncStatus/syncError` and all exact consumers to
  `connectionStatus/connectionError` without changing values, timing, screens,
  or launcher readiness.
- Add a separate inert sync-status store/interface from R7, default `disabled`.
- Guardrail: connection state may not be imported from `services/sync` and sync
  status may not gate launcher rendering.
- Commit: `Separate connection and replication status`.

### Commit 2 — IndexedDB v2 entity + mutation stores

- Add the v2 upgrade and transaction APIs from R4; no production consumer.
- Unit: replayable v0→v2 and v1→v2 upgrades, entity CRUD, frozen mutation
  envelope/indexes, atomic entity+mutation+KV+sequence commit, per-entity order,
  independent entities, inflight recovery, flush, cursor/device meta, recovery
  journal replay/discard, durable bootstrap intent/replay cursor, owner
  quarantine/restore, and owner-scoped deleteDb/account-clear.
- Failure matrix: IDB reject/timeout with successful journal; both sinks fail and
  UI rolls back/blocks; stale journal behind a newer local sequence; accepted
  receipt behind a journal; account navigation while durability is unresolved.
  Prove stale localStorage cannot replace newer IndexedDB state.
- Mutation test the atomicity guard: deliberately split the transaction and
  prove the test fails.
- Commit: `Add local entity and mutation stores`.

### Commit 3 — Entity codec, diff, and payload budget

- Add pure projection/decoding/validation for the exact R3 catalogue.
- Unit fixtures: fresh/default profile; all populated fields; empty sets;
  non-UUID IDs; reordered sets; soft-deleted/restored cards; hard removal;
  malformed/unsupported payload; blob→entities→blob semantic round-trip.
- Define the representative edit envelope and assert serialized request <2KB.
  Print actual bytes; no compressed-size sleight of hand.
- No runtime consumer.
- Commit: `Define Sync v2 entity projection`.

### Commit 4 — Server entity spine, RPCs, and security contracts

- Add entity, receipt, sync-account, transactional version-counter/index, RLS,
  grants, bootstrap,
  push, bounded-pull, event client-ID, and sync-health migrations per the fixed
  server contract.
- Add the server-owned blob `sync_version` trigger and Sync v2 provenance/
  legacy-write reconciliation fields from R6; the trigger must also observe
  writes made by old clients.
- Update account deletion and its security test.
- Add schema/RLS contract tests, including every negative probe listed above,
  and local Supabase migration reset coverage.
- Hold one owner-version transaction open, start a second acceptance, and prove
  it blocks then commits in cursor-safe order; mutation-test any free-running
  sequence substitution.
- Test durable bootstrap manifest resume/expiry/hash mismatch, staging-only
  batches, atomic finalize, deterministic contiguous unique row versions, and a
  pull page boundary through that reserved range. Test pinned pull high-watermark
  resume across concurrent writes and process reload.
- Audit/revoke legacy anonymous blob access only if hosted evidence confirms it
  is unused; otherwise record the blocker and keep this revocation in a separate
  fix-forward before broader rollout.
- Apply the migration to the shared hosted Supabase project (production
  database) and verify with authenticated owner A/owner B isolation probes
  before any rule can move beyond the catch-all `blob` mode.
- Commit: `Add the Sync v2 entity spine`.

### Commit 5 — Queue, push, pull, and conflict engine (dark)

- Create `src/services/sync/` with injected transport, queue scheduling,
  per-entity serialization, idempotent acknowledgements, bounded pull, pending
  overlay protection, retry/backoff, online/visibility triggers, flush, and R7
  status reporting.
- Implement the frozen mutation envelope, reload-time
  `inflight → retry_unknown`, immutable retry bodies,
  sequence-aware recovery journal, and `event_append` delivery without yet
  registering a production projector.
- Full fake-transport matrix: offline both sides; delete/edit both orders; clock
  skew; duplicate/reordered responses; response loss; crash mid-queue; pinned-
  watermark pull paging across concurrent writes/reload; malformed payload;
  auth change; local pause; account-wide rollback
  request while work is pending; stale offline writer rejected at the fence and
  later drained through the current rollback override; accepted retry after a
  generation change; logout with unacknowledged work; involuntary owner-switch
  quarantine and same-owner restore.
- No App/store integration and no production network calls.
- Commit: `Add the dark Sync v2 engine`.

### Commit 6 — Shadow bootstrap and dual-write for testers

- Register the projector adapter for `shadow|entities` and retain it in `paused`
  when durable metadata shows prior shadow/entity participation; a never-
  bootstrapped blob account has no entity projector.
- Keep current blob load/apply/save/poll behavior authoritative.
- Register projection before capture; bootstrap the already-merged local
  snapshot through bounded begin/batch/finalize with a cut sequence, replace
  semantics, durable manifest/local intent, loser three-way replay, and replay
  of later mutations.
- On the first shadow boot, atomically migrate the standalone event queue to
  `event_append`, write `eventQueueV2`, and refresh the rollback blob outbox.
  Test crash/retry, concurrent append, stop-on-first-failure, non-UUID IDs,
  identical duplicate, conflicting ID, response loss, and idempotency here—the
  runtime ownership starts in this commit, not Commit 7.
- Bypass the cards 120ms persistence debounce whenever the Sync v2 projector is
  active, as specified by R4, and prove ordinary/immediate-save paths begin
  atomic entity durability in the action turn without making public actions
  asynchronous; `blob` mode retains Phase 5 timing.
- Stamp new-client blob dual-writes with their entity/protocol provenance; keep
  old-client detection fail-closed and unrendered in shadow mode.
- Replace the enabled-account App save timer with the durable coalesced blob
  outbox. Prove local and accepted-remote changes survive reload, retry until
  blob acknowledgement, and advance `blob_current_through_entity_version` only
  after certified catch-up proves the acknowledged snapshot contains them. Add
  lower-coverage rejection, equal-coverage CAS, stale second-device rebase, and
  response-loss/successor tests.
- Pull/decode entities and emit scrubbed shadow metrics; never render shadow
  state in this commit. Compare only after queue drain/pending overlay so normal
  in-flight lag cannot masquerade as divergence.
- Instrument R10 health rows and add the bounded release-window aggregate
  query/script; keep scrubbed failures in the existing client-error path.
- Adapt the E2E auth bridge to the injected entity transport only when its
  explicit Sync v2 test flag is enabled; ordinary existing tests stay blob-path
  compatible.
- Add Settings tester diagnostics for mode, cursor, pending count, last success,
  and last scrubbed error.
- Add the Sync v2 browser spec explicitly to `webkitSmokeTestMatch` and assert
  its execution in both Playwright projects. Run full Chromium + scoped WebKit
  twice, native sync, cloud build, and the 10k boot gate.
- Commit: `Shadow Sync v2 behind the tester flag`.

**Release gate A:** add a higher-priority `shadow` rule for one named tester
group while every other audience still matches catch-all `blob`. Apply the full
release evidence contract below. Require non-zero real bootstrap/push/pull/
shadow traffic, the deliberate offline replay, zero unresolved shadow mismatch,
zero stuck queue, zero Sync v2 client error, and zero lost-write report. Return
that rule to `blob` on any violation.

### Commit 7 — Migrate blob-dependent server consumers

- Make notifications, pack-adoption summary, user-summary, staging diagnostics,
  and release guardrails entity-aware with blob fallback for owners not yet
  bootstrapped.
- Backfill retained blob events into `mybishbash_events`; test non-UUID IDs and
  identical-versus-conflicting `client_event_id` collisions against already-
  migrated queue rows. Keep events in rollback blob writes until the rollback
  window closes; backfill readiness is not authority-retirement.
- Add a complete enumerating guardrail for blob readers/writers and mutation
  probes proving each newly forbidden sink fails.
- Execute R8's hosted inventory and remove anonymous legacy sync-code grants/
  policies. If any supported client still needs them, stop expansion and ship a
  reviewed compatibility fix; do not waive this gate.
- Commit: `Migrate blob consumers to the entity spine`.

### Commit 8 — Entity reads for the tester cohort

- Implement `entities` read authority while preserving blob dual-write,
  provenance monitoring, account-wide two-phase rollback, overlay continuity,
  and every origin/account boundary in R4. Markerless legacy writes request
  rollback preparation but do not silently flip an active client to blob.
- Remove entity-read users from App's blob-apply path without deleting the blob
  path for accounts still assigned `blob`.
- Add the R9 two-context convergence suite and real staging two-device probe.
- Run the full Chromium release suite twice and the scoped `webkit-smoke`
  project (including Sync v2) twice; run offline replay and payload budgets in
  CI.
- Commit: `Read tester state from Sync v2 entities`.

**Release gate B:** one exercised tester release with the same non-vacuity and
zero-loss requirements as A, plus two-device convergence and successful
account-wide two-phase rollback on the deployed build. A local pause is tested
separately and must retain entity authority.

### Release stage C — cohort expansion evidence (operational, no code commit)

- Expand through staff/admins, then deterministic percentage steps. Each step is
  an operational flag change, not a code fork, and receives its own recorded
  exercised release window.
- Record cohort size, migrated owners, accepted/replayed mutations, queue age,
  shadow mismatch count, sync-attributed errors, tester reports, payload p50/p95,
  and rollback result. No PII.
- Do not advance a percentage when the previous window has no meaningful edit
  traffic or unresolved evidence.
- Each newly targeted audience first gets its own `shadow` rule/window, then an
  `entities` rule/window; an already-proven audience can remain on entities.
  Commit tracker/evidence updates only when warranted; do not manufacture an
  implementation diff for an operational rollout.

### Commit 9 — Retire blob writes after 100% clean release

- Entry: all users assigned entity reads for ≥1 exercised clean release, no
  supported old-client population requiring blob-only writes, and rollback
  evidence recorded.
- Stop blob writes and close blob rollback authority; retain the blob read-only
  as migration evidence only. Assignment/config failures now preserve local/
  entity authority in `paused`, and recovery is fix-forward.
- Revoke authenticated/direct blob insert/update policies and grants plus
  execute on blob-outbox/rollback-compatibility write RPCs. Preserve only the
  minimum owner/service read needed for one-time dormant-account migration and
  diagnostics. Contract-test that both current and markerless old-client writes
  are rejected server-side; client-code deletion alone is not retirement.
- Delete App's whole-blob save timer/dirty/high-water refs and retired merge
  ownership. Move only the one-time never-bootstrapped-owner migration read and
  diagnostic/evidence reads behind a named read-only compatibility adapter.
- Guardrail: enumerate all remaining blob reads and assert zero client/blob
  writes. Include Edge Functions, SQL functions/views, scripts, and tests.
- Full release suite, Cloudflare/native builds, two-device/offline e2e, account
  deletion, RLS contracts, and payload/boot gates.
- Commit: `Retire shared-state blob writes`.

The retained blob remains read-only for at least one further release. Dropping
or archiving it is not bundled into Commit 9 and is not required to declare
Phase 6 complete.

## Verification after every implementation commit

Run the repository's full existing gate plus the commit-specific checks:

```text
npm run lint
npm run test:unit
npm run build
npm run test:release-guardrails
npm run test:boundaries
npm run test:bundle-budget
npm run test:coverage:launch-session
npm run test:before-push
git diff --check
```

For SQL commits: local migration reset, schema/RLS contract, owner-isolation
probes, account-deletion contract, then apply to the shared hosted Supabase
project (production database) + read-only verification before enabling any
cohort. For integration/read/retirement
commits: full Chromium Playwright at `--workers=2`, the scoped
`webkit-smoke` project with explicit Sync v2 inclusion, Cloudflare build,
Capacitor sync, and `test:perf-boot`.

If the main checkout still contains the protected 28 `public/` modifications,
run every command that can regenerate `public/` (including `npm run build` and
any prebuild wrapper) in a disposable worktree/copy at the candidate source,
never in the shared checkout. Fingerprint and list the 28 paths before and after
the verification run; the main-checkout fingerprints must be identical, and no
generated output may be copied back or staged. All staging uses explicit file
paths; never use repository-wide add/restore/clean commands.

Mutation/guardrail tests must prove non-vacuity by changing the served bundle or
source hash before trusting a failure, following the permanent Phase 4c rule.

## Release evidence contract

A clean Sync v2 release window lasts at least 24 hours **and** crosses the next
scheduled release after assignment, unless a dated product-owner exception
records why the schedule makes that impossible. Before the window starts, its
evidence file freezes the target rule generation, eligible and expected-active
denominators, supported app/protocol/schema versions, query/script SHA, and
thresholds below; thresholds may not be weakened after results are visible. It
records:

- source SHA, deployment and CI run IDs, start/end timestamps;
- each ordered rule generation/mode plus eligible, assigned, and
  distinct-active owner counts;
- distinct-owner bootstrap, push, pull, shadow-compare, and offline-replay
  coverage ratios (numerator and denominator, not counts alone);
- non-zero accepted/replayed mutation counts split between real users and
  deliberate test traffic;
- deliberate offline replay result and maximum queue age;
- shadow comparison count and unresolved mismatches;
- sync-attributed `client_errors`, health outcomes, and tester lost-write
  reports;
- two-device convergence result for entity-read windows;
- edit-envelope byte p50/p95 and representative gate result;
- app/protocol/schema/platform distribution and any unsupported/markerless old
  client write;
- pre-retirement two-phase rollback result, or post-retirement `paused`
  fix-forward drill result.

At least two real non-admin/non-E2E owners must contribute at least ten accepted
real mutations across the window; 100% cannot qualify on one synthetic account.
If the actual eligible population is smaller, a dated product-owner exception
must state the population, real traffic achieved, and why the evidence remains
representative. Default pass thresholds are:

- 100% of observed eligible supported-version sessions receive the intended
  assignment, with no unknown/malformed generation;
- at least 80% of the frozen expected-active real cohort participates, never
  fewer than the two-owner/ten-mutation floor above;
- 100% of owners that begin bootstrap finalize it within the window, and every
  accepted mutation is eventually acknowledged with no online queue older than
  15 minutes at window close;
- at least 90% of distinct active shadow owners complete a comparison, with at
  least ten completed comparisons and zero unresolved mismatch;
- deliberate offline replay and, for entity-read windows, two-device
  convergence pass; lost writes, cross-owner access, unsupported writes,
  unclassified markerless writes, and stuck queues remain exactly zero.

Before the 30-day raw-row TTL, persist a dated aggregate evidence artifact under
`docs/release-evidence/phase-06/` containing the frozen thresholds, query/script
SHA, source/deployment/CI IDs, numerator/denominator results, version/platform
distribution, exceptions, and reviewer decision. Commit that artifact with the
tracker update. Zero errors with zero Sync v2 traffic is not evidence. Any
payload, entity key, mutation identifier, device fingerprint, or user content
is excluded from telemetry; the R10 aggregate dimensions are sufficient.

## Rollback and stop-the-line criteria

Remote order of response while blob rollback is still open:

1. for a cohort incident, change the affected audience rule from `entities` to
   `paused`; create an owner rollback generation that fences new acceptance and
   freezes that owner's required version;
2. per owner, drain/reconcile accepted entity state into the durable blob outbox
   and prove `blob_current_through_entity_version` reaches that frozen version;
3. publish that owner's higher-precedence `blob` override only when ready, then
   verify its clients change authority without redeploy; unready/offline owners
   remain safely `paused` and do not block ready owners;
4. after all intended owners are ready, the audience rule may return to `blob`
   and overrides may be cleared; preserve entity rows, queues, receipts, health
   evidence, and blob for diagnosis, then fix forward or revert implementation
   commits in reverse.

For a shadow-only audience, changing its rule directly to `blob` is safe because
blob never ceased to be read authority. A device-local control may only select
`paused`; it cannot perform account-wide rollback. After Commit 9 retires blob
writes, steps 2–3 are unavailable: keep entity authority locally in `paused`,
preserve pending work, and ship a fix-forward. Never hydrate the retained stale
blob merely because assignment, transport, write, or flush failed.

Stop rollout immediately for any reproducible lost write; divergence after
queue drain; bootstrap that is not idempotent; a queue item acknowledged without
durable entity state; a remote pull overwriting an unpushed local mutation;
cross-owner read/write; unsupported schema write; shadow mismatch not explained
by documented normalization; event backfill loss; notification/HQ regression;
account deletion residue; p95 edit envelope ≥2KB for the representative edit;
or boot regression >20% against the Phase 5 gate.

Do not repair a failed rollout by making the blob and entity paths mutually
authoritative. At every stage R6 names exactly one read authority.

## Executor handoff

Before each commit, read this packet in full, inspect the current HEAD rather
than trusting line numbers, and confirm the entry/release gate for that commit.
If work is already present, verify it and continue. If current code contradicts
an invariant here, stop and amend the packet in a standalone reviewed commit
before implementing around the contradiction.

The protected generated `public/` artefacts are unrelated to Phase 6. Never
stage them with architecture work; use explicit paths and isolated builds while
they remain user changes.
