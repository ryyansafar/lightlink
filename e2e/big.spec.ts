import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __bigRunOne: (i: number, d: 'native' | 'jsqr', c: boolean) => Promise<{ ok: boolean; kbps: number; progress: number }>;
  }
}

test('big mode: safe profile moves multi-generation data through the jsQR path', async ({ page }) => {
  await page.goto('/#bigloop');
  const r = await page.evaluate(() => window.__bigRunOne(0, 'jsqr', false));
  expect(r.ok).toBe(true);
  expect(r.kbps).toBeGreaterThan(0);
});

test('big mode: fast profile with two tiles through jsQR, and colour layers', async ({ page }) => {
  await page.goto('/#bigloop');
  const mono = await page.evaluate(() => window.__bigRunOne(1, 'jsqr', false));
  expect(mono.ok).toBe(true);
  const colour = await page.evaluate(() => window.__bigRunOne(1, 'jsqr', true));
  expect(colour.ok).toBe(true);
});

test('big mode screens render and the default home is intact', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Receive', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Big files: send (laptop to phone)' }).click();
  await expect(page.getByText('Send big file')).toBeVisible();
});
