import { expect, test, type Page } from '@playwright/test';

async function seedFirstRun(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'false');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'New User', timezone: 'Europe/London' }));
    window.localStorage.setItem('mybishbash.cards.v1', '[]');
    window.localStorage.setItem('mybishbash.card-packs.v1', '[]');
    window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
    window.localStorage.setItem('mybishbash.event-log.v1', '[]');
    window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
    window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
    window.localStorage.setItem('mybishbash.hidden-library-packs.v1', '[]');
    window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify({
      mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      instagram: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      youtube: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      whatsapp: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      chrome: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
    }));
  });
}

test('new onboarding explains the product before setup and seeds starter Personal Cards only', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await expect(page.getByRole('heading', { name: "The best thing that's ever happened to your phone." })).toBeVisible();
  await expect(page.getByText('MyBishBash helps you use your favourite apps more intentionally.')).toBeVisible();
  await page.getByRole('button', { name: 'Show me how it works' }).click();

  await expect(page.getByRole('heading', { name: "Use your phone like someone who's building their life on purpose." })).toBeVisible();
  await page.getByRole('button', { name: 'Show me' }).click();

  await expect(page.getByText('Have you taken your vitamins today?')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Personal Cards are little reminders from yourself.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'I will read for 10 minutes tonight.' })).toBeVisible();
  await page.getByRole('button', { name: 'Not this time' }).click();
  await expect(page.getByText('Commitments are optional.')).toBeVisible();
  await expect(page.getByText('Many people never use them.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Personal Cards')).toBeVisible();
  await expect(page.getByText('Explore')).toBeVisible();
  await expect(page.getByText('Apps')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Instagram Shortcut')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Add MyBishBash to your Home Screen' })).toBeVisible();
  await page.getByRole('button', { name: "I'll do this later" }).click();

  await expect(page.getByRole('heading', { name: 'Choose your first app' })).toBeVisible();
  await page.getByRole('radio', { name: 'Instagram' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Everyday Reminders')).toBeVisible();
  await expect(page.getByText('Personal Growth')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: "You're ready." })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Instagram Shortcut' })).toBeVisible();

  await expect.poll(async () => {
    return page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]').length);
  }).toBeGreaterThanOrEqual(6);

  const state = await page.evaluate(() => ({
    cards: JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'),
    cardPacks: JSON.parse(window.localStorage.getItem('mybishbash.card-packs.v1') ?? '[]'),
    actionCards: JSON.parse(window.localStorage.getItem('mybishbash.action-cards.v1') ?? '[]'),
    behavior: JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}'),
    text: document.body.innerText,
  }));

  expect(state.cards.map((card: Record<string, unknown>) => card.promptText)).toEqual(expect.arrayContaining([
    'Have you taken your vitamins today?',
    'Have you drunk enough water today?',
    'Go outside for five minutes',
    'Read one page',
    'What matters most today?',
    "What's one thing Future You would thank you for?",
  ]));
  expect(state.cards.every((card: Record<string, unknown>) => !card.cardKind)).toBe(true);
  expect(state.cardPacks).toEqual([]);
  expect(state.actionCards.filter((card: Record<string, unknown>) => card.source === 'user')).toEqual([]);
  expect(state.behavior.instagram.useInterruptionPack).toBe(false);
  expect(state.text).not.toMatch(/\blauncher\b|\bshell\b|fake launcher|protected app|interruption pack|library pack/i);

  await page.evaluate(() => {
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'false');
  });
  await page.goto('/mybishbash/onboarding');
  await page.getByRole('button', { name: 'Show me how it works' }).click();
  await page.getByRole('button', { name: 'Show me' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: "You're ready." })).toBeVisible();

  const starterPrompts = [
    'Have you taken your vitamins today?',
    'Have you drunk enough water today?',
    'Go outside for five minutes',
    'Read one page',
    'What matters most today?',
    "What's one thing Future You would thank you for?",
  ];
  await expect.poll(async () => page.evaluate((prompts) => {
    const cards = JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]');
    const counts = cards.reduce((acc: Record<string, number>, card: Record<string, string>) => {
      acc[card.promptText] = (acc[card.promptText] ?? 0) + 1;
      return acc;
    }, {});
    return prompts.map((prompt) => counts[prompt] ?? 0);
  }, starterPrompts)).toEqual(starterPrompts.map(() => 1));
});
