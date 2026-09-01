# Phase 5 — Test B (installed iPhone) — the simple version

**Written for Lizzie.** Plain-English companion to §B of
`manual-verification-packet-2026-08-02.md`. Test A is done and attested; this is
the last gate before staging → main.

## Why this one needs your actual phone (30 seconds)

Test A proved the data survives storage switches **in a browser window**. Test B
proves the same thing in the place it really matters: **an app installed on your
Home Screen, surviving a real app update.** An installed iPhone app keeps its
data in a private box that a browser tab can't reach — that's exactly why a robot
can't do this half. You (with your Mac + a cable) are the only one who can.

**What you need in one sitting (~30–40 min):**
1. Your **iPhone**.
2. Your **Mac + charging cable** (to reach the installed app's private data box
   via Safari's Web Inspector).
3. Me, here, to read each result with you and do the write-up.

**One-time Mac setup (do once, ever):**
- Mac **Safari → Settings → Advanced → tick "Show Develop menu."**
- iPhone **Settings → Safari → Advanced → turn on "Web Inspector."**
- Plug the iPhone into the Mac; tap **Trust** if asked.

---

## Builds are frozen

- **Baseline** (install this first): `2e00148` — **already live** on the preview
  site, nothing to deploy. This is the "before."
- **Candidate** (the "after" — deployed halfway through, at step B4): a tiny new
  commit I've prepared. When you reach B4, run the two commands in that step and
  it deploys itself. It changes the app's fingerprint so we can *prove* the phone
  actually updated (not just looked the same).

The traffic-light card title path is the same idea as Test A. Your representative
data is: **1 card + 1 event + your profile name.**

---

# PART 1 — install the "before" app and plant data (B0–B1)

### B0 — install baseline on your Home Screen
1. On the **iPhone**, open **Safari** and go to:
   **https://drlizlondon.github.io/mybishbash-preview/install/safari/**
2. Tap the **Share** icon → **Add to Home Screen** → **Add**.
3. Tap the new **myBishBash** icon to open it. Leave it open.
4. 📸 Screenshot the Home Screen icon + the opened app. Tell me your **iPhone
   model + iOS version** for the record.

### B1 — plant the test data (via your Mac)
1. On the **Mac**, open **Safari → Develop menu → [your iPhone] →** find the
   **myBishBash** app entry and click it. A Web Inspector window opens.
2. Click the **Console** tab in that window.
3. Paste this **whole block**, press Enter. The app reloads into its Library.

```js
// --- B seed: card + event + profile, then boot the installed app fresh ---
localStorage.clear();
(async () => {
  const dbs = await indexedDB.databases?.() || [];
  await Promise.all(dbs.map(d => new Promise(r => { const x = indexedDB.deleteDatabase(d.name); x.onsuccess=x.onerror=x.onblocked=()=>r(); })));
  const runId = "P5-PWA-20260831";
  const seededAt = "2026-08-02T00:00:00.000Z";
  const card = { id:`native-card-${runId}`, cardKind:"personal", promptText:`Legacy seed ${runId}`, dashboardTitle:`Legacy seed ${runId}`, theme:"Minimal", icon:"heart", frequency:"once_daily", timingWindows:["morning","day","evening","night"], statusToday:"fresh", paused:false, disliked:false, deletedAt:null, doneDate:null, lastShownAt:null, notYetUntil:null, sourcePackId:null, createdAt:seededAt, updatedAt:seededAt };
  const event = { id:`native-event-${runId}`, event_type:"card_shown", card_id:`native-card-${runId}`, created_at:seededAt };
  localStorage.setItem("MYBISHBASH_E2E_MODE","true");
  localStorage.setItem("MYBISHBASH_E2E_TESTER_MODE","true");
  localStorage.setItem("MYBISHBASH_DEMO_MODE","true");
  localStorage.setItem("mybishbash.setup-complete.v1","true");
  localStorage.setItem("mybishbash.profile.v1", JSON.stringify({ name:`Native ${runId}`, timezone:"Europe/London" }));
  localStorage.setItem("mybishbash.cards.v1", JSON.stringify([card]));
  localStorage.setItem("mybishbash.event-log.v1", JSON.stringify([event]));
  localStorage.setItem("mybishbash.offline-event-queue.v1","[]");
  localStorage.setItem("mybishbash.disliked-pack-card-ids.v1","[]");
  localStorage.setItem("mybishbash.action-cards.v1","[]");
  localStorage.setItem("mybishbash.launcher-behavior-settings.v1", JSON.stringify({ mybishbash:{useInterruptionPack:false,interruptionPaused:false,interruptionPackId:""}, safari:{useInterruptionPack:false,interruptionPaused:false,interruptionPackId:""} }));
  location.assign("/mybishbash-preview/library");
})();
```

4. Then paste the **CHECK tool** once (teaches the Console a `CHECK()` command;
   also records which build is running):

```js
async function CHECK(){
  const v = await fetch("/mybishbash-preview/version.json?ts="+Date.now(),{cache:"no-store"}).then(r=>r.json()).catch(()=>({}));
  const idb = await new Promise((res)=>{ const r=indexedDB.open("mybishbash"); r.onsuccess=()=>{ const db=r.result; if(!db.objectStoreNames.contains("kv")){db.close();return res({note:"not migrated yet"});} const o={}; const tx=db.transaction(["kv","meta"],"readonly"); const kv=tx.objectStore("kv");
    const c=kv.get("mybishbash.cards.v1"); c.onsuccess=()=>{try{o.card=JSON.parse(c.result)[0]?.promptText;}catch{o.card=c.result;}};
    const e=kv.get("mybishbash.event-log.v1"); e.onsuccess=()=>{try{o.events=JSON.parse(e.result).length;}catch{o.events="?";}};
    const m=tx.objectStore("meta").get("migratedFromLocalStorage"); m.onsuccess=()=>{o.marker=m.result?"PRESENT":"missing";};
    tx.oncomplete=()=>{db.close();res(o);}; }; r.onerror=()=>res({note:"no db"}); });
  let lsCard="(none)"; try{ lsCard=JSON.parse(localStorage.getItem("mybishbash.cards.v1"))[0]?.promptText; }catch{}
  const t={ "Running build (sourceSha)": v.sourceSha||"?", "Card on screen":"(read app)", "IndexedDB card": idb.card??idb.note, "IndexedDB events": idb.events, "localStorage card": lsCard, "Migrated marker": idb.marker??idb.note, "Engine switch": localStorage.getItem("mybishbash.storage-engine.v1")||"(default IndexedDB)", "Retry REQUEST": localStorage.getItem("mybishbash.storage-migration-retry.v1")||"(none)", "Retry ACK": localStorage.getItem("mybishbash.storage-migration-retry-ack.v1")||"(none)" };
  console.table(t); return t;
}
console.log("CHECK() ready");
```

5. Type `CHECK()`. **Expect:** Running build ends `…2e00148…`; IndexedDB card
   *Legacy seed*; IndexedDB events **1**; Migrated marker **PRESENT**. On the
   phone screen (Library → open Personal Cards) you should see the card
   **`Legacy seed P5-PWA-20260831`**. 📸 + tell me the numbers.

---

# PART 2 — make a newer edit, prove it sticks (B2–B3)

### B2 — edit through the app, on the phone
1. On the **iPhone**: Library → Personal Cards → the card's **•••** → **Edit** →
   change the text to **`IDB newer P5-PWA-20260831`** → **Save**.
   *(If the ••• menu looks half-hidden, scroll it into view — it's a known
   cosmetic quirk, harmless.)*
2. On the Mac Console: `CHECK()`. **Expect:** IndexedDB card = *IDB newer…*;
   localStorage card still = *Legacy seed…* (old copy stays put). 📸

### B3 — close it fully, reopen, confirm nothing lost
1. On the iPhone, swipe the app **fully closed** (app switcher).
2. Reopen from the Home Screen icon.
3. `CHECK()`. **Expect:** still *IDB newer…*, events still **1**, marker
   unchanged. Screen shows *IDB newer…*. 📸

---

# PART 3 — deploy the "after", prove the phone really updated (B4–B6)

### B4 — deploy the candidate (⚠️ this is a real deploy — your call to run)
On the **Mac**, in the repo, run these two commands. The first makes the tiny
"after" change; the second sends it and triggers the preview deploy:

```bash
cd ~/mybishbash && git checkout staging && \
sed -i '' 's#</head>#  <!-- P5-B candidate 2026-08-31 -->\n  </head>#' index.html && \
git add index.html && git commit -m "Phase 5 Test B: candidate marker (temporary, for update proof)"
```

```bash
cd ~/mybishbash && git push origin staging
```

Then watch the deploy finish (GitHub → Actions → **Deploy GitHub Pages Preview**,
~1–2 min). When it's green, note the new commit's short SHA — that's your
**candidate**. *(We remove this marker commit again after the test.)*

### B5 — let the installed app update itself
1. On the iPhone, **close** the app fully, wait ~10s, **reopen** it. Do this 1–2
   times — the service worker installs the new version in the background.
2. On the Mac Console: `CHECK()`. **Expect:** "Running build (sourceSha)" now
   shows the **candidate** SHA (not `2e00148`). If it still shows `2e00148`,
   close/reopen once more and re-check. 📸

### B6 — confirm the update didn't lose data
- `CHECK()` should still show: IndexedDB card *IDB newer…*, events **1**, marker
  **PRESENT and unchanged**, localStorage did not overwrite it. Screen shows
  *IDB newer…*. 📸 This is the heart of Test B: **your data crossed a real app
  update intact.**

---

# PART 4 — the genuine legacy edit (B7)

Same shape as Test A's A2–A4, now on the updated phone app:
1. Mac Console: `localStorage.setItem("mybishbash.storage-engine.v1","localstorage");`
   then on the iPhone close+reopen the app.
2. `CHECK()`: screen shows the old *Legacy seed…*; IndexedDB still *IDB newer…*;
   **Retry REQUEST still (none)** — the switch alone must not trigger a sync. 📸
3. On the iPhone: edit the card → **`Legacy return P5-PWA-20260831`** → Save.
   `CHECK()`: Retry REQUEST is now a code. 📸
4. Mac Console: `localStorage.removeItem("mybishbash.storage-engine.v1");` then
   close+reopen the app. `CHECK()`: IndexedDB card now *Legacy return…*, and
   **Retry ACK equals that code**. 📸

---

# PART 5 — final relaunches (B8, and B9 if offline is supported)

- **B8 (online):** close + reopen from Home Screen while online. Everything from
  B7 survives; running build is still the candidate. 📸
- **B9 (offline):** *Only if offline launch is meant to work* (I'll confirm this
  with you before you run it). Turn on **Airplane Mode**, close + reopen. Record
  whether the app opens with data. If offline isn't a supported feature yet, we
  write "Not applicable" with the reason — we don't skip it silently.

---

# After the test
- On the Mac: `git revert` the candidate marker commit (I'll give you the exact
  line) and push, so staging is clean again — **or** we simply keep it; it's a
  harmless comment. Your call.
- Send me all the screenshots + the CHECK numbers and I write the dated evidence
  record, exactly like Test A. Then you add your attestation line and Phase 5 is
  **Complete**.

### Fill-in table (Test B)

| CP | What you did | Running build | Card on screen | IndexedDB card | Events | localStorage card | Marker | Retry REQ / ACK | OK? |
|----|--------------|---------------|----------------|----------------|--------|-------------------|--------|-----------------|-----|
| B0/B1 | install + seed | 2e00148 | Legacy seed | Legacy seed | 1 | Legacy seed | PRESENT | none / none | |
| B2 | edit on phone | 2e00148 | IDB newer | IDB newer | 1 | Legacy seed | PRESENT | | |
| B3 | close + reopen | 2e00148 | IDB newer | IDB newer | 1 | | PRESENT | | |
| B4 | deploy candidate | (new SHA live) | — | — | — | — | — | — | |
| B5 | app self-updates | **candidate** | IDB newer | IDB newer | 1 | | PRESENT | | |
| B6 | post-update check | candidate | IDB newer | IDB newer | 1 | Legacy seed | PRESENT | | |
| B7 | kill-switch edit | candidate | Legacy return | Legacy return | 1 | Legacy return | PRESENT | REQ set → ACK = REQ | |
| B8 | online relaunch | candidate | Legacy return | Legacy return | 1 | | PRESENT | | |
| B9 | offline relaunch | candidate | (or N/A) | | | | | | |

**Founder attestation (fill after the run):** _"Witnessed and attested, Lizzie
Soyode, 2026-__-__."_
