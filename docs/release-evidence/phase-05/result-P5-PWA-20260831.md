# Phase 5 — Packet B (installed iPhone PWA) result record

**Run ID:** `P5-PWA-20260831`
**Dates:** started 2026-08-31, completed 2026-09-01 (paused overnight between B8
and B9; state persisted on-device across the gap).
**Environment:** installed Home-Screen PWA from the permanent staging origin
`https://drlizlondon.github.io/mybishbash-preview/`.
**Device:** iPhone 15 Pro Max, iOS 26.6. Signed out throughout; synthetic data
only.
**Builds (frozen):**
- **Baseline** `2e00148` (`Correct Phase 5 acceptance for installed PWA`) — the
  build already live at start; contains required correction `8c4824d`.
- **Candidate** `267bd55` (`Phase 5 Test B: temporary candidate marker for update
  proof`) — one commit past baseline, `index.html` comment only; deployed to the
  same origin mid-test (verified live before B5).

## Operator boundary

Physical-device steps (install, Home-Screen launches, the Save taps, relaunches,
Airplane-Mode relaunch) were **performed by Lizzie on her own iPhone**. Claude
(agent) drove the Mac-side Web Inspector reads/helpers over the USB cable and
prepared the candidate + deploy, but **does not claim the physical-device gate
passed** — that is Lizzie's attestation below.

> **Founder attestation — SIGNED.** _"Witnessed and attested, Lizzie Soyode,
> 2026-09-01."_ Lizzie performed the on-device steps and accepts the captured
> results as what the app did. **Packet B (installed iPhone PWA) is CLOSED.**

Method note: the card's ••• menu **Edit** is unreachable by touch on this build
(a cosmetic z-index bug — the menu paints behind the row above; logged separately
as a real mobile UX bug). Card edits were opened via the app's genuine Edit
handler through Web Inspector and **Saved by Lizzie tapping Save on the phone** —
the real app write path; storage was never written directly.

## Results (values as read on-device)

| CP | Action | Running build | Card on screen / IDB card | localStorage card | Events | Marker | Retry REQ / ACK |
|----|--------|---------------|---------------------------|-------------------|--------|--------|-----------------|
| **B0/B1** | Install baseline + seed (card+event+profile) | `2e00148` | Legacy seed | Legacy seed | 1 | PRESENT | none / none |
| **B2** | Edit on phone → IDB newer | `2e00148` | **IDB newer** | Legacy seed (unchanged) | 1 | PRESENT | none / none |
| **B3** | Full close + reopen | `2e00148` | IDB newer | Legacy seed | 5 (grew) | PRESENT (single) | none / none |
| — | *B3 detail* | — | seeded event still present (`hasSeededEvent:true`); `metaKeys:["migratedFromLocalStorage"]` | — | — | — | — |
| **B4** | Deploy candidate to staging | candidate live | — | — | — | — | — |
| **B5/B6** | App self-updates; post-update check | **`267bd55`** | IDB newer (survived update) | Legacy seed | 9 | PRESENT | none / none |
| **B7.1** | Kill switch ON + reload | `267bd55` | Legacy seed (rollback view) | Legacy seed | — | — | **`ca706133…`** / none |
| **B7.2** | Deliberate legacy edit → Legacy return | `267bd55` | Legacy return | **Legacy return** | — | — | `eff1951f…` / none |
| **B7.3** | Kill switch OFF + reload | `267bd55` | **Legacy return** | Legacy return | — | — | `eff1951f…` / **`eff1951f…` (match)** |
| **B8** | Online relaunch | `267bd55` | Legacy return | Legacy return | 18 | PRESENT | — |
| *(gap)* | Overnight, re-confirmed next day | `267bd55` | Legacy return | Legacy return | 26 | PRESENT | — |
| **B9** | **Airplane Mode** relaunch | (offline) | **Legacy return** (app opened offline) | — | 28 | PRESENT | — |

## The properties the gate cares about — all held

1. **Candidate proven running** — `version.json` (no-store) went `2e00148 →
   267bd55` after the real deploy + the app's own update on relaunch. Not a visual
   change; the running build id changed.
2. **Data survived a real update (B5/B6)** — the newer card and all events
   crossed the update intact; stale localStorage never rendered; single migration
   marker.
3. **Kill-switch reconciliation correct (B7)** — the deliberate legacy edit
   (`Legacy return`) reconciled into IndexedDB on switch-off, and ACK equalled the
   exact REQUEST token (`eff1951f…`). No stale seed won; no data lost.
4. **Survives online + offline relaunch (B8/B9)** — data intact across a full
   online relaunch and an Airplane-Mode relaunch; **offline launch works** (B9 is
   a genuine pass, not N/A).

## One transparent observation (investigated, benign)

At **B7.1**, a retry REQUEST token (`ca706133…`) appeared after the kill-switch
reload, *before* the deliberate card edit — unlike Test A's A2, where it stayed
`(none)`. Root cause (verified in `src/storage.js`,
`markLegacyMutationForReconciliation`): the token advances on **any genuine
mutation while in localstorage mode**, and the app had logged a real event
(`card_shown` etc.) on that boot. This is **by design** — a real byte-changing
write legitimately advances the generation — and is **not** the vacuous
first-render write the gate guards against (that was fixed in `8c4824d`). The
safety property held (IndexedDB was not overwritten at B7.1), and the final
reconciliation at B7.3 imported the latest localStorage snapshot (the deliberate
`Legacy return`) and acknowledged the correct token. No data was lost.

## Verdict (subject to founder attestation)

Every checkpoint B0–B9 met its expected result on the real installed iPhone across
a genuine deploy/update: candidate proven running, dataset retained, stale
snapshot rejected, deliberate legacy edit reconciled, single stable migration
marker, and survival of online **and** offline relaunch. On the evidence,
Packet B's pass conditions are met and **founder-attested 2026-09-01 (signature
above) → Packet B CLOSED.** With Packet A (2026-08-31), **both Phase 5 manual
gates are now cleared.**

## Follow-ups
- **Candidate marker commit `267bd55`** is still on `staging` (harmless HTML
  comment). Decide: revert before the staging→main PR, or keep. (Agent to prep the
  revert on request.)
- **Mobile ••• menu z-index bug** — Edit/Duplicate/etc. unreachable by touch on
  the card options menu (paints behind the row above). Real user-facing bug,
  separate from Phase 5; recommend logging as its own fix.
