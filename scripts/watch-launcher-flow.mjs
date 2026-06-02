import { chromium } from "playwright";

const BASE_URL = process.env.MYBISHBASH_WATCH_URL || "http://127.0.0.1:8080/mybishbash";
const STEP_DELAY_MS = Number(process.env.MYBISHBASH_WATCH_STEP_DELAY_MS || 1800);
const now = "2026-06-01T12:00:00.000Z";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function personalCard(id, title) {
  return {
    id,
    promptText: title,
    dashboardTitle: title,
    theme: "Minimal",
    icon: "heart",
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening"],
    paused: false,
    disliked: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    sourcePackId: null,
  };
}

function packCard(id, title) {
  return {
    ...personalCard(id, title),
    sourcePackId: "qa-active-pack",
    sourcePackTitle: "QA Active Pack",
    attribution: "QA Active Pack",
  };
}

function launcherSettings(interruptionOn) {
  return {
    mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: "" },
    safari: { useInterruptionPack: interruptionOn, interruptionPaused: false, interruptionPackId: "" },
    youtube: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: "" },
    instagram: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: "" },
  };
}

function getOptions() {
  const args = new Set(process.argv.slice(2));
  return {
    interruptionOn: args.has("--interruption-on"),
    usePack: args.has("--pack"),
  };
}

async function seedQaState(page, { interruptionOn, usePack }) {
  const cards = [
    usePack
      ? packCard("watch-pack-card", "WATCH QA pack card before continue")
      : personalCard("watch-personal-card", "WATCH QA personal card before continue"),
  ];

  await page.addInitScript(
    ({ seededCards, seededLauncherBehaviorSettings }) => {
      window.localStorage.setItem("MYBISHBASH_E2E_MODE", "true");
      window.localStorage.setItem("MYBISHBASH_E2E_TESTER_MODE", "true");
      window.localStorage.setItem("MYBISHBASH_DEMO_MODE", "true");
      window.localStorage.setItem("mybishbash.setup-complete.v1", "true");
      window.localStorage.setItem("mybishbash.profile.v1", JSON.stringify({ name: "Launcher Watch", timezone: "Europe/London" }));
      window.localStorage.setItem("mybishbash.cards.v1", JSON.stringify(seededCards));
      window.localStorage.setItem("mybishbash.event-log.v1", "[]");
      window.localStorage.setItem("mybishbash.offline-event-queue.v1", "[]");
      window.localStorage.setItem("mybishbash.disliked-pack-card-ids.v1", "[]");
      window.localStorage.setItem("mybishbash.action-cards.v1", "[]");
      window.localStorage.setItem("mybishbash.launcher-behavior-settings.v1", JSON.stringify(seededLauncherBehaviorSettings));
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS.push({ href, metadata });
        return true;
      };
    },
    {
      seededCards: cards,
      seededLauncherBehaviorSettings: launcherSettings(interruptionOn),
    },
  );
}

async function readStep(page) {
  return page.evaluate(() => {
    const selectors = [
      ["personal", '[data-testid="card-overlay-personal"]'],
      ["pack", '[data-testid="card-overlay-pack"]'],
      ["interruption", '[data-testid="card-overlay-interruption"]'],
      ["continue-to-app", '[data-testid="continue-to-app-card"]'],
      ["caught-up", '[data-testid="card-overlay-empty"]'],
    ];

    for (const [type, selector] of selectors) {
      const node = document.querySelector(selector);
      if (!node) continue;
      return {
        type,
        title: node.querySelector("h1,h2,h3")?.textContent?.trim() || null,
        greeting: node.querySelector(".premium-greeting")?.textContent?.trim() || null,
        subtitle: node.querySelector(".premium-subtitle")?.textContent?.trim() || null,
        actions: Array.from(node.querySelectorAll("button")).map((button) => button.textContent?.trim()).filter(Boolean),
      };
    }

    return { type: "none", title: null, greeting: null, subtitle: null, actions: [] };
  });
}

function printStep(index, step) {
  console.log(`${index}. ${step.type}: ${step.title ?? "(no title)"}`);
  if (step.greeting) console.log(`   greeting: ${step.greeting}`);
  if (step.subtitle) console.log(`   subtitle: ${step.subtitle}`);
  console.log(`   actions: ${step.actions.join(" | ") || "(none)"}`);
}

async function main() {
  const options = getOptions();
  const browser = await chromium.launch({ headless: false, slowMo: 250 });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await seedQaState(page, options);

  console.log(`[watch-launcher-flow] interruption ${options.interruptionOn ? "ON" : "OFF"} / ${options.usePack ? "pack" : "personal"} first`);

  await page.goto(`${BASE_URL}/safari/index.html`);
  await page.getByRole("link", { name: "Open Safari launcher" }).click();
  await page.waitForURL(/\/intercept\/safari$/);
  await page.waitForSelector(options.usePack ? '[data-testid="card-overlay-pack"]' : '[data-testid="card-overlay-personal"]');
  await sleep(STEP_DELAY_MS);

  const first = await readStep(page);
  printStep(1, first);

  if (options.usePack) {
    await page.getByTestId("card-overlay-pack").getByTestId("card-action-like").click();
  } else {
    await page.getByTestId("card-overlay-personal").getByTestId("card-action-done").click();
  }

  await page.waitForSelector(options.interruptionOn ? '[data-testid="card-overlay-interruption"]' : '[data-testid="continue-to-app-card"]');
  await sleep(STEP_DELAY_MS);

  const second = await readStep(page);
  printStep(2, second);

  await page.getByTestId("card-action-continue-to-safari").click();
  await sleep(STEP_DELAY_MS);

  const attempts = await page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS ?? []);
  console.log(`3. destination: ${attempts.at(-1)?.href ?? "(no destination captured)"}`);
  await sleep(STEP_DELAY_MS);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
