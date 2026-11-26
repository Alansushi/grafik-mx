import { test, expect } from '@playwright/test';
import { CATALOG_FIXTURE } from '../fixtures/catalog.js';
import { fileURLToPath } from 'node:url';

const IMAGE = fileURLToPath(new URL('../fixtures/logo-opaco.png', import.meta.url));
const FABRIC = fileURLToPath(new URL('../fixtures/mockups/playera-front-v3.png', import.meta.url));

test('el precio base de frazada se mide una vez cuando entra en pantalla', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  const events = [];
  await page.route('**/api/track', (r) => {
    events.push(...r.request().postDataJSON().events);
    return r.fulfill({ status: 204 });
  });
  await page.addInitScript(() => { window.grafikAnalyticsConfig = { force: true }; });
  await page.route('**/api/catalog', (r) => r.fulfill({ json: CATALOG_FIXTURE }));
  await page.goto('/estudio/');
  const hiddenPrice = await page.addStyleTag({ content: '.es-blanket-size { display: none !important }' });
  await page.getByRole('radio', { name: 'Frazada personalizada' }).click();
  await page.waitForTimeout(2200);
  expect(events.filter((e) => e.name === 'studio_price_view')).toHaveLength(0);
  await hiddenPrice.evaluate((el) => {
    el.textContent = '.es-talla-field:has(#es-talla-P) .es-blanket-size, .es-talla-field:has(#es-talla-I) .es-blanket-size { display: none !important }';
  });
  await page.locator('.es-blanket-size').last().scrollIntoViewIfNeeded();
  await expect.poll(() => events.filter((e) => e.name === 'studio_price_view').length).toBe(1);
  await page.locator('.es-blanket-size').last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(2200);
  expect(events.filter((e) => e.name === 'studio_price_view')).toHaveLength(1);
});

test('frazada conserva recortes por medida y envía original más dos previews en un pedido', async ({ page }) => {
  const uploads = [];
  let submitted;
  await page.route('**/api/catalog', (r) => r.fulfill({ json: CATALOG_FIXTURE }));
  await page.route(/\/assets\/estudio\/frazada-.*\.png/, (r) => r.fulfill({ path: FABRIC, contentType: 'image/png' }));
  await page.route('**/api/upload-url', (r) => {
    const b = r.request().postDataJSON(); uploads.push(b);
    return r.fulfill({ json: { path: `2026/11/${b.draftId}/${b.kind}-${b.itemIndex ?? 0}.png`,
      upload_url: 'https://supabase.test/upload', token: 'test' } });
  });
  await page.route('https://supabase.test/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  await page.route('**/api/submit-quote', (r) => {
    submitted = r.request().postDataJSON();
    return r.fulfill({ status: 201, json: { short_code: 'GK-123456',
      public_token: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' } });
  });
  await page.goto('/estudio/?debug=1');
  await page.waitForFunction(() => window.__studio?.stage);
  await page.getByRole('radio', { name: 'Frazada personalizada' }).click();
  await page.locator('input[type=file]').setInputFiles(IMAGE);
  await page.waitForFunction(() => window.__studio?.transform && window.__studio.garment.slug === 'frazada');
  await expect(page.getByText(/resolución.*baja|pixelead/i).first()).toBeVisible();

  await page.locator('#es-talla-P').fill('1');
  const personalBefore = await page.evaluate(() => window.__studio.stage.getTransform().x);
  await page.evaluate(() => window.__studio.stage.nudge(-30, 0));
  const personalAfter = await page.evaluate(() => window.__studio.stage.getTransform().x);
  expect(personalAfter).toBeLessThan(personalBefore);
  await page.locator('.es-blanket-size').filter({ hasText: 'Individual 200 × 150' }).click();
  await page.locator('#es-talla-I').fill('2');
  const individualBefore = await page.evaluate(() => window.__studio.stage.getTransform().y);
  await page.evaluate(() => window.__studio.stage.nudge(0, -20));
  const individualAfter = await page.evaluate(() => window.__studio.stage.getTransform().y);
  expect(individualAfter).toBeLessThan(individualBefore);
  await page.locator('.es-blanket-size').filter({ hasText: 'Matrimonial 220 × 150' }).click();
  await page.locator('#es-talla-M').fill('3');
  const matrimonialBefore = await page.evaluate(() => window.__studio.stage.getTransform().y);
  await page.evaluate(() => window.__studio.stage.nudge(0, -10));
  const matrimonialAfter = await page.evaluate(() => window.__studio.stage.getTransform().y);
  expect(matrimonialAfter).toBeLessThan(matrimonialBefore);
  await page.locator('.es-blanket-size').filter({ hasText: 'Personal 100 × 150' }).click();
  expect(await page.evaluate(() => window.__studio.stage.getTransform().x)).toBe(personalAfter);
  await page.locator('.es-blanket-size').filter({ hasText: 'Individual 200 × 150' }).click();
  expect(await page.evaluate(() => window.__studio.stage.getTransform().y)).toBe(individualAfter);
  await page.locator('.es-blanket-size').filter({ hasText: 'Matrimonial 220 × 150' }).click();
  expect(await page.evaluate(() => window.__studio.stage.getTransform().y)).toBe(matrimonialAfter);

  await page.evaluate(() => { window.__opened = null; window.open = (url) => { window.__opened = url; return { opener: null }; }; });
  await page.locator('#es-customer-name').fill('Ana Ruiz');
  await page.locator('#es-customer-email').fill('ana@ejemplo.mx');
  await page.locator('#es-customer-phone').fill('55 1234 5678');
  await page.locator('.es-resumen-submit').click();
  await page.waitForFunction(() => window.__opened);
  expect(uploads.map((u) => u.kind)).toEqual(['logo', 'preview', 'preview', 'preview']);
  expect(submitted.items.map((i) => i.size_breakdown)).toEqual([{ P: 1 }, { I: 2 }, { M: 3 }]);
  expect(new Set(submitted.items.map((i) => i.logo_path)).size).toBe(1);
  expect(new Set(submitted.items.map((i) => i.preview_path)).size).toBe(3);
  const message = decodeURIComponent(new URL(await page.evaluate(() => window.__opened)).searchParams.get('text'));
  expect(message).toContain('Personal (100 × 150 cm): 1 pieza');
  expect(message).toContain('Individual (200 × 150 cm): 2 piezas');
  expect(message).toContain('Matrimonial (220 × 150 cm): 3 piezas');
  expect(message).toContain('GK-123456');
});

test('la imagen sólo aparece dentro del contorno de la frazada', async ({ page }) => {
  await page.route('**/api/catalog', (r) => r.fulfill({ json: CATALOG_FIXTURE }));
  await page.goto('/estudio/?debug=1');
  await page.waitForFunction(() => window.__studio?.stage);
  await page.getByRole('radio', { name: 'Frazada personalizada' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'solid.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#123456"/></svg>') });
  await page.waitForFunction(() => window.__studio?.transform && window.__studio.garment.slug === 'frazada');
  const corner = await page.locator('.es-blanket-canvas').evaluate((canvas) =>
    Array.from(canvas.getContext('2d').getImageData(0, 0, 1, 1).data).slice(0, 3));
  expect(Math.min(...corner)).toBeGreaterThan(220);
});

test('la consulta del pedido muestra cada medida con su precio base y sin total cerrado', async ({ page }) => {
  await page.route('**/api/order-status*', (r) => r.fulfill({ json: {
    short_code: 'GK-123456', status: 'quoted', currency: 'MXN', total_cents: null,
    priced_with_placeholder: false, created_at: '2026-11-22T12:00:00Z', customer_name: 'Ana Ruiz',
    items: ['P', 'M'].map((size, index) => ({ item_index: index,
      garment: 'Frazada personalizada', render_type: 'blanket', color_hex: '#D6D5D1',
      color_name: 'Felpa gris claro', technique: null,
      size_breakdown: { [size]: index + 1 }, qty: index + 1,
      unit_price_cents: null, subtotal_cents: null,
      reference_unit_price_cents: size === 'P' ? 41000 : 63000,
      preview_url: `/assets/estudio/frazada-${size === 'P' ? 'personal' : 'matrimonial'}.png`,
      logo_url: 'https://supabase.test/original.png' })),
  } }));
  await page.goto('/estudio/pedido/?t=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  await expect(page.getByText('Personal · 100 × 150 cm')).toBeVisible();
  await expect(page.getByText('Matrimonial · 220 × 150 cm')).toBeVisible();
  await expect(page.getByText('$410.00 base por pieza')).toBeVisible();
  await expect(page.getByText('$630.00 base por pieza')).toBeVisible();
  await expect(page.getByText(/cotización final.*WhatsApp/i)).toBeVisible();
});
