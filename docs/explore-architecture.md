# Explore & Library — UX and Information Architecture

Status: **final recommendation — not implemented** (audited 2026-06-11; refined same day after owner review; branch `claude/pedantic-sanderson-2e1dbe` off `230bc6c`)

Target mental model (owner-confirmed):

- **Explore** = things users can discover and install
- **Library** = things that belong to the user
- **Protected Apps** = configuration and app-specific behaviour

## Final launch IA (summary)

```
Bottom nav: Home · Explore · Library · Log · Settings

EXPLORE (read-only discovery)
├── Start Here                (ONE full-width hero cover, HQ-chosen)
├── Commitments               (rail of HQ templates → prefilled composer)
└── Goal sections             (Confidence · Focus · Calm · Create · Health · Relationships)
    └── Pack cover detail     (image · title · why-this-exists · preview · sticky Install)

LIBRARY (everything the user owns)
├── Personal Cards            (user-written cards)
├── Commitment Cards          (user commitments with check-in)
├── Active Packs              (installed HQ packs; pause/remove here)
└── Do Instead Cards          (alternative actions shown at intercept)

SETTINGS → PROTECTED APPS (configuration)
└── Per-app: interruption on/off, interruption messages, pauses
```

With <20 packs at launch, Explore is a single scroll — no chips, no search, no sub-pages other than pack covers.

Constraints honoured throughout: users do **not** create packs; HQ owns packs, descriptions, images, categories, featured, premium, and commitment templates. No UGC, community, or creator publishing in this design.

---

## A. Current-state audit

### A1. Navigation today

Bottom nav (`App.jsx:5461–5478`): **Home · Library · Log · Packs · Settings**, routes `/home /library /log /packs /settings`.

### A2. The Packs tab mixes four jobs

`PacksPanel` (`App.jsx:7180`) stacks three unrelated sections:

1. **Interruption Packs** — per-app folders ("Instagram Interruptions"…). This is *app configuration*, not content. Tapping opens `PackDetailModal` where users can also **create/edit interruption cards** — so creation and management live inside a "browse" surface.
2. **Active Actions** — action-card CRUD (hide/restore starters, create, delete). A third content type with its own editor, again inside "Packs".
3. **Library Packs** — the only true discovery section: HQ packs with Activate/Deactivate buttons.

So one tab does discovery + management + creation + (implicitly) app behaviour. This is the core mental-model problem the brief identifies.

### A3. Five meanings of "pack" in the codebase

| Code concept | What it actually is | Where |
|---|---|---|
| `PACKS` static array | Hardcoded fallback HQ content (Bible Verse, Motivational Quote…) | `utils.js:13` |
| `global_packs` / `global_pack_cards` | HQ-published packs in Supabase | migration `202605120001`, `fetchGlobalPacks` (`mybishbashSync.js:436`) |
| `cardPacks` (localStorage) | User-created **interruption** packs linked to a launcher | `storage.js` `CARD_PACKS_KEY`, `CustomPackEditor` |
| Interruption "folders" | Per-app merge of `DEFAULT_INTERRUPTION_PACKS` + user pack | `launcherState.js:196` |
| "Active Packs" | Grouping of cards copied from an activated pack | `librarySections.js:38` |

`visibleLibraryPacks` (`App.jsx:5230`) merges static `PACKS` + `global_packs` (deduped by `sourceKey`) minus `hiddenLibraryPacks`. HQ already owns library packs end-to-end (HQPanel Packs page → `saveAdminGlobalPack`), which matches the product direction — the static array is only an offline/unseeded fallback.

### A4. How activation works (important for migration)

"Activate pack" **copies** every entry into the user's card list with `sourcePackId` (`buildCardsFromPack` `utils.js:733`, `activatePack` `App.jsx:4268`). Deactivate soft-deletes those copies; re-activate undeletes them. Hidden pack cards are tracked by a legacy `packId:promptText` key. There is no install/reference concept — "having a pack" *is* "these copied cards exist in my deck". This is workable for launch but means HQ edits to a pack do not propagate to users who already activated it.

### A5. Pack presentation today

- The Packs tab card shows title + description + Activate button — no image, category, count, preview, or premium state.
- `PackDetailModal` (`App.jsx:7320`) immediately lists **every card** with hide/restore buttons — exactly the "see the entire pack" experience the brief wants to avoid, framed as management ("read-only", "Hidden/Visible") rather than as a product.

### A6. Library tab today

`StandardLibraryPanel` (`App.jsx:6809`): three collapsible sections — **Personal Cards**, **Commitment Cards**, **Active Packs** — each with create/add buttons and row menus (edit, pause, reset, delete / remove pack). This is already close to the target Library; "Active Packs" is the only contested concept. There are **no** favourites, saved-for-later, or history concepts anywhere in the code (the Log tab is an event log, which covers "history").

### A7. Commitments today

- A commitment is just a card detected by heuristic `isCommitmentLikeCard` (`utils.js:427`): `dashboardTitle === "Today's Commitment"` or presence of any commitment field. Fragile — no explicit type.
- Check-in flow exists (pending date / response fields, `App.jsx:3795+`).
- **HQ commitment templates do not exist** — zero commitment code in `HQPanel.jsx`, `mybishbashSync.js`, or any migration.

### A8. Assignment to protected apps today

Two separate mechanisms, easily confused:

1. **Installed (library) packs are never assigned to apps.** Their cards join the global rotation (home + interception card pool) governed by timing windows/frequency.
2. **Interruption folders are per-app**: Settings (`App.jsx:7991–8090`) has an On/Off toggle per launcher (`useInterruptionPack` in `launcherBehaviorSettings`); the folder = hardcoded defaults + the user's custom pack for that app. `interruptionPackId` exists in storage/HQ launcher configs but selection UI is vestigial — assignment is effectively a boolean.

So "how are packs attached to apps?" — **they aren't**; only interruption folders are, via a toggle in Settings. Pack-to-app assignment is a concept that does not yet exist and should not be invented for launch (see D/H).

### A9. Membership today

- Access step 1 lives on `feat/access-architecture` (commit `452b1a7`, **not in this branch's history**): `access_tier` free|premium with expiry, capability lens `accessCapabilities.js` (feature code checks capabilities, never tier), audit log, HQ grant forms. No Stripe.
- `global_packs` has no premium/featured/category/image columns.
- Testers: `is_tester` orthogonal flag; tester-only UI already exists (launch timing, reports).
- Note: every `premium-*` class / `PremiumCardScreen` in `App.jsx` is just the *name of the card overlay UI* — there is no membership gating anywhere in the app today.

### A10. Schema gaps for the cover experience

`global_packs`: `id, title, description, theme, icon, published, created_by, timestamps` only. Missing: cover image, category, premium flag, featured flag, author/source label, preview selection, content type, sort order, published_at.

---

## B. Proposed Explore architecture

### B1. Principle

Explore is a **read-only shop window**. Nothing on it is managed, edited, hidden, paused, or configured. Every tap leads to either a pack cover or an install. All management verbs live in Library; all app-behaviour verbs live in Settings/Protected Apps.

### B2. Launch version (final — sized for <20 packs)

```
EXPLORE
├── Start Here          (ONE full-width hero cover, HQ-chosen)
├── Commitments         (rail of HQ commitment templates, horizontal)
└── Goal sections       (packs grouped under goal headers, stacked)
```

- **"Start Here", not "Featured"** — see B5 for the label comparison.
- **One hero, not three tiles.** Three equal featured tiles split attention and need three strong covers on day one. One full-width hero (cover image, title, why-line, and one actual card quote overlaid) gives Explore a magazine-cover opening and HQ a single editorial decision. Needs only the existing `is_featured` flag; if several packs are flagged, highest `sort_order` wins.
- **Goal sections instead of chips/grid.** With fewer than 20 packs, filtering UI is overhead: render the catalogue as stacked sections, one per goal, each holding its cover cards. The whole of Explore is one scroll. **Rule: a goal renders only with ≥2 packs**; singletons fold into the nearest neighbour until content catches up — never show a section of one, and never an empty section.
- **New** — covered by ordering within sections (`published_at desc`); no dedicated section.
- **Premium** — premium packs appear inline with a badge, not in a separate shelf (free users should *see* premium content; see G).

**Defer past launch:** category chips, Search, Popular (needs install analytics — `pack_activated` events already exist, so it's easy later), By App (no pack↔app assignment exists; don't invent it), dedicated Premium shelf, "Recommended For You" (see B5).

### B5. The "I want that" test — and the label question

**Honest verdict on the current design: the architecture stops Explore being a settings screen, but only content presentation makes it compelling.** A list of `title + description + Install` rows is still a settings screen wearing a nicer haircut. What changes the felt experience:

1. **Put the cards on the covers.** The product *is* the card text — "Someone less qualified is already doing it." sells Courage better than any description. Every grid cover carries one HQ-chosen card quote (the first `is_preview` card) as its visual centre. Title and one-liner support the quote, not the reverse.
2. **Covers are images, not rows.** Grid cards render as ~3:2 image cards with text overlaid — closer to album art than to a settings list. No metadata on grid cards beyond a premium badge; card counts live on the detail page.
3. **Voice in the section furniture.** Subtitles speak to the user's day, not the system: Commitments rail = "Small promises for today", not "HQ-created templates". The word "pack" can even disappear from headers — the section header is the goal ("Confidence"), the cards are just *things*.
4. **No empty anything.** Sections with <2 packs don't render (rule above); the commitments rail hides if no templates are published. A new user must never scroll past scaffolding.
5. **First-open moment.** The hero + a one-line page intro ("Find something that helps.") is the whole top of the screen. No page title "Explore" header beyond the tab — the hero is the header.

**Label comparison for the top section:**

| Label | Verdict |
|---|---|
| **Start Here** | **Recommended.** Directive, kills choice paralysis, and honest — at launch *every* user is new, so "start" is true for everyone. Cost: reads onboarding-ish for returning users; acceptable because the hero rotates editorially and the label can graduate to "Featured" once the catalogue and analytics justify it. |
| Featured | Fine but inert; implies a big catalogue behind it ("featured out of what?"). Best label for *later*. |
| Recommended For You | **Avoid at launch.** No personalisation exists; "for you" showing identical content to everyone is a small lie users can feel, and it spends trust the brand needs. Earn it later with install/goal signals. |
| Popular | Dishonest on day one (no data) — no. |
| Editor's Picks | Implies an editorial staff and a large catalogue; also introduces a new persona ("editor") into a product whose voice is personal. |

### B3. What moves out of the old Packs tab

| Today in Packs tab | Goes to |
|---|---|
| Library Packs browse | **Explore** (cover cards) |
| Interruption Packs folders + card editing | **Settings → Protected Apps** (per-app screen; rename away from "pack" — "Interruption messages") |
| Active Actions CRUD | **Library → Do Instead Cards** (management belongs with "mine"; HQ-made do-instead content can join Explore later as a content type) |

### B4. User-facing vocabulary cleanup

Users see exactly one meaning of "pack": an installable collection in Explore. Interruption folders are never called packs in UI again ("interruption messages for this app"). "Activate/Deactivate" becomes **Install / Remove** — install matches the product-like cover framing and the existing copy-on-activate semantics.

---

### B6. Goal taxonomy (final)

Owner shortlist was Confidence · Focus · Health · Growth · Relationships · Creativity · Business · Calm — eight goals for ~10 packs is category explosion (1.25 packs per section). Final recommendation, **six goals**:

| Goal | Launch packs that live there | Notes |
|---|---|---|
| **Confidence** | Courage, Delusional Confidence, Sing Anyway | The strongest section — lead with it |
| **Focus** | Focus, Better Than Scrolling | Most on-mission for an interception product |
| **Calm** | Calm, (Monastery Mind, Tiny Awe if kept — see I) | |
| **Create** | Build Your Thing, Creativity | **Merge of Business + Creativity + Growth.** Both serve "I want to make something"; "Create" is a verb, which fits the product voice better than a sector label |
| **Health** | Exercise (+1 needed) | Thin at launch — see ≥2 rule |
| **Relationships** | Relationships (+1 needed) | Thin at launch — see ≥2 rule |

- **Remove "Growth"** — it's a catch-all every pack qualifies for, which makes it a dumping ground and dilutes every other goal.
- **Remove "Business" as a label** (packs survive, under Create). Sector labels read like LinkedIn; verbs read like MyBishBash.
- Health and Relationships only render once they hold 2 packs (B2 rule); until then their singletons can sit under Calm/Confidence respectively, or simply hold the section back a week — content should drive when a section appears.
- Schema stays free-text `goal` + HQ-curated list, so future additions (e.g. Faith, if the existing scripture content stays — see I) need no migration.

## C. Final Library architecture

```
LIBRARY
├── Personal Cards       (user-written cards — "Call Mum", "Take your vitamins")
├── Commitment Cards     (user commitments with check-in behaviour)
├── Active Packs         (installed-and-enabled HQ packs)
└── Do Instead Cards     (alternative actions offered at intercept time)
```

### C1. Active Packs (owner-confirmed name — keep it)

"Active Packs" beats my earlier "Installed" suggestion on reflection: packs support a paused state, so *active* describes the thing users actually care about ("which packs are feeding my cards right now?") better than the act of acquiring them. This section answers: *Why am I seeing these cards? Which packs are active? How do I remove them?* Rows show cover thumbnail, title, "24 cards · Active" (or "Paused"), with an overflow menu: Pause/Resume, Remove, View in Explore. The per-card hide/restore grid moves behind the pack cover's "Manage cards" affordance (visible only once installed) — Library rows stay receipts, not workspaces.

### C2. Do Instead Cards — terminology and type review

**Keep the name. Keep it as a distinct content type.**

- *Terminology:* "Do Instead" is the rare label that explains itself at the exact moment it appears — on an intercept screen, next to a real alternative. Alternatives considered: "Actions" (current internal name — too vague, could mean anything), "Alternatives" (clinical, abstract), "Swaps" (cute but unclear). "Do Instead Cards" passes the say-it-to-a-friend test: "instead of opening Instagram, here's something to do instead."
- *Distinct type:* yes. They differ from Personal Cards in **surface** (offered at intercept as alternatives, not surfaced in the daily rotation), **schema** (they carry an optional `launchUrl` — "Read the FT" opens ft.com), and **intent** (suggestions, not reminders or promises). Folding them into Personal Cards would re-blur exactly the distinction Library exists to make.
- *Ownership nuance to accept:* today's three starter cards are HQ-seeded (`DEFAULT_ACTION_CARDS`, `storage.js:99`) but live in user storage and are hideable/editable. That's fine — treat starters as "yours from the moment you got the app". If HQ later wants to *publish* do-instead content, it arrives via Explore as a content type (`content_type='do_instead'`), same machinery as commitment templates — not by mutating users' libraries.
- *Code note:* internal `actionCards` naming can stay at launch (rename is churn across `App.jsx`/`storage.js`/sync with no user benefit); only user-facing strings and test ids change.

### C3. Saved / Favourites / History at launch: defer all three

- *History* already exists as the Log tab — don't duplicate it inside Library.
- *Saved/Favourites* only earn their place once the catalogue is big enough that users lose things. When added, prefer **one** concept ("Saved" — a bookmark on a pack cover) rather than both. Empty shelves at launch make Library feel like a filing cabinet, which is the failure mode this redesign exists to escape.

---

## D. Navigation recommendations

Keep five tabs, one rename, no new tabs:

**Home · Explore · Library · Log · Settings**

- `/packs` → `/explore` with a permanent redirect (old route kept parsing, `App.jsx:525`); test ids `bottom-nav-packs` → `bottom-nav-explore`.
- **Protected Apps stays inside Settings** at launch (it's already the launcher list there), but gets a named header "Protected Apps" and per-app detail screens that absorb interruption-message editing. Promote it to a tab only if usage shows users live there.
- Home remains the daily surface; Explore is where you go on purpose; Library is where your stuff lives; Log is what happened.

**Assignment flow recommendation (the Explore/Library/app-settings question):**

- **Launch: assignment happens nowhere, by design.** Install = global. "Install" on a cover means "this is mine and MyBishBash will weave it into my day". One concept, zero configuration, matches current behaviour exactly.
- **Per-app behaviour stays in app settings** (Protected Apps), because it is app configuration: interruption on/off, interruption messages, pauses.
- **Phase 2 (post-launch), if wanted:** add "Use with…" on the *installed* pack detail (Library side), writing a per-app allowlist. Rationale for Library-not-Explore: at install time the user hasn't formed a view yet; assignment is a management decision about something you own. Putting app-pickers on Explore covers would re-import "pack architecture" into the discovery surface.

---

## E. Pack cover-card recommendations

**Yes — make the cover the standard pack detail experience**, replacing `PackDetailModal`'s browse-everything grid.

### E1. Cover anatomy (detail screen)

```
[cover image]
Courage                              [PREMIUM badge if relevant]
For the days when you're waiting for permission.
24 cards · by MyBishBash

Why this exists
Because hesitation is costing you more than failure.

A taste:
  ❝ Someone less qualified is already doing it. ❞
  ❝ The embarrassment lasts a day. Regret lasts years. ❞
  ❝ Nobody is coming to give you permission. ❞

[ Install ]        (Active ✓ · Remove   when owned)
```

**Conversion-order review (owner's proposed order: image → title → description → why → preview → install): confirmed, with three execution notes.**

1. **The Install button is sticky.** The narrative order is right — image hooks, description orients, why-line lands the emotional point, preview proves it — but the CTA must not live only below the preview. Pin Install in a footer bar so it's visible from first paint; the page scroll is the persuasion, the button is always one thumb away. (Locked premium pins "Premium — coming soon" in the same slot; see G1.)
2. **Preview cards render as real cards** — the pack's theme, the actual card UI in miniature — not as quoted text lines. This is the single highest-leverage conversion element on the page: it shows the user precisely what will appear in their day.
3. **Metadata stays quiet.** "24 cards · by MyBishBash" is one caption line under the title; the premium badge sits on the image. Nothing numeric interrupts the description → why → preview flow.

**"Why this exists" — yes, make it standard.** One HQ-written sentence between description and preview (`why_text` column, nullable in schema, but editorially expected for every pack — the section header is simply omitted when empty, so it can roll out incrementally). It's the cheapest possible way to make a pack feel authored rather than generated: the description says what the pack *is*, the why-line says what it's *for in your life*. One sentence, no markdown, enforced short in the HQ form (~120 chars) so it never becomes a second description.

- **Preview = HQ-curated, max 3 cards** via an `is_preview` flag on `global_pack_cards`, falling back to the first 3 by `position`. Curation matters: the preview is the sales pitch and HQ already controls card order in the HQ panel.
- **Never list all cards pre-install.** Post-install, the same screen gains "View all cards" → the manage grid (current hide/restore behaviour, relocated).
- Grid card (Explore list) = compressed cover: image, title, one-liner, count, premium badge (goal is implied by the section it sits under).
- **Card count**: denormalise or compute client-side from fetched cards (already fetched in `fetchGlobalPacks`) — no extra query needed.
- **Author/source**: a `source_label` text column, default "MyBishBash". Keeps the door open for licensed/guest content without any creator model.

### E2. HQ panel additions

Pack form gains: cover image upload (reuse the icon-upload path from `202606110002`), goal select, why-this-exists line, featured toggle, premium toggle, preview-card pickers, source label. All HQ-owned, matching the decisions already made.

---

## F. Commitment architecture

### F1. Two kinds, two homes

| | Explore Commitments | Personal Commitments |
|---|---|---|
| Created by | HQ (templates) | User |
| Lives in | **Explore → Commitments rail** | **Library → Commitment Cards** |
| On tap | Template cover → "Take this commitment" | Edit/check-in as today |

### F2. Templates: model as content, not a new system

Recommend **`content_type` column on `global_packs`** (`'cards' | 'commitments'`) rather than new tables. A commitment-template pack's cards are template texts (optionally with default check-in settings in a jsonb column). Reuses publishing, RLS, HQ CRUD, fetch path, featured/premium/category — everything.

**"Take this commitment" ≠ install.** It opens the existing commitment composer **prefilled** from the template and saves a normal personal commitment (no `sourcePackId` retention needed beyond an analytics `template_id` in metadata). The user owns the result outright — which matches the brief's ownership split and avoids "installed commitment packs" as a concept. Single templates can also be surfaced individually in the rail (a pack of N templates renders as N rail cards, or as a themed template collection cover — start with individual rail cards; it's simpler and matches the "No Instagram after 21:00 tonight" examples).

### F3. Fix the type heuristic while touching this

Add explicit `cardType: 'standard' | 'commitment'` on cards at write time; keep `isCommitmentLikeCard` as a read-time fallback for old data. Prevents the heuristic (`utils.js:427`) from misfiling future content types.

---

## G. Free vs premium vs tester behaviour

Build directly on `feat/access-architecture` (capability lens — feature code never checks tier):

- New capability **`CAN_USE_PREMIUM_CONTENT`**, premium-only from birth (peer of the existing born-gated `can_publish_packs`).
- `global_packs.is_premium boolean` (+ optional `is_experimental` for testers).

### G1. Pre-Stripe premium: the simplest honest version

No payment flow, no pricing screen, no upgrade funnel. Premium at launch is **visible, locked, and interest-capturing**:

| Surface | Free user | Premium user (HQ-granted) | Tester |
|---|---|---|---|
| Explore | Premium packs **visible** with `Premium` badge | Badge shown, install works | + experimental packs (`is_tester`) |
| Pack cover | Full cover, why-line, and preview cards visible; CTA = **"Premium — coming soon"** | Install | Install |
| CTA tap | One tap → logs a `premium_interest` event → button flips to **"We'll let you know ✓"** (persisted locally) | — | — |

- **Recommended CTA wording: "Premium — coming soon" → "We'll let you know ✓".** Of the three candidates: *Available Soon* captures no signal; *Request Premium Access* implies someone reviews requests (support burden, implied promise); *Join Early Access* collides with the existing early-access/waitlist vocabulary used for app access itself. "Coming soon + notify me" is honest, zero-backend (reuses the existing event log — interest is then countable per pack in HQ analytics), and creates no obligation.
- **Premium users exist before Stripe does:** HQ can already grant `access_tier='premium'` via the step-1 access forms, so friends/press/testers-with-grants get the real experience and the gate gets exercised before money touches it.
- **Preview cards are always the free taste** — never lock the preview; lock the install. This is the whole point of the cover model.
- **Gate fail-closed.** Unlike the deliberate fail-open session gate (`hasAccessEntitlement`), the premium *install* check defaults to locked when profile data is unavailable; worst case is a retry, not a giveaway.
- Client-side gating only is acceptable at launch (cards are motivational text, not secrets); add a server-side check when payments make it matter.
- **Testers** are orthogonal: `is_tester` doesn't grant premium; it reveals `is_experimental` packs and existing tester tooling.

---

## H. Simplified implementation plan + effort

**Phase 0 — sequencing (no code).** Merge `feat/access-architecture`; branch Explore work from it (agreed rollout order: access → Explore → onboarding → HQ console → Stripe → launch).

| Phase | Scope | Effort* |
|---|---|---|
| **1. Schema + HQ form** | One migration — `global_packs`: `goal text`, `cover_image_url`, `why_text`, `is_premium`, `is_featured`, `is_experimental`, `content_type default 'cards'`, `source_label default 'MyBishBash'`, `published_at`, `sort_order`. `global_pack_cards`: `is_preview`, `commitment_defaults jsonb`. Backfill `published_at`. Extend `mapGlobalPack` + HQ pack form (image upload reuses the `202606110002` icon path; preview pickers; goal select; toggles). | 1.5–2 days |
| **2. Nav + Explore shell + moves** | Tab Packs→Explore, `/explore` route (redirect `/packs`), ExplorePanel = Featured + Commitments rail (empty until Phase 4) + goal sections from `visibleLibraryPacks`. Interruption section → Settings/Protected Apps. Action cards → Library "Do Instead Cards". e2e test-id updates. Pure reshuffle, no data changes. | 2–3 days |
| **3. Cover detail + Library polish** | Cover screen (image, why-line, preview, Install/Remove) replaces `PackDetailModal` for library packs (modal stays for interruption editing inside Settings). Activate/Deactivate → Install/Remove copy (`pack_activated` event names unchanged for analytics continuity). Active Packs rows get thumbnails + Pause/Remove/View-in-Explore menu; per-card hide grid moves behind cover's "Manage cards". | 2–3 days |
| **4. Commitment templates** | Explicit `cardType` on new cards (heuristic kept as read fallback); `content_type='commitments'` authoring in HQ; Explore rail; "Take this commitment" → prefilled composer + `template_id` analytics metadata. | 1.5–2 days |
| **5. Premium (pre-Stripe)** | `CAN_USE_PREMIUM_CONTENT` capability, badges, "Premium — coming soon" CTA + `premium_interest` event, `is_experimental` visibility for testers. Fail-closed install check. | 0.5–1 day |
| **6. Content cutover** | Verify static `PACKS` all exist in `global_packs` (seed `202605130004` + `sourceKey` dedupe already cover this); HQ assigns goals/covers/why-lines/featured; static array demoted to offline-fallback-only. | 0.5 day code + editorial |

*\*Single developer with AI pairing, building on existing patterns in this repo. Total: **8–11.5 dev-days**, realistically **2–3 calendar weeks** including iOS/Android shell QA and e2e updates. Phases are independently shippable in order; 2 and 3 are the only ones users notice structurally.*

**User-data impact: none destructive.** Active packs are copied cards keyed by `sourcePackId` — untouched by every phase. `hiddenLibraryPacks`, hidden-card keys, and behaviour settings keep their semantics; only surfaces and labels move. Deliberate non-goal: existing installs don't track upstream HQ edits (copy-on-install). Acceptable for launch; revisit only if HQ needs to push content fixes into active packs.

## I. Launch content recommendation

**Content is now the critical path — the architecture above is settled, but "alive" is a property of the cards, not the screens.** Quality bar for every card: it must work at lock-screen size, in the half-second before someone opens Instagram, and sound like a person. Target **12–18 excellent cards per pack** (the "24 cards" in mocks is aspiration, not a minimum); ~8 packs × ~15 cards ≈ 120 great lines is the real launch workload.

### I1. Verdict on the proposed ten

| Pack | Verdict | Reasoning |
|---|---|---|
| **Courage** | **Must-have** | The archetype; already has the voice nailed in its examples |
| **Delusional Confidence** | **Must-have** | Strongest title in the list — distinctive, shareable, instantly communicates the brand isn't earnest-wellness. Differentiates from Courage by tone (audacity vs steadiness); keep both |
| **Better Than Scrolling** | **Must-have — and the Start Here hero** | The most on-mission pack that exists: it names the exact moment the product intercepts. Natural synergy with Do Instead cards |
| **Sing Anyway** | **Must-have** | Niche and personal is the point — one specific, clearly-authored pack proves all packs are authored, in a way ten generic ones can't |
| **Build Your Thing** | **Launch** | Good title, clear audience (makers/founders); anchors Create |
| **Focus** | Launch *if the angle lands* | Title is generic — the danger zone. Needs a point of view (anti-productivity-platitude) or a sharper name ("One Thing", "Single Tab") |
| **Calm** | Launch *if the voice is distinct* | Most crowded genre on earth (Headspace et al.). Without a distinct register it's the definition of an average pack. Existing Monastery Mind / Tiny Awe content (see I2) may *be* the distinct register |
| **Exercise** | **Wait or rename** | "Exercise" is a category, not a product; invites generic gym quotes. Needs an angle ("Move First"?) before it earns a cover |
| **Creativity** | **Wait or rename** | Same disease as Exercise; also competes with Build Your Thing inside Create. One strong Create pack beats two weak ones |
| **Relationships** | **Wait or narrow** | Too broad to write well. Narrowed to the behaviour — "Reach Out" (message someone, call your mum) — it gets sharp *and* pairs perfectly with Do Instead cards |

**Recommended launch set: 7 packs** — Courage, Delusional Confidence, Better Than Scrolling, Sing Anyway, Build Your Thing, Focus, Calm — with Exercise/Creativity/Relationships held for a content drop 2–4 weeks post-launch (which also gives Explore visible novelty and lets Health/Relationships sections switch on as an event).

### I2. The catalogue nobody mentioned: 13 existing static packs

`utils.js` already ships 7 packs **with content** (Bible Verse, Motivational Quote, Extraordinary Lives, Letters From Another Era, Monastery Mind, Tiny Awe, Soft Convictions) and 6 coming-soon shells (Missionary Stories, Human Courage, Last Words & Final Reflections, The Weight of Time, Before Smartphones, Motherhood Through Time). Existing users have some of these **active**. They must be reconciled before launch:

- **Retire from Explore: "Motivational Quote"** — it is the exact average-pack this strategy exists to avoid (Delusional Confidence is its replacement). Retirement = unpublish from Explore; existing users' copied cards keep working untouched (copy-on-install pays off here).
- **Strong keeps, possibly renamed/foldered:** Monastery Mind, Tiny Awe, Soft Convictions, Letters From Another Era, Extraordinary Lives — these are sourced, distinctive, and exactly the "authored" texture Explore wants. Candidates for Calm and a future goal.
- **Faith decision needed:** Bible Verse (+ Missionary Stories shell) serves a real audience but implies a **Faith goal** on the public surface. Launch it as a goal, keep it discoverable-but-unfeatured, or hold it — owner call, flagged as open question.
- **Coming-soon shells must not appear in Explore.** A "coming soon" cover in a 7-pack catalogue reads as emptiness. Unpublished until written.
- Naming note: several existing titles are stronger than their replacements' working titles — e.g. "Human Courage" (shell) vs "Courage" — worth a pass to merge rather than duplicate themes.

## J. Smallest implementation plan to staging

Three PRs; content work runs in parallel from day one.

**PR 1 — schema + HQ authoring (≈1.5 days).** The Phase-1 migration (goal, cover_image_url, why_text, is_premium, is_featured, is_experimental, content_type, source_label, published_at, sort_order; `is_preview` + `commitment_defaults` on cards) + `mapGlobalPack` + HQ pack-form fields with image upload. *Unblocks all content/editorial work immediately.*

**PR 2 — Explore (≈3 days).** New file `src/ExplorePanel.jsx` (do **not** grow the 10k-line `App.jsx` — follow the `LogPanel.jsx` extraction precedent): hero + goal sections + cover grid cards; pack cover detail with sticky Install/Remove; tab rename + `/explore` route + `/packs` redirect; interruption section moves to Settings; action cards section moves to Library as "Do Instead Cards". e2e: update pack-touching specs (`release-smoke`, `commitment-cards`, staging spec) for new test ids. **Staging-ready after PR 2 with whatever packs HQ has authored.**

**PR 3 — commitments rail + premium (≈1.5 days).** Templates rail + "Take this commitment" prefill; premium badge, sticky "Premium — coming soon" CTA + `premium_interest` event, `is_experimental` for testers. Ships dark (no premium/template content published) without blocking staging.

≈6 dev-days of code to staging. The long pole is editorial: ~7 packs × ~15 cards + covers + why-lines, which PR 1 unblocks on day one.

## K. Generated covers (decided after PR2)

**Default workflow: Create Pack → Publish.** Custom cover upload becomes an optional enhancement; every pack without `cover_image_url` renders a production-quality generated cover from its own metadata. Decision drivers: no designer dependency, supports 50+ packs, zero pipeline.

### K1. Architecture: a React component, not an image pipeline

Covers are **rendered live as a component** (`GeneratedPackCover`), not generated/cached as image files. Rationale: the inputs needed for the artwork (title, pack id, and optional card count) are already in the pack object ExplorePanel holds; rendering is instant, always in sync with HQ edits, retina-perfect, themable, and needs no storage, no server, no staleness handling. Image *files* only become necessary when covers must leave the app (social share cards, install pages, push) — at that point, render the same component to PNG once (satori/html-to-image) and cache to the existing `pack-covers` bucket. Not now.

Resolution order (everywhere a cover appears — grid, hero, detail, Library thumbnails, HQ):
`coverImageUrl` present → `<img>` · otherwise → `<GeneratedPackCover>`. No flags, no third state.

### K2. Visual specification

- **Canvas:** 3:2, same frame/radius/shadow as uploaded covers.
- **Composition:** typography-first deck covers, using only pack title, pack id, and optional card count. The title carries the communication; generated art supplies palette, texture, accent, and a subtle card/deck motif. Preview quotes stay outside the artwork. `why_text` stays on the detail page only — covers stay uncrowded.
- **Deterministic system:** pack id hashing chooses a premium palette, layout, texture, accent, gradient angle, and highlight position. Future HQ packs do not need correct goal/category/theme metadata to get a good cover.
- **System size:** 16 palettes, 8 layouts, 6 texture systems, 6 accent systems. That gives hundreds of combinations while preserving a recognisable MyBishBash design language.
- **Variant rule:** Explore grid art is title/deck-led, with the first preview quote or description below the cover. The detail page remains title-led because preview cards appear separately in "A taste" below. Library thumbnails use a compact title-led variant.

### K3. Code changes required (no schema, no sync changes)

1. `src/GeneratedPackCover.jsx` — the deterministic component, `variant: grid | detail | thumb | bare`.
2. `src/ExplorePanel.jsx` — `ExploreCoverArt` renders it when no `coverImageUrl`; grid-card copy adjusts per the variant rule.
3. `src/styles.css` — generated-cover typography, palette variables, texture systems, and accents.
4. `src/HQPanel.jsx` — PR1's red "No cover" warning becomes a neutral "Auto cover" badge (absence is no longer a defect), and the pack form shows the generated cover as its preview placeholder so HQ sees the default before deciding to upload.
5. Tests — guardrail + an explore.spec assertion that a coverless pack renders a generated cover.

PR1's schema needs **zero changes** (`cover_image_url` nullable already encodes "generated"). PR2's only adjustment is the fallback-div replacement and the grid copy rule.

### K4. Sequencing

**Implement immediately, before PR3** (~0.5–1 day, "PR2.5"). It unblocks publishing the full catalogue without artwork, and PR3's commitment-template rail reuses the same generated-card styling — building it first means the rail is born consistent.

### Remaining open questions for product owner

1. **Faith content** — does Bible Verse (and the Missionary Stories shell) launch as a visible Faith goal, stay unfeatured-but-searchable, or hold? (See I2.)
2. **Legacy pack merges** — fold existing shells/titles into the new list (e.g. "Human Courage" vs "Courage") before writing begins, to avoid duplicate themes.
3. **Cover image production** — who makes ~8 covers, at the agreed ~3:2 ratio? This is the likeliest schedule risk after card-writing.
4. **Featured scope** — hero = packs only at launch (recommended), or may a commitment template take the hero slot?
5. **Active Pack pausing** — ship Pause/Resume at launch, or Remove only? (Cheap either way.)
6. **Starter Do Instead cards** — keep the current three seeds or refresh during cutover?
