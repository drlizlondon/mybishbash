# Phase 5 remaining manual verification packet

**Prepared:** 2026-08-02
**Status:** **Pending founder/human execution — no result is claimed here.**
Packet A also has the pre-execution blocker recorded below.
**Candidate source:** `ec4f7159803119ec9c613f98550506adc463022c`

These are the two Phase 5 acceptance checks that automation and
`npx cap sync` cannot replace. Both use synthetic data only. Neither test signs
in, changes a hosted rollout rule, enables Sync v2, or exercises a Sync v2
runtime path.

## A. Manual staging kill-switch verification

### Test identity and operator boundary

- Environment: GitHub Pages staging preview at
  `https://drlizlondon.github.io/mybishbash-preview/`.
- Required build: `version.json.sourceSha` must equal
  `ec4f7159803119ec9c613f98550506adc463022c`. On 2026-08-02 the deployed
  version was `preview-ec4f7159803119ec9c613f98550506adc463022c`, built at
  `2026-08-01T21:17:00.615Z`.
- Operator: a founder or delegated human tester must perform and attest this
  browser exercise. An agent may prepare the fixture and review the record but
  must not claim the manual gate passed.
- Browser: current desktop Chrome or Safari in a new disposable persistent
  profile. Record the browser and operating-system versions.
- Stay signed out. Preserve Console and Network logs. Use no real user data.

If the deployed SHA changes, stop, record the new candidate explicitly, and
restart at A0. Do not splice checkpoints from different builds.

### Seed fixture

At the staging origin only, open Developer Tools. Clear that origin's cookies,
localStorage, IndexedDB, Cache Storage, and service workers. Do not clear any
other origin. Then run this once in the Console and reload:

```js
const runId = "P5-KS-YYYYMMDD-HHMMZ";
const seededAt = "2026-08-02T00:00:00.000Z";
const card = {
  id: `migration-card-${runId}`,
  cardKind: "personal",
  promptText: `Legacy seed ${runId}`,
  dashboardTitle: `Legacy seed ${runId}`,
  theme: "Minimal",
  icon: "heart",
  frequency: "once_daily",
  timingWindows: ["morning", "day", "evening", "night"],
  statusToday: "fresh",
  paused: false,
  disliked: false,
  deletedAt: null,
  doneDate: null,
  lastShownAt: null,
  notYetUntil: null,
  sourcePackId: null,
  createdAt: seededAt,
  updatedAt: seededAt,
};
localStorage.setItem("MYBISHBASH_E2E_MODE", "true");
localStorage.setItem("MYBISHBASH_E2E_TESTER_MODE", "true");
localStorage.setItem("MYBISHBASH_DEMO_MODE", "true");
localStorage.setItem("mybishbash.setup-complete.v1", "true");
localStorage.setItem(
  "mybishbash.profile.v1",
  JSON.stringify({ name: `Migration ${runId}`, timezone: "Europe/London" }),
);
localStorage.setItem("mybishbash.cards.v1", JSON.stringify([card]));
localStorage.setItem("mybishbash.event-log.v1", "[]");
localStorage.setItem("mybishbash.offline-event-queue.v1", "[]");
localStorage.setItem("mybishbash.disliked-pack-card-ids.v1", "[]");
localStorage.setItem("mybishbash.action-cards.v1", "[]");
localStorage.setItem(
  "mybishbash.launcher-behavior-settings.v1",
  JSON.stringify({
    mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: "" },
    safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: "" },
  }),
);
location.assign("/mybishbash-preview/library");
```

Replace the `runId` timestamp before execution. The fixed `seededAt` value is
intentional and makes byte comparison reproducible.

### Resumable checkpoints and expected authority

| Checkpoint | Action | Storage authority | Expected visible card | Expected stored state |
|---|---|---|---|---|
| A0 | Seed into a cleared profile and boot normally | First boot imports legacy bytes; IndexedDB becomes authority | `Legacy seed <runId>` | IndexedDB `kv/mybishbash.cards.v1` equals the seed; `meta/migratedFromLocalStorage` exists |
| A1 | Edit the card through the UI to `IDB edit <runId>`; wait for persistence; reload | IndexedDB | `IDB edit <runId>` | IndexedDB has the edit; localStorage still has `Legacy seed <runId>` |
| A2 | Set the kill switch and reload | localStorage, for this boot | `Legacy seed <runId>` | IndexedDB still has `IDB edit <runId>`; the switch-and-reload has not made the stale snapshot replay-authoritative before an operator mutation |
| A3 | Edit the card through the UI to `Legacy return <runId>` | localStorage | `Legacy return <runId>` | localStorage has the edit; IndexedDB still has `IDB edit <runId>`; a new retry-request token exists |
| A4 | Remove the kill switch and reload | IndexedDB after exact legacy reconciliation | `Legacy return <runId>` | IndexedDB now has the genuine legacy edit; retry acknowledgement equals the sampled request token |
| A5 | Reload a second time | IndexedDB | `Legacy return <runId>` | Value and migration metadata remain stable; no second stale import occurs |

### Pre-execution blocker at the candidate SHA

Repository inspection and an automated fresh-profile reproduction on
2026-08-02 found that the current candidate cannot yet satisfy A2.
`loadActionCards()` unconditionally calls
`setStorageItem(ACTION_CARD_DEFAULTS_VERSION_KEY, ...)`, and `App` calls
`loadActionCards()` during first render. After hydration selects the
localStorage engine, that write advances
`mybishbash.storage-migration-retry.v1` even when the operator has made no edit.
The call is also made when the defaults-version bytes are already unchanged.

At `2026-08-02T22:11:45.702Z`, a one-off headless Chromium probe started the
current runtime with
`npm run dev -- --host 127.0.0.1 --port 43116 --strictPort`, used Packet-A-style
synthetic localStorage in a fresh browser profile, loaded `/library`, set only
the engine override, and reloaded. Before the switch, retry request,
acknowledgement, and localStorage action-card defaults version were all `null`.
After reload, the request was a new UUID, acknowledgement remained `null`, and
the defaults version was `2026-05-13`. No card edit or other operator mutation
occurred. This automated reproduction is not the required human staging run.

The retry token authorises reconciliation of the complete owned-key snapshot,
not only the defaults-version key. Consequently, removing the switch after A2
can make the stale localStorage card bytes replay-authoritative and replace the
newer A1 IndexedDB card. The current unit guard exercises a read-only
`loadCards()` path rather than the full first render, and the existing browser
test does not assert the retry-token state between kill-switch boot and its
deliberate legacy edit.

This is objective evidence of a hidden dependency, not a completed human test.
Packet A remains the required resumable procedure, but it must not be marked
passed at `ec4f715` unless a separately reviewed runtime correction or
equivalent proof removes this pre-edit replay path. No runtime correction is
part of this documentation-only evidence commit. A same-value guard alone is
not sufficient: after IDB cutover the retained localStorage defaults-version
key may legitimately be absent or stale, so an automatic byte-changing
normalisation write must not silently authorise the entire stale snapshot.

At A2 activate the existing switch exactly as follows:

```js
localStorage.setItem("mybishbash.storage-engine.v1", "localstorage");
location.reload();
```

At A4 restore the default exactly as follows:

```js
localStorage.removeItem("mybishbash.storage-engine.v1");
location.reload();
```

Inspect these keys after each checkpoint:

- localStorage `mybishbash.cards.v1`;
- localStorage `mybishbash.storage-engine.v1`;
- localStorage `mybishbash.storage-migration-retry.v1`;
- localStorage `mybishbash.storage-migration-retry-ack.v1`;
- IndexedDB database `mybishbash`, store `kv`, key
  `mybishbash.cards.v1`; and
- IndexedDB database `mybishbash`, store `meta`, key
  `migratedFromLocalStorage`.

The application shell, Library navigation, and card editor must remain usable
at every checkpoint. There must be no blank boot, hydration hang, duplicate
card, or unrelated state reset.

### Evidence to capture

Record one dated Markdown result containing:

- run ID, UTC start/end, operator, preview URL, exact source SHA, browser/OS;
- a privacy-safe screenshot at A0 through A5 showing the visible card text;
- exported Console and Network logs, including whether any storage error was
  reported;
- the six inspected storage values above at every checkpoint (card values may
  be reduced to run ID + prompt text; retain raw bytes privately if needed);
- proof that the retry request is not advanced during the A2 switch-and-reload
  before a deliberate operator mutation, but is advanced by the genuine A3
  legacy mutation, and that A4 acknowledges the same token; and
- a Network-log assertion of zero `get_sync_v2_assignment`, entity, receipt,
  queue, bootstrap, or other Sync v2 transport requests.

### Pass, fail, resume, and restoration

Pass only if all six checkpoints match the table, selecting the engine at A2
does not replay or overwrite the newer A1 IndexedDB state, the explicit A3
legacy mutation is the only event that advances replay authority before A4,
A4 reconciles the resulting complete owned-key snapshot, the A4 value survives
A5, and no unexpected error or Sync v2 request occurs.

Fail if any expected value is absent or duplicated, a reload hangs, the A2
switch-and-reload publishes replay authority before an operator mutation, the
A3 mutation is not reconciled, the A4/A5 value regresses, or any Sync v2
runtime request appears. A failure keeps Phase 5 manual acceptance and Phase 6
entry blocked.

Resume only from the last fully evidenced checkpoint in the same profile when
the SHA, origin, site data, and stored state still match. Otherwise restart at
A0. After evidence capture, remove the override and clear only the disposable
preview profile's site data. If the test failed, export logs and storage values
before clearing them. No hosted rollback or rollout-rule change is required.

## B. Native iOS/WKWebView install-over-upgrade verification

### Fixed builds and native lifecycle

- Earlier compatible build: `cf69528605a7fe94078d652d7c2de1157fe34a1c`
  (`Gate first render on local-data hydration`), where
  `DEFAULT_STORAGE_ENGINE` is `localstorage`.
- Candidate build: `ec4f7159803119ec9c613f98550506adc463022c`, or a later
  SHA explicitly frozen before restarting the whole test.
- Device: a dedicated disposable iOS simulator or a disposable physical test
  device. Record simulator/device model, iOS version, Xcode version, and Mac
  version.
- Operator: a founder or delegated human with Xcode and Safari Web Inspector
  access must perform the install, force-termination, over-install, inspection,
  and attestation. `npx cap sync` by itself does not pass this gate.

Use separate disposable clones or worktrees for the two SHAs. Never build
either version in the shared checkout containing the 28 protected `public/`
modifications. Do not use an unlabelled commit archive: without `.git`, the
default build cannot populate `version.json.sourceSha`.

In both disposable copies:

1. Keep `appId` exactly `com.drlizlondon.mybishbash` and `webDir` exactly
   `dist`.
2. Remove the complete `server` object, including
   `server.url = https://mybishbash.app/`, from the disposable
   `capacitor.config.json` before `npx cap sync ios`. This forces the native
   shell to load packaged assets at one stable `capacitor://localhost` origin.
3. Build with the default root base and explicit immutable labels, then run
   `npx cap sync ios` and record both outputs:

   ```sh
   # Earlier copy
   VITE_SOURCE_SHA=cf69528605a7fe94078d652d7c2de1157fe34a1c \
   VITE_APP_VERSION=native-baseline-cf695286 npm run build
   npx cap sync ios

   # Candidate copy
   VITE_SOURCE_SHA=ec4f7159803119ec9c613f98550506adc463022c \
   VITE_APP_VERSION=native-candidate-ec4f715 npm run build
   npx cap sync ios
   ```

   If a later candidate is frozen, replace both candidate labels consistently.
4. Before opening Xcode, inspect each `dist/version.json`: `sourceSha` must equal
   that copy's full frozen SHA and `version` must equal its explicit
   `VITE_APP_VERSION`. A mismatch invalidates the build.
5. Do not copy either disposable config back into the repository.

If either install loads `https://mybishbash.app/`, a different origin, or a
different bundle ID, the run is invalid: the live-URL wrapper cannot exercise
a packaged install-over-upgrade.

### Seed and upgrade sequence

Use one run ID such as `P5-IOS-YYYYMMDD-HHMMZ` throughout.

1. **B0 — install the earlier build.** On a new simulator/device, install and
   launch the `cf69528` build. Do not install the candidate first. In Web
   Inspector run `fetch("/version.json").then((response) => response.json()).then(console.log)`
   and require the full baseline `sourceSha` and
   `version=native-baseline-cf695286` before continuing.
2. **B1 — seed legacy state.** In Safari Web Inspector for
   `capacitor://localhost`, replace the run ID and run this complete synthetic
   fixture once. It deliberately stays in E2E/demo mode, signs in to no hosted
   account, and navigates to the packaged `/library` route:

   ```js
   {
     const runId = "P5-IOS-YYYYMMDD-HHMMZ";
     const seededAt = "2026-08-02T00:00:00.000Z";
     const card = {
       id: `native-card-${runId}`,
       cardKind: "personal",
       promptText: `Native legacy ${runId}`,
       dashboardTitle: `Native legacy ${runId}`,
       theme: "Minimal",
       icon: "heart",
       frequency: "once_daily",
       timingWindows: ["morning", "day", "evening", "night"],
       statusToday: "fresh",
       paused: false,
       disliked: false,
       deletedAt: null,
       doneDate: null,
       lastShownAt: null,
       notYetUntil: null,
       sourcePackId: null,
       createdAt: seededAt,
       updatedAt: seededAt,
     };
     const event = {
       id: `native-event-${runId}`,
       event_type: "card_shown",
       card_id: `native-card-${runId}`,
       created_at: seededAt,
     };
     localStorage.setItem("MYBISHBASH_E2E_MODE", "true");
     localStorage.setItem("MYBISHBASH_E2E_TESTER_MODE", "true");
     localStorage.setItem("MYBISHBASH_DEMO_MODE", "true");
     localStorage.setItem("mybishbash.setup-complete.v1", "true");
     localStorage.setItem(
       "mybishbash.profile.v1",
       JSON.stringify({ name: `Native ${runId}`, timezone: "Europe/London" }),
     );
     localStorage.setItem("mybishbash.cards.v1", JSON.stringify([card]));
     localStorage.setItem("mybishbash.event-log.v1", JSON.stringify([event]));
     localStorage.setItem("mybishbash.offline-event-queue.v1", "[]");
     localStorage.setItem("mybishbash.disliked-pack-card-ids.v1", "[]");
     localStorage.setItem("mybishbash.action-cards.v1", "[]");
     localStorage.setItem(
       "mybishbash.launcher-behavior-settings.v1",
       JSON.stringify({
         mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: "" },
         safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: "" },
       }),
     );
     location.assign("/library");
   }
   ```

   Confirm the profile, card, and event unique values are present in
   localStorage and the card is visible in the app. Verify the profile name
   from its stored bytes; the current signed-out UI does not render that name.
   Do not substitute Packet A's `/mybishbash-preview/library` route in the
   packaged wrapper.
3. **B2 — prove baseline durability.** Fully terminate the app from the app
   switcher (or stop the simulator process), relaunch the same installed build,
   and confirm the seed remains. Passively inspect Web Inspector storage, or
   use `indexedDB.databases()` if available, and verify that no
   `migratedFromLocalStorage` marker exists in this legacy-default build;
   absence of database `mybishbash` is the normal expectation. **Do not call
   `indexedDB.open("mybishbash")` at B2:** a naïve open would create an empty
   version-1 database and could prevent the candidate's upgrade handler from
   creating `kv` and `meta`. Capture the exact origin and localStorage byte
   checksums.
4. **B3 — install over, do not uninstall.** Build/sync the candidate in its
   separate disposable copy. In Xcode select the same simulator/device and
   install/run it over the existing app. Do not delete the app, reset the
   simulator, clear Website Data, or change the bundle ID or origin.
5. **B4 — verify first candidate launch.** Confirm the origin remains
   `capacitor://localhost`. Query `/version.json` again and require the full
   candidate `sourceSha` and `version=native-candidate-ec4f715`. Confirm the
   profile, card, and event bytes are intact; IndexedDB `mybishbash/kv` contains
   their three keys; and `mybishbash/meta/migratedFromLocalStorage` has exact
   shape `{ at, appVersion }`, where `at` is a valid timestamp and `appVersion`
   exactly equals `dist/version.json.version`.
6. **B5 — prove IndexedDB authority.** Through the candidate UI, change the
   card to `Native IDB newer <runId>` and wait until that value appears in IDB.
   Return to Library, open `native-card-<runId>`, and press **Done**. Poll IDB
   `mybishbash.event-log.v1` until it contains a new `card_completed` event with
   `card_id=native-card-<runId>` and `action_taken=completed`. Confirm IDB
   contains the newer card and event while the retained localStorage card still
   contains `Native legacy <runId>` and its original event snapshot remains
   stale.
7. **B6 — prove stale localStorage cannot win.** Fully terminate and relaunch
   the candidate twice. The visible card and IndexedDB must remain
   `Native IDB newer <runId>` on both launches; the B5 `card_completed` event
   must remain in IDB; the stale localStorage card/event snapshot must not be
   imported or rendered; and the migration marker must not change.

### Native evidence, pass, fail, and recovery

Capture old/new full SHAs and both runtime `/version.json` results; the
disposable config diff proving `server.url` was removed; build and sync logs;
bundle ID; exact origin; simulator/device, iOS, Xcode and Mac versions; UTC
timestamps for B0 through B6; privacy-safe UI and Web Inspector screenshots;
localStorage and IndexedDB key checksums; migration metadata;
termination/relaunch evidence; and Console errors.

Pass only if both installed runtimes report the frozen SHA/version labels, the
earlier install survives B2, the candidate is installed over it without
clearing the app container, all legacy data migrates intact at B4, the newer
card and B5 `card_completed` event survive both B6 relaunches, and stale
localStorage never overwrites either.

Fail if either runtime SHA/version label is wrong, the origin or bundle ID
changes, the candidate was installed after an uninstall/reset, any seeded value
or the B5 event disappears or changes unexpectedly, the migration marker is
absent/recreated, a stale value renders after B5, or the app cannot relaunch.
An invalid environment must be restarted at B0; a product failure keeps both
gates blocked.

On product failure, stop launching or editing the disposable app, preserve the
simulator/app data container, export Web Inspector storage and logs, and record
the last good checkpoint. Do not clear, uninstall, flip the storage kill
switch, or attempt a production rollout as a recovery step. Diagnose against a
copy of the preserved synthetic container; repeat only on a new disposable
simulator after the failure record is complete.

## Current gate state

Both Packet A and Packet B remain **pending founder/human execution** as of
2026-08-02. Packet A is additionally blocked by the render-time replay-token
path above. Preparing these instructions does not satisfy either Phase 5
acceptance item and does not authorise Phase 6 Commit 1.
