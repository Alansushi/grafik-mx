import { test, expect } from '@playwright/test';

test('shows the initial logo before scripts load, then reveals the decoded hero', async ({ page }) => {
  await page.route('**/assets/hero/brazaletes-morelos*.avif', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const splash = page.locator('#boot-splash');
  await expect(splash).toBeVisible();
  await expect(page.locator('.ssr-fallback')).toBeHidden();
  await expect(page.locator('.cp-hero-h1')).toBeAttached({ timeout: 5000 });
  await expect(splash).toBeVisible();
  await expect(page.locator('.cp-hero-h1')).toBeHidden();
  await expect(splash).toBeHidden({ timeout: 5000 });
  await expect(page.locator('.cp-hero-h1')).toBeVisible();
  await expect(page.locator('.cp-ph--main img')).toHaveJSProperty('complete', true);
  expect(await page.locator('.cp-ph--main img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
});

test('shows fallback content after the deadline when scripts fail', async ({ page }) => {
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/{react,react-dom,babel-standalone}/**', (route) => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot-splash')).toBeVisible();
  await expect(page.locator('.ssr-fallback h1')).toBeHidden();
  await expect(page.locator('#boot-splash')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('.ssr-fallback h1')).toBeVisible();
});

test('reveals the hero after the deadline if its main photo never loads', async ({ page }) => {
  await page.route('**/assets/hero/brazaletes-morelos*', (route) => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot-splash')).toBeVisible();
  await expect(page.locator('.cp-hero-h1')).toBeAttached({ timeout: 5000 });
  await expect(page.locator('#boot-splash')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('.cp-hero-h1')).toBeVisible();
});

test('keeps the logo over fallback content while React is delayed', async ({ page }) => {
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('.ssr-fallback h1')).toBeAttached();
  await expect(page.locator('#boot-splash')).toBeVisible();
  await expect(page.locator('.ssr-fallback h1')).toBeHidden();
  await expect(page.locator('#boot-splash')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('.cp-hero-h1')).toBeVisible();
});

test('reserves space for the secondary hero photos while they load', async ({ page }) => {
  await page.route('**/assets/hero/figura-coroplast-just-married*.avif', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.cp-hero-h1')).toBeVisible({ timeout: 5000 });
  const card = page.locator('.cp-ph--poster');
  const before = await card.boundingBox();
  await expect(card).toHaveClass(/is-loaded/, { timeout: 5000 });
  const after = await card.boundingBox();
  expect(after.width).toBeCloseTo(before.width, 0);
  expect(after.height).toBeCloseTo(before.height, 0);
});

test('keeps the fallback readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot-splash')).toBeHidden();
  await expect(page.locator('.ssr-fallback h1')).toBeVisible();
  await context.close();
});

test('removes the logo without a fade when motion is reduced', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot-splash')).toBeHidden({ timeout: 5000 });
  expect(await page.locator('#boot-splash').evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s');
  await expect(page.locator('.cp-hero-h1')).toBeVisible();
});
