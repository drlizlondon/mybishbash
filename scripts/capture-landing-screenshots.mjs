// Capture fresh, real app screenshots for the landing "See it in action" section.
// Requires a running `vite preview` server (default http://127.0.0.1:4173).
// Writes into public/screenshots/: hero-home.png (Nudge), feature-pause.png
// (pause-before-app interruption), feature-commit.png (Commitment card).
//
// Card prompts follow the Personal Cards rules: specific, low-burden, instantly
// answerable; "today" is fine for the marketing demo.
import { webkit } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Target display width is ~280px, so 600px keeps it crisp at 2x while staying
// light. Downscale with sips (macOS) when available; otherwise leave as-is.
const TARGET_WIDTH = 600;
function downscale(file) {
  try {
    execFileSync("sips", ["--resampleWidth", String(TARGET_WIDTH), file], { stdio: "ignore" });
  } catch {
    /* sips unavailable (non-macOS) — keep the full-resolution capture */
  }
}

const baseUrl = process.env.PREVIEW_URL || "http://127.0.0.1:4173/mybishbash/";
const outDir = path.resolve("public/screenshots");

const now = new Date();
const allWindows = ["morning", "day", "evening", "night"];
const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

const homeScreenVersions = {
  mybishbash: { id: "mybishbash", name: "myBishBash", installPath: "/mybishbash/install/mybishbash/", launchPath: "/home", iconSrc: "/mybishbash/icons/mybishbash-cover.png", realAppLabel: "", appUrl: "", manualUrl: "", interruptionPackId: "", useInterruptionPack: false, interruptionPaused: false },
  instagram: { id: "instagram", name: "Instagram", installPath: "/mybishbash/install/instagram/", launchPath: "/intercept/instagram", iconSrc: "/mybishbash/icons/instagram-cover.jpg", realAppLabel: "Instagram", appUrl: "instagram://app", manualUrl: "https://www.instagram.com", interruptionPackId: "", useInterruptionPack: true, interruptionPaused: false },
};

const instagramPack = {
  id: "instagram-interruption", type: "interruption", targetApp: "instagram", active: true,
  name: "Instagram Interruptions", linkedVersionId: "instagram",
  cards: [
    { id: "ig-1", text: "Do you really want to go on Instagram right now?", title: "Do you really want to go on Instagram right now?" },
    { id: "ig-2", text: "Open your own life before opening everyone else's.", title: "Open your own life before opening everyone else's." },
  ],
};

const base = (card) => ({
  attribution: null, createdAt: now.toISOString(), lastShownAt: null, notYetUntil: null,
  doneDate: null, paused: false, timingWindows: allWindows, frequency: "once_daily", ...card,
});

// Nudge: the face-routine card is the only fresh personal card, so it's shown.
const nudgeCards = [
  base({ id: "face", promptText: "Have you done your face routine today?", theme: "Soft Bloom", icon: "flower", statusToday: "fresh" }),
  base({ id: "vitamins", promptText: "Have you taken your vitamins?", theme: "Minimal", icon: "leaf", statusToday: "doneToday", doneDate: todayKey }),
  base({ id: "plants", promptText: "Have you watered the plants?", theme: "Soft Bloom", icon: "water", statusToday: "doneToday", doneDate: todayKey }),
];

// Commitment: a full commitment card (all fields the composer writes) so it
// renders in the Library Commitment Cards section.
const commitmentCard = base({
  id: "commit-1",
  cardKind: "commitment",
  promptText: "go for a 20 minute walk after lunch",
  dashboardTitle: "Today's Commitment",
  commitmentReason: "Fresh air helps me reset.",
  commitmentTimingMode: "anytime",
  commitmentStartWindow: "anytime",
  commitmentCustomStartTime: "",
  commitmentCustomEndTime: "",
  commitmentCheckInEnabled: false,
  commitmentCheckInTime: "",
  commitmentCheckInPendingDate: null,
  commitmentLifecycleStatus: null,
  commitmentCheckInShownDate: null,
  commitmentCheckInResponse: null,
  commitmentCheckInResponseDate: null,
  commitmentCheckInResponseAt: null,
  commitmentEncouragementRequestedDate: null,
  commitmentEncouragementCompletedDate: null,
  commitmentClosedEarlyDate: null,
  commitmentReviewDueDate: null,
  commitmentReviewResponse: null,
  commitmentReviewResponseDate: null,
  commitmentReviewResponseAt: null,
  commitmentFinalOutcome: null,
  updatedAt: now.toISOString(),
  disliked: false,
  theme: "Starry Sky",
  icon: "moon",
  statusToday: "fresh",
});

function storageFor(cards, extra = {}) {
  return {
    "mybishbash.cards.v1": cards,
    "mybishbash.setup-complete.v1": "true",
    "mybishbash.mood.v1": "Soft Bloom",
    "mybishbash.profile.v1": { name: "Sam", timezone: "Europe/London" },
    "mybishbash.home-screen-versions.v1": homeScreenVersions,
    "mybishbash.home-screen-selected.v1": "mybishbash",
    "mybishbash.global-interruption-mode.v1": "true",
    MYBISHBASH_DEMO_MODE: "true",
    ...extra,
  };
}

async function newPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  return { context, page: await context.newPage() };
}

async function seed(page, storage, url) {
  await page.addInitScript((payload) => {
    window.localStorage.clear();
    for (const [k, v] of Object.entries(payload)) {
      window.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    }
  }, storage);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(1100);
}

async function movePastInterruption(page) {
  for (const label of ["Not yet", "Done", "Continue", "I really like this one", "Back home"]) {
    const button = page.locator(".overlay-screen .action-button", { hasText: label }).first();
    if (await button.isVisible().catch(() => false)) { await button.click(); await page.waitForTimeout(1100); return; }
  }
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await webkit.launch({ headless: true });
  try {
    // Nudge
    {
      const { context, page } = await newPage(browser);
      await seed(page, storageFor(nudgeCards, { "mybishbash.home-screen-selected.v1": "mybishbash" }), `${baseUrl}home`);
      await movePastInterruption(page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, "hero-home.png") });
      await context.close();
    }
    // Pause-before-app (interruption) — the intercept route renders the pause card.
    {
      const { context, page } = await newPage(browser);
      await seed(page, storageFor(nudgeCards, {
        "mybishbash.home-screen-selected.v1": "instagram",
        "mybishbash.card-packs.v1": [instagramPack],
      }), `${baseUrl}intercept/instagram`);
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(outDir, "feature-pause.png") });
      await context.close();
    }
    // Commitment — rendered in the Library Commitment Cards section.
    {
      const { context, page } = await newPage(browser);
      await seed(page, storageFor([commitmentCard], { "mybishbash.home-screen-selected.v1": "mybishbash" }), `${baseUrl}library`);
      await movePastInterruption(page);
      // Expand the Commitment Cards section, then open the card's reveal for a
      // focused single-card shot matching the Nudge/Pause framing.
      const commitSection = page.getByText("Commitment Cards", { exact: false }).first();
      if (await commitSection.isVisible().catch(() => false)) {
        await commitSection.click();
        await page.waitForTimeout(600);
      }
      const commitCard = page.getByText("20 minute walk", { exact: false }).first();
      if (await commitCard.isVisible().catch(() => false)) {
        await commitCard.click();
        await page.waitForTimeout(900);
      }
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, "feature-commit.png") });
      await context.close();
    }
    for (const name of ["hero-home.png", "feature-pause.png", "feature-commit.png"]) {
      downscale(path.join(outDir, name));
    }
    process.stdout.write(`captured + downscaled to ${TARGET_WIDTH}px: hero-home.png, feature-pause.png, feature-commit.png\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
