import { test, expect } from '@playwright/test';

test('shared catalog request saves only after API success and supports retry', async ({ page }) => {
  let attempts = 0;
  let savedBody;
  await page.route('**/api/quote-intent', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'start') return route.fulfill({status:200,contentType:'application/json',body:'{"saved":true,"completed":false}'});
    attempts++;
    savedBody = body;
    return route.fulfill({status: attempts === 1 ? 502 : 200,contentType:'application/json',
      body: attempts === 1 ? '{"error":"SAVE_FAILED"}' : '{"saved":true,"completed":true,"folio":"GQ-ABCDEF0123"}'});
  });
  await page.goto('/catalogos/navidad-2026/?p=26');
  await expect(page.locator('#reader-page-label')).toContainText('Página 26');
  await page.getByRole('button', { name: 'Añadir Cutters' }).click();
  await page.goto('/catalogos/agendas-2027/?p=2');
  await page.getByRole('button', { name: /Añadir Agenda Semanal Luxemburgo Ejecutiva 2027/ }).click();
  await page.locator('#open-quote').click();
  await expect(page.locator('#cart-items')).toContainText('Cutters');
  await expect(page.locator('#cart-items')).toContainText('ASLE2027');
  await page.locator('[name=name]').fill('Ana Ruiz');
  await page.locator('[name=phone]').fill('5512345678');
  await page.locator('[name=buyerType]').selectOption('empresa');
  await page.locator('[name=intendedUse]').fill('Regalo para clientes');
  await page.locator('[name=personalization]').fill('Logotipo a un color');
  await page.locator('[name=requiredDate]').fill('2026-12-10');
  await page.locator('#save-quote').click();
  await expect(page.locator('#quote-status')).toContainText('No se pudo guardar');
  await expect(page.locator('#saved-actions')).toBeHidden();
  await page.locator('#save-quote').click();
  await expect(page.locator('#quote-status')).toContainText('Solicitud guardada');
  await expect(page.locator('#saved-actions')).toBeVisible();
  expect(savedBody.items).toHaveLength(2);
  expect(savedBody.email).toBe('');
  expect(savedBody.phone).toBe('5512345678');
  await expect(page.locator('#catalog-whatsapp')).toHaveAttribute('href', /GQ-ABCDEF0123/);
  await page.evaluate(() => document.getElementById('catalog-whatsapp').addEventListener('click', (event) => event.preventDefault()));
  await page.locator('#catalog-whatsapp').click();
  await expect(page.locator('#catalog-whatsapp')).not.toHaveAttribute('href', /GW-/);
  const originalKey = savedBody.key;
  await page.reload();
  await page.locator('#open-quote').click();
  await expect(page.locator('#quote-status')).toContainText('Solicitud guardada');
  await page.locator('#cart-items [data-qty]').first().fill('21');
  await page.locator('#cart-items [data-qty]').first().blur();
  await expect(page.locator('#saved-actions')).toBeHidden();
  await page.locator('[name=name]').fill('Ana Ruiz');
  await page.locator('[name=phone]').fill('5512345678');
  await page.locator('[name=buyerType]').selectOption('empresa');
  await page.locator('[name=intendedUse]').fill('Regalo para clientes');
  await page.locator('[name=requiredDate]').fill('2026-12-10');
  await page.locator('#save-quote').click();
  await expect(page.locator('#quote-status')).toContainText('Solicitud guardada');
  expect(savedBody.key).not.toBe(originalKey);
  expect(savedBody.items[0].quantity).toBe(21);
});

test('reader search, original numbering and mobile spread halves', async ({ page, isMobile }) => {
  await page.goto('/catalogos/navidad-2026/?p=55');
  await page.locator('#page-next').click();
  await expect(page.locator('#reader-page-label')).toContainText('Página 57');
  await page.locator('#sku-search').fill('A2786');
  await expect(page.locator('#search-results a')).toHaveCount(2);
  await page.locator('#search-results a').first().click();
  await expect(page.locator('#reader-page-label')).toContainText('Página 26');
  await page.goto('/catalogos/agendas-2027/?p=2');
  if (isMobile) {
    await expect(page.locator('#reader-stage')).toHaveAttribute('data-side', 'left');
    await page.locator('#page-next').click();
    await expect(page.locator('#reader-stage')).toHaveAttribute('data-side', 'right');
    await expect(page.locator('#reader-page-label')).toContainText('Página 2');
    await page.locator('#page-next').click();
    await expect(page.locator('#reader-page-label')).toContainText('Página 3');
  } else {
    await page.locator('#page-next').click();
    await expect(page.locator('#reader-page-label')).toContainText('Página 3');
  }
});

test('email request autosaves its draft and finishes with the same key', async ({ page }) => {
  const calls = [];
  await page.route('**/api/quote-intent', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      saved: true, completed: body.action === 'complete', folio: body.action === 'complete' ? 'GQ-ABCDEF0123' : undefined,
    }) });
  });
  await page.goto('/catalogos/agendas-2027/?p=2');
  await page.getByRole('button', { name: /Añadir Agenda Semanal Luxemburgo Ejecutiva 2027/ }).click();
  await page.locator('#open-quote').click();
  await page.locator('[name=name]').fill('Ana Ruiz');
  await page.locator('[name=email]').fill('ana@example.com');
  await page.locator('[name=email]').blur();
  await expect.poll(() => calls.some((call) => call.action === 'start')).toBe(true);
  await page.locator('[name=buyerType]').selectOption('empresa');
  await page.locator('[name=intendedUse]').fill('Agenda para equipo');
  await page.locator('[name=requiredDate]').fill('2026-12-10');
  await page.locator('#save-quote').click();
  await expect(page.locator('#quote-status')).toContainText('Solicitud guardada');
  expect(calls.map((call) => call.action)).toEqual(['start', 'complete']);
  expect(calls[0].key).toBe(calls[1].key);
  expect(calls[1].email).toBe('ana@example.com');
});

test('without JavaScript a SKU link opens its original sheet in the HTML index', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/catalogos/navidad-2026/');
  await expect(page.locator('.all-pages')).not.toHaveAttribute('open');
  await page.locator('.all-pages summary').click();
  await page.getByRole('link', { name: 'Cutters A2786' }).click();
  await expect(page).toHaveURL(/p=26&sku=A2786#pagina-26$/);
  await expect(page.locator('#pagina-26')).toBeInViewport();
  await context.close();
});

test('send list uses the form; help opens a separate GW folio without list data', async ({ page }) => {
  const requests = [];
  await page.addInitScript(() => {
    window.grafikAnalyticsConfig = { force: true };
    navigator.sendBeacon = () => false;
  });
  await page.route('**/api/track', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.events) requests.push(body);
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/catalogos/navidad-2026/');
  await page.locator('#send-list').click();
  await expect(page.locator('#quote-dialog')).toBeVisible();
  await page.locator('#close-quote').click();
  await page.locator('#catalog-help').evaluate((link) => link.addEventListener('click', (event) => event.preventDefault()));
  await page.locator('#catalog-help').click();
  const href = await page.locator('#catalog-help').getAttribute('href');
  expect(decodeURIComponent(new URL(href).searchParams.get('text'))).toMatch(/ayuda con los catálogos.*GW-[0-9A-F]{10}/i);
  expect(href).not.toContain('A2786');
  await expect.poll(() => requests.some((body) => body.events.some((event) => event.name === 'catalog_help_click'))).toBe(true);
  const help = requests.flatMap((body) => body.events).find((event) => event.name === 'catalog_help_click');
  expect(help.props).toEqual({ folio: expect.stringMatching(/^GW-[0-9A-F]{10}$/) });
});

test('page reference thumbnails wait until the native section opens', async ({ page }) => {
  const requested = [];
  page.on('request', (request) => { if (request.url().includes('/previews/04.webp')) requested.push(request.url()); });
  await page.goto('/catalogos/navidad-2026/?p=26');
  await expect(page.locator('.all-pages')).not.toHaveAttribute('open');
  expect(requested).toHaveLength(0);
  await expect(page.locator('.all-pages img[data-src]')).toHaveCount(56);
  await page.locator('.all-pages summary').click();
  await expect(page.locator('.all-pages img[data-src]')).toHaveCount(0);
  await expect.poll(() => requested.length).toBeGreaterThan(0);
});
