import { test, expect } from '@playwright/test';
import { CATALOG_FIXTURE } from '../fixtures/catalog.js';
import privacyNotice from '../../api/privacy-notice.js';
import unsubscribe from '../../api/unsubscribe.js';

test('La baja de correos conserva el diseño y la acción en escritorio y móvil', async ({ page }) => {
  const token = '123e4567-e89b-42d3-a456-426614174000';
  await page.route('**/api/unsubscribe?t=*', async (route) => {
    const res = { body: '', status() { return this; }, setHeader() { return this; }, send(body) { this.body = body; return this; } };
    await unsubscribe({ method: 'GET', query: { t: token } }, res);
    await route.fulfill({ status: 200, contentType: 'text/html', body: res.body });
  });
  await page.goto(`/api/unsubscribe?t=${token}`);
  await expect(page.getByRole('heading', { name: 'Baja de correos' })).toBeVisible();
  const button = page.getByRole('button', { name: 'Confirmar baja' });
  await expect(button).toBeVisible();
  await expect(page.locator('input[name="token"]')).toHaveValue(token);
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(12, 12, 12)');
  expect(await button.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await button.focus();
  expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
});

test('Contacto agrupa servicios y conserva selección, captura y preselección', async ({ page }) => {
  const posts = [];
  await page.addInitScript(() => { window.__wa = null; window.open = (url) => { window.__wa = url; return null; }; });
  await page.route('**/api/quote-intent', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    posts.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"saved":true}' });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const form = page.locator('form[data-track-form]');
  const select = form.getByRole('combobox', { name: '¿Qué servicio necesitas?' });
  await expect(select).toBeVisible({ timeout: 10000 });
  await expect(select).toHaveValue('');
  expect(await select.locator('option').allTextContents()).toEqual([
    'Selecciona un servicio (opcional)',
    'Volantes', 'Pósters', 'Boletos', 'Stickers', 'Tarjetas de presentación',
    'Lonas', 'Pendones', 'Caballetes', 'Figuras en coroplast',
    'Brazaletes', 'Artículos Promocionales', 'Impresión 3D',
  ]);
  expect(await select.locator('optgroup').evaluateAll((groups) => groups.map((group) => ({
    label: group.label, values: [...group.querySelectorAll('option')].map((option) => option.value),
  })))).toEqual([
    { label: 'Impresión y papelería', values: ['Volantes', 'Pósters', 'Boletos', 'Stickers', 'Tarjetas de presentación'] },
    { label: 'Gran formato y exhibición', values: ['Lonas', 'Pendones', 'Caballetes', 'Figuras en coroplast'] },
    { label: 'Promocionales y especiales', values: ['Brazaletes', 'Artículos Promocionales', 'Impresión 3D'] },
  ]);
  expect(await select.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  if (await page.evaluate(() => innerWidth <= 640)) expect(await select.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

  await page.evaluate(() => { window.__serviceEvents = []; window.grafikTrack = (name, data) => { if (name === 'service_chip') window.__serviceEvents.push(data); }; });

  await select.selectOption('Pósters');
  await expect(select).toHaveValue('Pósters');
  await form.locator('[name="email"]').fill('ana@example.com');
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => posts.some((p) => p.action === 'complete')).toBe(true);
  expect(posts.find((p) => p.action === 'complete').service).toBe('Pósters');
  expect(decodeURIComponent(await page.evaluate(() => window.__wa))).toContain('Me interesa cotizar: Pósters.');

  await select.selectOption('');
  await expect(select).toHaveValue('');
  expect(await page.evaluate(() => window.__serviceEvents)).toEqual([
    { servicio: 'Pósters', selected: true }, { servicio: 'Pósters', selected: false },
  ]);
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => posts.filter((p) => p.action === 'complete').length).toBe(2);
  expect(posts.filter((p) => p.action === 'complete')[1].service).toBe('');
  expect(decodeURIComponent(await page.evaluate(() => window.__wa))).not.toContain('Me interesa cotizar:');

  await page.locator('.cp-prod').filter({ hasText: 'Flyers' }).click();
  await expect(select).toHaveValue('Volantes');
  await page.locator('.cp-intent').filter({ hasText: 'Tengo algo especial en mente' }).click();
  await expect(select).toHaveValue('');
});

test('Contacto conserva la casilla y el aviso cuando la captura está desactivada', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const form = page.locator('form[data-track-form]');
  const consent = form.getByRole('checkbox', { name: 'Acepto recibir promociones por correo (opcional).' });
  const notice = form.getByRole('link', { name: 'Aviso de privacidad integral' });
  await expect(consent).toBeVisible({ timeout: 10000 });
  await expect(consent).not.toBeChecked();
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('href', '/api/privacy-notice');
});

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

test('Contacto muestra el consentimiento opcional y enlaza al aviso sin texto extenso', async ({ page, context }) => {
  const posts = [];
  await page.addInitScript(() => { window.__wa = null; window.open = (url) => { window.__wa = url; return null; }; });
  await page.route('**/api/quote-intent', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, privacy: { controller: 'Orkestalo', address: 'CDMX', email: 'info@orkestalo.com' } }) });
    posts.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"saved":true}' });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const form = page.locator('form[data-track-form]');
  const consent = form.getByRole('checkbox', { name: 'Acepto recibir promociones por correo (opcional).' });
  const notice = form.getByRole('link', { name: 'Aviso de privacidad integral' });
  await expect(consent).toBeVisible({ timeout: 10000 });
  await expect(consent).not.toBeChecked();
  await expect(notice).toHaveAttribute('href', '/api/privacy-notice');
  await expect(form).not.toContainText('tratará tu nombre, correo, teléfono y detalle');
  expect(await notice.evaluate((el) => el.compareDocumentPosition(el.closest('form').querySelector('input[type="checkbox"]')) & Node.DOCUMENT_POSITION_PRECEDING)).toBeTruthy();
  await form.locator('[name="email"]').fill('ana@example.com');
  await consent.check();
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => posts.some((p) => p.action === 'complete')).toBe(true);
  expect(posts.find((p) => p.action === 'complete').marketingConsent).toBe(true);
  expect(await page.evaluate(() => window.__wa)).toContain('wa.me/525539014600');

  const previous = { ...process.env };
  Object.assign(process.env, { QUOTE_CAPTURE_ENABLED: '1', PRIVACY_CONTROLLER: 'Orkestalo S.A.S. de C.V.',
    PRIVACY_ADDRESS: 'Norte 13 núm. 282, CDMX', PRIVACY_EMAIL: 'info@orkestalo.com' });
  try {
    await context.route('**/api/privacy-notice', async (route) => {
      const response = { body: '', status() { return this; }, setHeader() { return this; }, send(body) { this.body = body; return this; } };
      privacyNotice({ method: 'GET' }, response);
      await route.fulfill({ status: 200, contentType: 'text/html', body: response.body });
    });
    const popupPromise = page.waitForEvent('popup');
    await notice.click();
    const popup = await popupPromise;
    await expect(popup.getByRole('heading', { name: 'Aviso de privacidad integral' })).toBeVisible();
    await expect(popup.getByText('debes enviarlo desde esa aplicación', { exact: false })).toBeVisible();
    await expect(popup.getByRole('link', { name: 'Volver a GRAFIK' })).toHaveAttribute('href', '/');
    expect(await popup.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(12, 12, 12)');
    expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { process.env = previous; }
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
