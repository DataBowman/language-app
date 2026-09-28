import { expect, test } from '@playwright/test';

// Runs without a backend: the build uses development-mode sign-in only when no Supabase project is configured.
test('student can open quick practice and an immersive session switches to Spanish', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByRole('button', { name: 'Continue as student' }).click();
  await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toBeVisible();

  await page.getByRole('button', { name: /Quick practice/ }).click();
  await expect(page.getByText('flashcard', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: /Deep session/ }).click();
  await expect(page.getByRole('heading', { name: 'Sesión profunda' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver' })).toBeVisible();

  expect(errors).toEqual([]);
});

test('tutor sees the dashboard sections', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue as tutor' }).click();
  for (const section of ['Lessons', 'Review queue', 'Progress']) {
    await expect(page.getByText(section, { exact: true })).toBeVisible();
  }
});
