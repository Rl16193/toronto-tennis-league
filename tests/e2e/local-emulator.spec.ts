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
  await expect(page.getByText('6-4 6-2')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('F — Started')).toBeVisible({ timeout: 15_000 });
  await capture(page, '04-tournament-score-advanced');
});
