import { expect, test } from '@playwright/test';

test('synthetic member can sign in and load the seeded profile boundary', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('roger@hotmail.com').fill('member-a@example.invalid');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('member-a@example.invalid')).toBeVisible();
  await page.locator('input[type="password"]').fill('local-member-a-123!');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/profile$/);
  await expect(page).toHaveTitle('My Profile · Racquets & Strings');
  await expect(page.getByText('Synthetic Member', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Profile incomplete')).toBeVisible();
});
