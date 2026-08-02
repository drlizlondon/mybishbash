# Phase 6 tester-cohort decision record

**Decision date:** 2026-08-02
**Evidence snapshot:** hosted aggregate query completed
`2026-08-01T21:09:20Z`
**Decision:** **Not qualified — 0 of 2 required participants**

This record uses repository evidence only. It does not infer identity,
consent, contactability, employment, device access, or human status from an
account row. The source query intentionally emitted aggregates and opaque
per-result group labels, not account IDs, email addresses, group values, or a
reversible group hash. The candidate labels below are descriptive slots for
this decision only; they are not durable identities and cannot be used to join
future consent evidence without a founder-held mapping outside Git.

The recorded 30-day activity predicate was
`last_meaningful_activity_at >= now() - interval '30 days'` at query execution,
approximately the window `2026-07-02T21:09:20Z` through
`2026-08-01T21:09:20Z`. It is not a fresh activity check for a later rollout.

## Candidate-by-candidate decision

| Candidate slot | Active in recorded 30-day window | Group | Staff/admin/owner record | E2E record | Dated Sync v2 consent | Contactability evidence | Human-attested non-automation | Two-device evidence | Decision and exact reason |
|---|---|---|---|---|---|---|---|---|---|
| `G01-A` | No | Non-null opaque `group_01`; actual selected group value not recorded | No `admin_users` membership; no separate employment attestation | No structural E2E marker | None | None | None | None | Fails: inactive; selected-group identity, consent, contactability, real-human/non-automation, non-staff attestation, and device evidence are absent |
| `G01-B` | No | Non-null opaque `group_01`; indistinguishable from `G01-A` in committed evidence | No `admin_users` membership; no separate employment attestation | No structural E2E marker | None | None | None | None | Fails for the same reasons as `G01-A`; aggregate evidence cannot assign later facts to this slot |
| `U-01` | Unknown for this slot; aggregate is 1 active of 3 | Null/unassigned | Unknown for this slot; aggregate is 1 owner/admin operator of 3 | No structural E2E marker | None | None | None | None | Fails: ungrouped; the aggregate cannot assign activity or operator status to this slot, and all human evidence is absent |
| `U-02` | Unknown for this slot; aggregate is 1 active of 3 | Null/unassigned; indistinguishable from the other `U-*` slots | Unknown for this slot; aggregate is 1 owner/admin operator of 3 | No structural E2E marker | None | None | None | None | Fails for the same reason as `U-01`; no row-level identity can be inferred from the aggregate |
| `U-03` | Unknown for this slot; aggregate is 1 active of 3 | Null/unassigned; indistinguishable from the other `U-*` slots | Unknown for this slot; aggregate is 1 owner/admin operator of 3 | No structural E2E marker | None | None | None | None | Fails for the same reason as `U-01`; no row-level identity can be inferred from the aggregate |

`admin_users` covers the repository's owner/admin/analyst/support operator
model. Absence from that table is useful structural evidence but is not, by
itself, a founder attestation that a real person is non-staff. The E2E query
recognises only `cohort = 'e2e'` or `access_source` containing `e2e`; absence of
that marker is not proof that an account is human or non-automated.

No current candidate qualifies. No separate two-device test account is
recorded. The unassigned aggregate proves one active row and one operator row,
but it does not prove whether those are the same account; this uncertainty does
not affect the decision because all three rows fail the non-null-group gate.

## Smallest ordinary-cohort founder action list

The least-change path is to qualify the two existing grouped slots rather than
altering production membership merely to make the query pass:

1. Outside Git, identify the real people behind the two `group_01` rows and
   retain a founder-controlled mapping to two stable privacy-safe aliases.
   Explicitly select that existing non-null group for the Sync v2 pilot.
2. Re-engage both people and have each perform meaningful product activity.
   Re-run the privacy-minimised cohort inspection and require both aliases to
   be objectively active in the then-current 30-day window.
3. Add one dated, privacy-safe founder evidence record for each alias stating:
   real human; not automated; not E2E; not staff/admin/owner; current contact
   channel verified; explicit informed consent to the controlled Sync v2 test;
   selected-group membership; and activity-check date. Keep names, emails, and
   the alias mapping outside the repository.
4. Designate a separate account that can genuinely be used in two independent
   device/browser sessions and record its alias, two-device availability,
   operator, and date. It must not count toward the two real participants. The
   owner/admin tester may serve only this separate technical role if a human
   maps the aggregate row and confirms two-device access; neither fact is
   presently evidenced in the repository.
5. Re-run and commit a timestamped aggregate query result. Require two active,
   grouped, structurally non-operator/non-E2E rows plus the human records above
   before changing the cohort gate.

If either grouped person cannot qualify, recruit or assign replacements through
the normal founder-controlled tester process and repeat the same evidence. Do
not edit user rows solely to manufacture readiness.

## Product-owner exception fallback template

This is a fallback record only. No exception is recommended, approved, or
inferred by this document. The ordinary cohort should be established first.
Only the named human product owner may approve an exception.

```md
## Product-owner exception — [unique ID]

- Status: [PROPOSED / APPROVED / DENIED]
- Missing normal criterion: [exact criterion that cannot be met]
- Normal requirement: [quote the packet requirement]
- Narrow exception requested: [exact reduced scope; no implied future waiver]
- Evidence and rationale: [privacy-safe facts showing why ordinary recruitment failed]
- Risk accepted: [specific representativeness, support, data-loss, and rollout risk]
- Compensating controls: [catch-all blob, smaller audience, monitoring, contact plan,
  rollback/pause trigger, expiry, and stop conditions]
- Non-waived gates: [manual Phase 5 checks, default-blob control, consent,
  contactability, non-automation, two-device evidence, or other surviving gates]
- Product owner: [human name and role]
- Decision date/time: [UTC timestamp]
- Effective scope: [phase/commit, source SHA, tester group/rule generation]
- Review/expiry date: [UTC date or exact rollout gate]
- Owner attestation: "I accept only the scoped risk above." — [owner/date]
```

An exception for the preflight participant count does not automatically waive
the later release-window two-owner/ten-real-mutation evidence floor, release
schedule, or any other packet gate. Those are separate decisions. Zero
operational participants cannot be treated as a viable first audience without
a standalone reviewed packet amendment.
