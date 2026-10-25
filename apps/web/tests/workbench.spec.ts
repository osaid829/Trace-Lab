import { expect, test } from '@playwright/test';

test('sends, saves, and replays a real local request', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Request URL' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Request URL' }).fill('http://127.0.0.1:4320/ok');
  await page.getByRole('button', { name: /^Send/ }).click();
  await expect(page.getByText('Captured from the local execution service')).toBeVisible();
  await expect(page.locator('.stat-cell strong').filter({ hasText: '200' }).first()).toBeVisible();
  await expect(page.getByText('ok:')).toBeVisible();

  await page.getByRole('textbox', { name: 'Request name' }).fill('E2E health check');
  await page.getByRole('button', { name: /save (unsaved )?request/i }).click();
  await expect(page.getByRole('button', { name: 'GET E2E health check' }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Send/ }).click();
  await expect(page.locator('.stat-cell strong').filter({ hasText: '200' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('button', { name: /GET http:\/\/127\.0\.0\.1:4320\/ok.*success/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /GET http:\/\/127\.0\.0\.1:4320\/ok.*success/ }).first().click();
  await expect(page.locator('.stat-cell strong').filter({ hasText: '200' }).first()).toBeVisible();
});
