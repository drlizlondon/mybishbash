import { webkit } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:4173/mybishbash/";
const shotsDir = "/Users/lizzie/mybishbash/screenshots";

function getTodayKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

const now = new Date();
const inNinetyMinutes = new Date(now.getTime() + 90 * 60 * 1000).toISOString();
const todayKey = getTodayKey(now, "Europe/London");
const allWindows = ["morning", "day", "evening", "night"];

const homeScreenVersions = {
  mybishbash: {
    id: "mybishbash",
    name: "MyBishBash",
    installPath: "/mybishbash/install/mybishbash/",
    launchPath: "/home",
    iconSrc: "/mybishbash/icons/mybishbash-cover.png",
    realAppLabel: "",
    appUrl: "",
    manualUrl: "",
    interruptionPackId: "",
    useInterruptionPack: false,
    interruptionPaused: false,
  },
  safari: {
    id: "safari",
    name: "Safari",
    installPath: "/mybishbash/install/safari/",
    launchPath: "/intercept/safari",
    iconSrc: "/mybishbash/icons/apple-touch-icon.png",
    realAppLabel: "Safari",
    appUrl: "",
    manualUrl: "x-safari-https://www.google.com",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    installPath: "/mybishbash/install/youtube/",
    launchPath: "/intercept/youtube",
    iconSrc: "/mybishbash/icons/youtube-cover.png",
    realAppLabel: "YouTube",
    appUrl: "youtube://",
    manualUrl: "https://www.youtube.com",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    installPath: "/mybishbash/install/instagram/",
    launchPath: "/intercept/instagram",
    iconSrc: "/mybishbash/icons/instagram-cover.jpg",
    realAppLabel: "Instagram",
    appUrl: "instagram://app",
    manualUrl: "https://www.instagram.com",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
  },
};

const cardPacks = [
  {
    id: "safari-interruption",
    type: "interruption",
    targetApp: "safari",
    active: true,
    name: "Safari Interruptions",
    linkedVersionId: "safari",
    cards: [
      { id: "safari-1", text: "Do you want the internet, or a little pause first?", title: "Do you want the internet, or a little pause first?" },
      { id: "safari-2", text: "What were you hoping to find online just now?", title: "What were you hoping to find online just now?" },
    ],
  },
  {
    id: "instagram-interruption",
    type: "interruption",
    targetApp: "instagram",
    active: true,
    name: "Instagram Interruptions",
    linkedVersionId: "instagram",
    cards: [
      { id: "instagram-1", text: "Do you really want to go on Instagram right now?", title: "Do you really want to go on Instagram right now?" },
      { id: "instagram-2", text: "Open your own life before opening everyone else's.", title: "Open your own life before opening everyone else's." },
      { id: "instagram-3", text: "What were you hoping Instagram would fix?", title: "What were you hoping Instagram would fix?" },
    ],
  },
  {
    id: "youtube-interruption",
    type: "interruption",
    targetApp: "youtube",
    active: true,
    name: "YouTube Interruptions",
    linkedVersionId: "youtube",
    cards: [
      { id: "youtube-1", text: "Were you looking for one thing, or somewhere to disappear?", title: "Were you looking for one thing, or somewhere to disappear?" },
      { id: "youtube-2", text: "Would rest feel better than another video?", title: "Would rest feel better than another video?" },
      { id: "youtube-3", text: "Could ten quiet minutes be kinder than autoplay?", title: "Could ten quiet minutes be kinder than autoplay?" },
    ],
  },
];

const demoCards = [
  {
    id: "water-card",
    promptText: "have you drunk enough water today?",
    theme: "Soft Bloom",
    icon: "water",
    statusToday: "fresh",
    createdAt: now.toISOString(),
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    paused: false,
    frequency: "multi_daily",
    timingWindows: ["morning", "day", "evening"],
  },
  {
    id: "bible-card",
    promptText: "have you read your bible today?",
    theme: "Minimal",
    icon: "book",
    statusToday: "fresh",
    createdAt: now.toISOString(),
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    paused: false,
    frequency: "once_daily",
    timingWindows: ["morning"],
  },
  {
    id: "veg-card",
    promptText: "have you had vegetables yet?",
    theme: "Soft Bloom",
    icon: "flower",
    statusToday: "fresh",
    createdAt: now.toISOString(),
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    paused: false,
    frequency: "once_daily",
    timingWindows: ["day"],
  },
  {
    id: "stretch-card",
    promptText: "can you do some stretches before bed?",
    theme: "Starry Sky",
    icon: "moon",
    statusToday: "fresh",
    createdAt: now.toISOString(),
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    paused: false,
    frequency: "once_daily",
    timingWindows: ["evening"],
  },
  {
    id: "teeth-card",
    promptText: "brush baby's teeth before bedtime.",
    theme: "Pop Art",
    icon: "heart",
    statusToday: "pending",
    createdAt: now.toISOString(),
    lastShownAt: null,
    notYetUntil: inNinetyMinutes,
    doneDate: null,
    paused: false,
    frequency: "once_daily",
    timingWindows: ["evening"],
  },
  {
    id: "prayer-card",
    promptText: "have you prayed today?",
    theme: "Minimal",
    icon: "leaf",
    statusToday: "doneToday",
    createdAt: now.toISOString(),
    lastShownAt: null,
    notYetUntil: null,
    doneDate: todayKey,
    paused: false,
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening"],
  },
  {
    id: "bible-pack-1",
    promptText: "Be still, and know that I am God.",
    attribution: "Psalm 46:10",
    dashboardTitle: "Bible Verse",
    theme: "Soft Bloom",
    icon: "book",
    statusToday: "fresh",
    createdAt: now.toISOString(),
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    paused: false,
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening"],
    sourcePackId: "encouraging-bible-verses",
  },
  {
    id: "bible-pack-2",
    promptText: "Cast all your anxiety on him because he cares for you.",
    attribution: "1 Peter 5:7",
    dashboardTitle: "Bible Verse",
    theme: "Soft Bloom",
    icon: "book",
    statusToday: "fresh",
    createdAt: now.toISOString(),
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    paused: false,
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening"],
    sourcePackId: "encouraging-bible-verses",
  },
  {
    id: "quote-pack-1",
    promptText: "Action is a great restorer and builder of confidence.",
    attribution: "Norman Vincent Peale",
    dashboardTitle: "Motivational Quote",
    theme: "Pop Art",
    icon: "quote",
    statusToday: "fresh",
    createdAt: now.toISOString(),
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    paused: false,
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening"],
    sourcePackId: "motivational-quotes",
  },
  {
    id: "quote-pack-2",
    promptText: "Start where you are. Use what you have. Do what you can.",
    attribution: "Arthur Ashe",
    dashboardTitle: "Motivational Quote",
    theme: "Pop Art",
    icon: "quote",
    statusToday: "fresh",
    createdAt: now.toISOString(),
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    paused: false,
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening"],
    sourcePackId: "motivational-quotes",
  },
];

const storageForReadyApp = {
  "mybishbash.cards.v1": demoCards.map((card) => ({ ...card, timingWindows: allWindows })),
  "mybishbash.setup-complete.v1": "true",
  "mybishbash.mood.v1": "Soft Bloom",
  "mybishbash.profile.v1": { name: "Liz", timezone: "Europe/London" },
  "mybishbash.home-screen-versions.v1": homeScreenVersions,
  "mybishbash.home-screen-selected.v1": "safari",
  "mybishbash.card-packs.v1": cardPacks,
  "mybishbash.global-interruption-mode.v1": "true",
  "MYBISHBASH_DEMO_MODE": "true",
};

const storageForOnboarding = {
  "mybishbash.cards.v1": [],
  "mybishbash.setup-complete.v1": "false",
  "mybishbash.mood.v1": "Soft Bloom",
  "mybishbash.profile.v1": { name: "", timezone: "Europe/London" },
  "mybishbash.home-screen-versions.v1": homeScreenVersions,
  "mybishbash.home-screen-selected.v1": "safari",
  "mybishbash.card-packs.v1": cardPacks,
  "mybishbash.global-interruption-mode.v1": "true",
  "MYBISHBASH_DEMO_MODE": "true",
};

const storageForEmpty = {
  ...storageForReadyApp,
  "mybishbash.cards.v1": demoCards.map((card) => ({
    ...card,
    timingWindows: allWindows,
    paused: !card.sourcePackId,
    notYetUntil: card.sourcePackId ? null : now.toISOString(),
    doneDate: card.sourcePackId ? todayKey : card.doneDate,
    statusToday: card.sourcePackId ? "doneToday" : card.statusToday,
  })),
};

async function clearScreenshots() {
  await fs.mkdir(shotsDir, { recursive: true });
  const existing = await fs.readdir(shotsDir);
  await Promise.all(
    existing.map((name) =>
      fs.rm(path.join(shotsDir, name), { force: true, recursive: true }),
    ),
  );
}

async function createPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  return { context, page };
}

async function seed(page, storage, targetUrl = baseUrl) {
  await page.addInitScript((payload) => {
    window.localStorage.clear();
    for (const [key, value] of Object.entries(payload)) {
      const stringValue = typeof value === "string" ? value : JSON.stringify(value);
      window.localStorage.setItem(key, stringValue);
    }
  }, storage);
  await page.goto(targetUrl, { waitUntil: "load" });
  await page.waitForTimeout(900);
}

async function shot(page, name, { fullPage = false } = {}) {
  await page.screenshot({
    path: path.join(shotsDir, name),
    fullPage,
  });
}

async function movePastInterruption(page) {
  const labels = ["Not yet", "Done", "Continue", "I really like this one", "Back home"];
  for (const label of labels) {
    const button = page.locator(".overlay-screen .action-button", { hasText: label }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      await page.waitForTimeout(1100);
      return;
    }
  }

  const closeButton = page.locator(".overlay-screen .overlay-library-button").first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await page.waitForTimeout(700);
  }
}

async function openNav(page, label) {
  await movePastInterruption(page);
  await page.getByRole("button", { name: label }).click();
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await webkit.launch({ headless: true });

  try {
    await clearScreenshots();

    {
      const { context, page } = await createPage(browser);
      await seed(page, storageForOnboarding);
      await shot(page, "01-onboarding.png");
      await context.close();
    }

    {
      const { context, page } = await createPage(browser);
      await seed(page, storageForReadyApp);
      await movePastInterruption(page);
      await shot(page, "02-home.png");
      await context.close();
    }

    {
      const { context, page } = await createPage(browser);
      await seed(page, storageForReadyApp);
      await openNav(page, "Packs");
      await shot(page, "03-packs.png");
      await context.close();
    }

    {
      const { context, page } = await createPage(browser);
      await seed(page, storageForReadyApp);
      await openNav(page, "Log");
      await shot(page, "04-log.png");
      await context.close();
    }

    {
      const { context, page } = await createPage(browser);
      await seed(page, storageForReadyApp);
      await openNav(page, "Settings");
      await shot(page, "05-settings-top.png");
      await page.evaluate(() =>
        window.scrollTo({ top: document.body.scrollHeight * 0.55, behavior: "instant" }),
      );
      await page.waitForTimeout(400);
      await page.locator('select.settings-input').selectOption('instagram');
      await page.waitForTimeout(400);
      await shot(page, "06-settings-launchers.png");
      await context.close();
    }

    {
      const { context, page } = await createPage(browser);
      await seed(page, storageForReadyApp);
      await shot(page, "07-interruption-card.png");
      await context.close();
    }

    {
      const { context, page } = await createPage(browser);
      await seed(page, storageForEmpty);
      await shot(page, "08-all-caught-up.png");
      await context.close();
    }

    {
      const { context, page } = await createPage(browser);
      await seed(page, storageForReadyApp, `${baseUrl}?disguise=instagram`);
      await shot(page, "09-instagram-pack.png");
      await context.close();
    }

    {
      const { context, page } = await createPage(browser);
      await seed(page, storageForReadyApp, `${baseUrl}?disguise=youtube`);
      await shot(page, "10-youtube-pack.png");
      await context.close();
    }

    {
      const { context, page } = await createPage(browser);
      await page.goto("http://127.0.0.1:4173/mybishbash/install/safari/", {
        waitUntil: "load",
      });
      await page.waitForTimeout(500);
      await shot(page, "11-install-safari.png");
      await context.close();
    }

    {
      const { context, page } = await createPage(browser);
      await page.goto("http://127.0.0.1:4173/mybishbash/install/youtube/", {
        waitUntil: "load",
      });
      await page.waitForTimeout(500);
      await shot(page, "12-install-youtube.png");
      await context.close();
    }

    {
      const { context, page } = await createPage(browser);
      await page.goto("http://127.0.0.1:4173/mybishbash/install/instagram/", {
        waitUntil: "load",
      });
      await page.waitForTimeout(500);
      await shot(page, "13-install-instagram.png");
      await context.close();
    }

    {
      const { context, page } = await createPage(browser);
      await seed(page, storageForReadyApp, `${baseUrl}?disguise=instagram`);
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "I'll do something else" }).click();
      await page.waitForTimeout(500);
      await shot(page, "14-action-card.png");
      await context.close();
    }

    const files = (await fs.readdir(shotsDir)).sort();
    process.stdout.write(`${files.join("\n")}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
