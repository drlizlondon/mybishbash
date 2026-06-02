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

function actionCard(id, title, launchUrl = "") {
  return {
    id,
    title,
    body: `${title} instead`,
    category: "Action",
    launchUrl,
    hidden: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
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
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const getValue = (name, fallback = "") => {
    const prefix = `${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const index = argv.indexOf(name);
    if (index >= 0 && argv[index + 1]) return argv[index + 1];
    return fallback;
  };

  return {
    interruptionOn: args.has("--interruption-on"),
    usePack: args.has("--pack"),
    shellRepeat: Math.max(1, Number(getValue("--shell-repeat", "1")) || 1),
    shellTerminal: getValue("--terminal", "dashboard"),
    shellLifecycle: args.has("--lifecycle"),
  };
}

async function seedQaState(page, { interruptionOn, usePack }) {
  const cards = usePack
    ? [
        packCard("watch-pack-card-1", "WATCH QA pack card one"),
        packCard("watch-pack-card-2", "WATCH QA pack card two"),
        packCard("watch-pack-card-3", "WATCH QA pack card three"),
      ]
    : [
        personalCard("watch-personal-card-1", "WATCH QA personal card one"),
        personalCard("watch-personal-card-2", "WATCH QA personal card two"),
        personalCard("watch-personal-card-3", "WATCH QA personal card three"),
      ];

  await page.addInitScript(
    ({ seededActionCards, seededCards, seededLauncherBehaviorSettings }) => {
      window.localStorage.setItem("MYBISHBASH_E2E_MODE", "true");
      window.localStorage.setItem("MYBISHBASH_E2E_TESTER_MODE", "true");
      window.localStorage.setItem("MYBISHBASH_DEMO_MODE", "true");
      window.localStorage.setItem("bishbash.launchAudit.enabled", "true");
      if (window.localStorage.getItem("mybishbash.watch-launcher-seeded.v2") !== "true") {
        window.localStorage.setItem("mybishbash.setup-complete.v1", "true");
        window.localStorage.setItem("mybishbash.profile.v1", JSON.stringify({ name: "Launcher Watch", timezone: "Europe/London" }));
        window.localStorage.setItem("mybishbash.cards.v1", JSON.stringify(seededCards));
        window.localStorage.setItem("mybishbash.event-log.v1", "[]");
        window.localStorage.setItem("mybishbash.offline-event-queue.v1", "[]");
        window.localStorage.setItem("mybishbash.disliked-pack-card-ids.v1", "[]");
        window.localStorage.setItem("mybishbash.action-cards.v1", JSON.stringify(seededActionCards));
        window.localStorage.setItem("mybishbash.launcher-behavior-settings.v1", JSON.stringify(seededLauncherBehaviorSettings));
        window.localStorage.setItem("mybishbash.watch-launcher-seeded.v2", "true");
      }
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS.push({ href, metadata });
        return true;
      };
    },
    {
      seededActionCards: [
        actionCard("watch-action-card-1", "WATCH action card one"),
        actionCard("watch-action-card-2", "WATCH action card two"),
        actionCard("watch-action-card-3", "WATCH action card three"),
      ],
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
      ["action", '[data-testid="card-overlay-action"]'],
      ["action-empty", '[data-testid="card-overlay-action-empty"]'],
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

async function readAudit(page) {
  return page.evaluate(() => window.__lastLauncherSelectionAudit ?? null);
}

function printAudit(audit) {
  if (!audit) {
    console.log("   audit: (no launcher audit captured)");
    return;
  }

  const summary = audit.summaryCounts ?? {};
  console.log(`   selected: ${audit.selected?.id ?? "(none)"} / ${audit.selected?.title ?? "(none)"}`);
  console.log(`   finalRenderedCard: ${audit.finalRenderedCard}`);
  console.log(
    `   counts: personal=${summary.eligiblePersonalCards ?? 0}, pack=${summary.eligiblePackCards ?? 0}, activePack=${summary.activePackCards ?? 0}, activatedPacks=${summary.activatedPacks ?? 0}, weighted=${summary.totalCardsEnteringWeightedSelection ?? 0}, excluded=${summary.totalCardsExcluded ?? 0}`,
  );
}

function printStep(index, step, audit = null) {
  console.log(`${index}. ${step.type}: ${step.title ?? "(no title)"}`);
  if (step.greeting) console.log(`   greeting: ${step.greeting}`);
  if (step.subtitle) console.log(`   subtitle: ${step.subtitle}`);
  console.log(`   actions: ${step.actions.join(" | ") || "(none)"}`);
  printAudit(audit);
}

async function waitForAnyLauncherStep(page) {
  await page.waitForFunction(() =>
    [
      '[data-testid="card-overlay-personal"]',
      '[data-testid="card-overlay-pack"]',
      '[data-testid="card-overlay-interruption"]',
      '[data-testid="card-overlay-action"]',
      '[data-testid="card-overlay-action-empty"]',
      '[data-testid="continue-to-app-card"]',
      '[data-testid="card-overlay-empty"]',
    ].some((selector) => document.querySelector(selector)),
  );
}

async function completeVisibleCard(page) {
  if (await page.getByTestId("card-overlay-pack").isVisible()) {
    await page.getByTestId("card-overlay-pack").getByTestId("card-action-continue").click();
    return "Continue";
  }

  if (await page.getByTestId("card-overlay-personal").isVisible()) {
    await page.getByTestId("card-overlay-personal").getByTestId("card-action-done").click();
    return "Done";
  }

  return null;
}

async function openDownloadedShell(page, round, { lifecycle }) {
  const shellUrl = `${BASE_URL}/intercept/safari`;
  console.log(`\n[downloaded-shell] round ${round}: open Safari shell -> ${shellUrl}`);
  if (lifecycle && page.url().endsWith("/intercept/safari")) {
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await sleep(1200);
    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  } else {
    await page.goto(shellUrl);
  }
  await waitForAnyLauncherStep(page);
  await sleep(STEP_DELAY_MS);
}

async function clickIfPresent(page, locator) {
  if ((await locator.count()) > 0) {
    await locator.click();
    return true;
  }
  return false;
}

async function openDashboardFromCurrentStep(page) {
  if (await clickIfPresent(page, page.getByLabel("Open dashboard"))) return;
  if (await clickIfPresent(page, page.getByTestId("card-action-back-to-mybishbash"))) return;
  if (await clickIfPresent(page, page.getByTestId("card-action-do-something-else"))) {
    await waitForAnyLauncherStep(page);
    await sleep(STEP_DELAY_MS);
    if (await clickIfPresent(page, page.getByLabel("Open dashboard"))) return;
    if (await clickIfPresent(page, page.getByTestId("card-action-back-to-mybishbash"))) return;
  }
  throw new Error("No route to the dashboard found from current launcher step.");
}

async function runDownloadedShellRepeats(page, options) {
  console.log(
    `[watch-launcher-flow] downloaded shell repeat x${options.shellRepeat} / interruption ${options.interruptionOn ? "ON" : "OFF"} / ${options.usePack ? "pack cards" : "personal cards"} / terminal=${options.shellTerminal}${options.shellLifecycle ? " / lifecycle" : ""}`,
  );

  for (let round = 1; round <= options.shellRepeat; round += 1) {
    await openDownloadedShell(page, round, { lifecycle: options.shellLifecycle });
    const first = await readStep(page);
    const firstAudit = await readAudit(page);
    printStep(`${round}.1`, first, firstAudit);

    const completion = await completeVisibleCard(page);
    if (completion) {
      console.log(`   action: ${completion}`);
      await waitForAnyLauncherStep(page);
      await sleep(STEP_DELAY_MS);
    }

    const second = await readStep(page);
    printStep(`${round}.2`, second, await readAudit(page));

    if (options.shellTerminal === "continue") {
      await page.getByTestId("card-action-continue-to-safari").click();
      await sleep(STEP_DELAY_MS);
      const attempts = await page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS ?? []);
      console.log(`   destination: ${attempts.at(-1)?.href ?? "(no destination captured)"}`);
      await page.goto(`${BASE_URL}/home`);
    } else if (options.shellTerminal === "action-dashboard") {
      await page.getByTestId("card-action-do-something-else").click();
      await waitForAnyLauncherStep(page);
      await sleep(STEP_DELAY_MS);
      const actionStep = await readStep(page);
      printStep(`${round}.3`, actionStep, await readAudit(page));
      await openDashboardFromCurrentStep(page);
    } else if (options.shellTerminal === "dashboard") {
      await openDashboardFromCurrentStep(page);
    } else {
      await openDashboardFromCurrentStep(page);
    }

    await page.waitForURL(/\/mybishbash\/home$/);
    console.log(`   terminal: dashboard (${page.url()})`);
    await sleep(2000);
  }
}

async function main() {
  const options = getOptions();
  const browser = await chromium.launch({ headless: false, slowMo: 250 });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await seedQaState(page, options);

  if (options.shellRepeat > 1 || options.shellLifecycle) {
    await runDownloadedShellRepeats(page, options);
    await sleep(STEP_DELAY_MS);
    await browser.close();
    return;
  }

  console.log(`[watch-launcher-flow] interruption ${options.interruptionOn ? "ON" : "OFF"} / ${options.usePack ? "pack" : "personal"} first`);

  await page.goto(`${BASE_URL}/safari/index.html`);
  await page.getByRole("link", { name: "Open Safari launcher" }).click();
  await page.waitForURL(/\/intercept\/safari$/);
  await page.waitForSelector(options.usePack ? '[data-testid="card-overlay-pack"]' : '[data-testid="card-overlay-personal"]');
  await sleep(STEP_DELAY_MS);

  const first = await readStep(page);
  printStep(1, first);

  if (options.usePack) {
    await page.getByTestId("card-overlay-pack").getByTestId("card-action-continue").click();
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
