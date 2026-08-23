import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const evidenceDir = process.env.RANDS_E2E_EVIDENCE_DIR;
const capture = async (page: Page, name: string) => {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: true });
};

const login = async (page: Page, email: string, password: string) => {
  await page.goto('/login');
  await page.getByPlaceholder('roger@hotmail.com').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/profile$/);
};

type FirestoreRestDocument = {
  name?: string;
  fields?: Record<string, { stringValue?: string }>;
};

const listFirestoreDocuments = async (collectionName: string): Promise<FirestoreRestDocument[]> => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) {
    throw new Error('Browser tests may inspect Firestore only through the local emulator.');
  }
  const response = await fetch(
    `http://${host}/v1/projects/rands-local/databases/(default)/documents/${encodeURIComponent(collectionName)}?pageSize=1000`,
  );
  expect(response.ok).toBe(true);
  const payload = (await response.json()) as { documents?: FirestoreRestDocument[] };
  return payload.documents ?? [];
};

test('Hosting serves the SPA rewrite with repository security and cache headers', async ({ request }) => {
  const response = await request.get('/login');
  expect(response.ok()).toBe(true);
  expect(response.headers()['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
  expect(response.headers()['cache-control']).toContain('no-cache');
  await expect(response.text()).resolves.toContain('<div id="root">');
});

test('synthetic member can sign in and load the seeded profile boundary', async ({ page }) => {
  await login(page, 'member-a@example.invalid', 'local-member-a-123!');

  await expect(page).toHaveURL(/\/profile$/);
  await expect(page).toHaveTitle('My Profile · Racquets & Strings');
  await expect(page.getByText('Synthetic Member', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Profile incomplete')).toBeVisible();
  await capture(page, '01-seeded-profile');
});

test('new member signs up and persists the profile bootstrap', async ({ page }) => {
  const email = `qa-${Date.now()}@example.invalid`;
  await page.goto('/signup');
  await page.getByPlaceholder('roger@hotmail.com').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill('Local-Test!9xQ');
  await passwords.nth(1).fill('Local-Test!9xQ');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByPlaceholder('Roger Federer').fill('Synthetic Signup');
  await page.getByRole('button', { name: 'Complete Profile' }).click();
  await expect(page.getByText('Thank you for joining the league')).toBeVisible();
  await capture(page, '02-signup-complete');
});

test('member joins a synthetic social event through the hosted application', async ({ page }) => {
  await login(page, 'member-a@example.invalid', 'local-member-a-123!');
  await page.goto('/events');
  await page.getByRole('tab', { name: 'Socials' }).click();
  const socialCard = page
    .getByRole('heading', { name: 'Synthetic Social' })
    .locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');

  await expect(socialCard).toContainText('Synthetic Social');
  await socialCard.getByRole('button', { name: 'Join Event' }).click();

  const joinDialog = page.getByRole('dialog', { name: 'Join Synthetic Social' });
  await expect(joinDialog).toBeVisible();
  await joinDialog.getByRole('button', { name: 'Join Event' }).click();
  await expect(socialCard.getByRole('button', { name: 'Joined' })).toBeVisible();
  await capture(page, '03-social-event-joined');
});

test('organizer records a tournament score and advances the winner', async ({ page }) => {
  await login(page, 'organizer-a@example.invalid', 'local-organizer-a-123!');
  await page.goto('/matches?mode=tournament&event=e2e-tournament');
  await expect(page.getByText('Synthetic Tournament')).toBeVisible();
  await page.getByRole('button', { name: 'Enter score' }).first().click();
  await page.getByRole('radio', { name: 'Synthetic Organizer' }).click();
  await page.getByRole('textbox', { name: 'Synthetic Organizer set 1 games', exact: true }).fill('6');
  await page.getByRole('textbox', { name: 'Synthetic Member set 1 games', exact: true }).fill('4');
  await page.getByRole('textbox', { name: 'Synthetic Organizer set 2 games', exact: true }).fill('6');
  await page.getByRole('textbox', { name: 'Synthetic Member set 2 games', exact: true }).fill('2');
  await page.getByRole('button', { name: 'Record Score' }).click();
  await expect(page.getByText('Score recorded and draw updated.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('6-4 6-2').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('F — Started')).toBeVisible({ timeout: 15_000 });
  await capture(page, '04-tournament-score-advanced');
});

test('organizer creates an owned event without receiving global review authority', async ({ page }) => {
  const title = `QA Organizer Event ${Date.now()}`;
  await login(page, 'organizer-a@example.invalid', 'local-organizer-a-123!');

  await page.goto('/tasks');
  await expect(page.getByText('Needs your review')).toHaveCount(0);

  await page.goto('/events');
  await page.getByRole('button', { name: 'Add an event' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an Event' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Location').fill('Synthetic QA Court');
  await dialog.getByLabel('Start date').fill('2099-10-20');
  await dialog.getByLabel('End date').fill('2099-10-21');
  await dialog.getByLabel('Join by').fill('2099-10-19');
  await dialog.getByLabel('About').fill('Synthetic organizer-owned event created by the browser test.');
  await dialog.getByRole('button', { name: 'Add Event' }).click();

  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });
  const events = await listFirestoreDocuments('events');
  const created = events.find((event) => event.fields?.title?.stringValue === title);
  expect(created?.fields?.creator_id?.stringValue).toBe('organizer-a');
  await capture(page, '05-organizer-event-created');
});

test('group lesson coach can contact an enrolled player', async ({ page }) => {
  await login(page, 'provider-a@example.invalid', 'local-provider-a-123!');
  await page.goto('/marketplace');
  await page.getByRole('button', { name: 'Coaches', exact: true }).click();
  await page.getByRole('button', { name: /Synthetic Coach/ }).click();
  await page.getByRole('button', { name: '1/4 joined', exact: true }).click();

  await expect(page.getByLabel('Email Synthetic Member')).toBeVisible();
  await capture(page, '06-group-lesson-coach-contact');
});

test('member cannot see unpublished Round Robin groups', async ({ page }) => {
  await login(page, 'member-a@example.invalid', 'local-member-a-123!');
  await page.goto('/matches?mode=tournament&event=e2e-round-robin');
  await expect(page.getByText('Synthetic Round Robin')).toBeVisible();
  await expect(page.getByText('3 signed up')).toBeVisible();
  await page.getByRole('button', { name: 'Downtown - Midtown', exact: true }).click();
  await page.getByRole('button', { name: /Challengers.*3\/8/ }).click();

  await expect(page.getByText('The Round Robin draw has not been released yet.')).toBeVisible();
  await expect(page.getByText('Group Stage')).toHaveCount(0);
  await expect(page.getByText('Synthetic Organizer', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthetic Multi-role User', { exact: true })).toHaveCount(0);
  await capture(page, '07-round-robin-unpublished-hidden');
});

test('organizer generates a Round Robin draw and records a no-show result', async ({ page }) => {
  await login(page, 'organizer-a@example.invalid', 'local-organizer-a-123!');
  await page.goto('/matches?mode=tournament&event=e2e-round-robin');
  await expect(page.getByText('Synthetic Round Robin')).toBeVisible();
  await expect(page.getByText('3 signed up')).toBeVisible();
  await page.getByRole('button', { name: 'Downtown - Midtown', exact: true }).click();
  await page.getByRole('button', { name: /Challengers.*3\/8/ }).click();

  await page.getByRole('button', { name: 'Manage Draw' }).click();
  await page.getByRole('button', { name: 'Generate Matches' }).click();
  await expect(page.getByText('Round Robin Setup')).toBeVisible();
  await expect(page.getByText(/players registered/)).toHaveText('3 players registered');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByText('Round Robin draw generated: 1 group.')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Matches (3)' }).click();
  await page.getByRole('button', { name: 'Score', exact: true }).last().click();
  await page.getByLabel('Count As No Show').check();
  await page.getByRole('button', { name: 'Record No Show' }).click();
  await expect(page.getByText('Recorded as a no show — 1 point to each player.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('No show · 1 pt each')).toBeVisible({ timeout: 15_000 });
  await capture(page, '08-round-robin-no-show');
});
