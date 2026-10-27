import { test, expect } from '@playwright/test';
import { CATALOG_FIXTURE } from '../fixtures/catalog.js';

test('Contacto conserva WhatsApp sin correo y guarda sólo con correo válido', async ({ page }) => {
  const posts = [];
  await page.addInitScript(() => { window.__wa = null; window.open = (url) => { window.__wa = url; return null; }; });
  await page.route('**/api/quote-intent', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    posts.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"saved":true}' });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const form = page.locator('form[data-track-form]');
  await expect(form).toBeVisible({ timeout: 10000 });
  await expect(form.locator('[name="name"]')).toHaveAttribute('autocomplete', 'name');
  await expect(form.locator('[name="email"]')).toHaveAttribute('autocomplete', 'email');
  await expect(form.locator('[name="tel"]')).toHaveAttribute('autocomplete', 'tel');
  await form.locator('[name="name"]').fill('Ana');
  await form.locator('button[type="submit"]').click();
  expect(await page.evaluate(() => window.__wa)).toContain('wa.me/525539014600');
  expect(posts).toHaveLength(0);
  await form.locator('[name="email"]').fill('ana@example.com');
  await expect.poll(() => posts.some((p) => p.action === 'start'), { timeout: 5000 }).toBe(true);
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => posts.some((p) => p.action === 'complete'), { timeout: 5000 }).toBe(true);
  expect(posts.every((p) => p.marketingConsent === false)).toBe(true);
});

test('Estudio exige nombre y correo antes de pedir el catálogo', async ({ page }) => {
  let catalogRequests = 0;
  const posts = [];
  await page.route('**/api/quote-intent', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    posts.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"saved":true}' });
  });
  await page.route('**/api/catalog', (route) => {
    catalogRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG_FIXTURE) });
  });
  await page.goto('/estudio/');
  const gate = page.locator('#es-access');
  await expect(gate).toBeVisible({ timeout: 10000 });
  expect(catalogRequests).toBe(0);
  await gate.locator('#es-access-name').fill('Ana García');
  await gate.locator('#es-access-email').fill('ana@example.com');
  await gate.locator('button[type="submit"]').click();
  await expect.poll(() => catalogRequests, { timeout: 10000 }).toBe(1);
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ action: 'start', channel: 'estudio', marketingConsent: false });
  await expect(gate).toBeHidden();
});
