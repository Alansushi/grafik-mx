import { test, expect } from '@playwright/test';
import { CATALOG_FIXTURE } from '../fixtures/catalog.js';
import { fileURLToPath } from 'node:url';

const IMAGE = fileURLToPath(new URL('../fixtures/logo-opaco.png', import.meta.url));
const REPLACEMENT = fileURLToPath(new URL('../fixtures/logo-transparente.png', import.meta.url));

test('pulsera inicia en 100, muestra error en 99 y conserva las ediciones hasta volver a seleccionarla', async ({ page }) => {
  await page.route('**/api/catalog', (r) => r.fulfill({ json: CATALOG_FIXTURE }));
  await page.goto('/estudio/?debug=1');
  await page.waitForFunction(() => window.__studio?.stage);
  await page.getByRole('radio', { name: 'Pulsera' }).click();
  const input = page.locator('#es-talla-U');
  await expect(input).toHaveValue('100');
  await page.getByRole('button', { name: 'Restar una pieza — Cantidad' }).click();
  await expect(input).toHaveValue('99');
  await expect(page.getByText('Mínimo 100 piezas por pedido (llevas 99).')).toBeVisible();
  await expect(page.locator('.es-resumen-submit')).toBeDisabled();
  await input.fill('100');
  await expect(page.getByText('Mínimo 100 piezas por pedido (llevas 99).')).toHaveCount(0);
  await input.fill('101');
  await expect(input).toHaveValue('101');
  await page.getByRole('radio', { name: 'Pulsera' }).click();
  await expect(input).toHaveValue('101');
  await page.getByRole('radio', { name: /Playera/ }).click();
  await page.getByRole('radio', { name: 'Pulsera' }).click();
  await expect(input).toHaveValue('100');
});

test('los siete colores muestran una guía contrastante que no aparece en la captura', async ({ page }) => {
  await page.route('**/api/catalog', (r) => r.fulfill({ json: CATALOG_FIXTURE }));
  await page.goto('/estudio/?debug=1');
  await page.waitForFunction(() => window.__studio?.stage);
  await page.getByRole('radio', { name: 'Pulsera' }).click();

  for (const [name, hex] of [
    ['Rojo', '#D72E50'], ['Naranja', '#ED762C'], ['Amarillo', '#F2D325'],
    ['Azul', '#2675D0'], ['Verde lima', '#8EDD62'], ['Rosa', '#D64AAD'],
    ['Verde oscuro', '#4D9871'],
  ]) {
    await page.getByRole('radio', { name, exact: true }).click();
    await page.waitForFunction((value) => window.__studio.colorHex === value, hex);
    const pixels = await page.evaluate(async () => {
      const visible = document.querySelector('.es-bracelet-canvas');
      const blob = await window.__studio.stage.snapshot();
      const bitmap = await createImageBitmap(blob);
      const saved = document.createElement('canvas');
      saved.width = bitmap.width; saved.height = bitmap.height;
      saved.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close();
      const a = visible.getContext('2d').getImageData(200, 172, 100, 1).data;
      const b = saved.getContext('2d').getImageData(200, 172, 100, 1).data;
      const deltas = [];
      for (let i = 0; i < a.length; i += 4) {
        const delta = (a[i] + a[i + 1] + a[i + 2] - b[i] - b[i + 1] - b[i + 2]) / 3;
        if (Math.abs(delta) > 25) deltas.push(delta);
      }
      const rear = visible.getContext('2d').getImageData(500, 405, 1, 1).data;
      return { count: deltas.length, average: deltas.reduce((sum, v) => sum + v, 0) / deltas.length,
        rear: Math.max(rear[0], rear[1], rear[2]) };
    });
    expect(pixels.count, `${name}: guía visible`).toBeGreaterThan(10);
    const [r, g, b] = hex.match(/\w\w/g).slice(0, 3).map((v) => parseInt(v, 16) / 255);
    const lum = [r, g, b].map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    expect(Math.sign(pixels.average), `${name}: contraste de guía`).toBe(lum < .179 ? 1 : -1);
    expect(pixels.rear, `${name}: sin banda posterior`).toBeLessThan(55);
  }
});

test('pulsera: tira, simulación, color, cantidad y pedido', async ({ page }) => {
  const uploads = [];
  let submitted;
  await page.route('**/api/catalog', (r) => r.fulfill({ json: CATALOG_FIXTURE }));
  await page.route('**/api/upload-url', (r) => {
    const b = r.request().postDataJSON();
    uploads.push(b);
    return r.fulfill({ json: {
      path: `2026/10/${b.draftId}/image.png`,
      upload_url: 'https://supabase.test/upload', token: 'test',
    } });
  });
  await page.route('https://supabase.test/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  await page.route('**/api/submit-quote', (r) => {
    submitted = r.request().postDataJSON();
    return r.fulfill({ status: 201, json: {
      short_code: 'GK-123456', public_token: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    } });
  });
  await page.goto('/estudio/?debug=1');
  await page.waitForFunction(() => window.__studio?.stage);
  await page.getByRole('radio', { name: 'Pulsera' }).click();
  await expect(page.getByText('Color base', { exact: false })).toBeVisible();
  await expect(page.locator('.es-panel-prenda').getByText('Técnica de personalización')).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles(IMAGE);
  await page.waitForFunction(() => window.__studio?.transform && window.__studio.garment.slug === 'pulsera');
  await expect(page.locator('.es-resumen-submit')).toBeDisabled();

  await page.getByRole('radio', { name: 'Azul', exact: true }).click();
  await page.waitForFunction(() => window.__studio.colorHex === '#2675D0');
  const before = await page.locator('.es-bracelet-canvas').evaluate((c) => c.toDataURL());
  await page.getByRole('radio', { name: 'Rojo' }).click();
  await page.waitForFunction(() => window.__studio.colorHex === '#D72E50');
  const red = await page.locator('.es-bracelet-canvas').evaluate((c) => c.toDataURL());
  expect(red === before).toBe(false);

  await page.evaluate(() => {
    const ctx = document.querySelector('.es-bracelet-canvas').getContext('2d');
    window.__braceletBeforeMove = {
      flat: Array.from(ctx.getImageData(180, 185, 640, 65).data),
      curved: Array.from(ctx.getImageData(200, 525, 600, 110).data),
    };
  });
  const oldX = await page.evaluate(() => window.__studio.transform.x);
  await page.evaluate(() => window.__studio.stage.nudge(60, 0));
  await page.waitForFunction((x) => window.__studio.transform.x > x, oldX);
  const moved = await page.locator('.es-bracelet-canvas').evaluate((c) => c.toDataURL());
  expect(moved === red).toBe(false);
  const changedPixels = await page.evaluate(() => {
    const ctx = document.querySelector('.es-bracelet-canvas').getContext('2d');
    return Object.entries({ flat: [180, 185, 640, 65], curved: [200, 525, 600, 110] })
      .map(([view, rect]) => {
        const after = ctx.getImageData(...rect).data;
        const before = window.__braceletBeforeMove[view];
        let changed = 0;
        for (let i = 0; i < after.length; i += 4) {
          if (Math.abs(after[i] - before[i]) + Math.abs(after[i + 1] - before[i + 1])
            + Math.abs(after[i + 2] - before[i + 2]) > 30) changed++;
        }
        return changed;
      });
  });
  expect(changedPixels[0], 'imagen movida en tira plana').toBeGreaterThan(100);
  expect(changedPixels[1], 'imagen movida en banda curva').toBeGreaterThan(100);
  await page.locator('input[type=file]').setInputFiles(REPLACEMENT);
  await page.waitForFunction(() => window.__studioBridge.logo?.name === 'logo-transparente.png');
  const replaced = await page.locator('.es-bracelet-canvas').evaluate((c) => c.toDataURL());
  expect(replaced === moved).toBe(false);
  await page.getByRole('button', { name: 'Quitar imagen' }).click();
  await expect(page.locator('.es-resumen-submit')).toBeDisabled();
  await page.locator('input[type=file]').setInputFiles(IMAGE);
  await page.waitForFunction(() => window.__studioBridge.logo?.name === 'logo-opaco.png');
  const snapshot = await page.evaluate(async () => {
    const blob = await window.__studio.stage.snapshot();
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height, type: blob.type };
    bitmap.close();
    return size;
  });
  expect(snapshot).toEqual({ width: 1000, height: 720, type: 'image/png' });

  await page.evaluate(() => { window.__opened = null; window.open = (url) => { window.__opened = url; }; });
  await page.locator('#es-talla-U').fill('1,000');
  await expect(page.locator('.es-resumen-submit')).toBeDisabled();
  await page.locator('#es-talla-U').fill('101');
  await page.locator('#es-customer-name').fill('Ana Ruiz');
  await page.locator('#es-customer-email').fill('ana@ejemplo.mx');
  await page.locator('#es-customer-phone').fill('55 1234 5678');
  await page.locator('.es-resumen-submit').click();
  await page.waitForFunction(() => window.__opened);
  expect(uploads.map((u) => u.kind)).toEqual(['logo', 'preview']);
  expect(submitted.items[0].technique_id).toBeNull();
  expect(submitted.items[0].size_breakdown).toEqual({ U: 101 });
  const message = await page.evaluate(() => decodeURIComponent(window.__opened));
  expect(message).toContain('GK-123456');
  expect(message).toContain('Color: Rojo');
  expect(message).toContain('Cantidad: 101 piezas');
  expect(message).toContain('/estudio/pedido/?t=');
  expect(message).toContain('archivos');
});

test('la liga del pedido muestra tira y pulsera, cantidad y técnica pendiente', async ({ page }) => {
  await page.route('**/api/order-status*', (r) => r.fulfill({ json: {
    short_code: 'GK-123456', status: 'quoted', customer_name: 'Ana',
    total_cents: null, items: [{
      render_type: 'bracelet', garment: 'Pulsera', color_hex: '#D72E50',
      color_name: 'Rojo', technique: null, qty: 48, size_breakdown: { U: 48 },
      preview_url: '/tests/fixtures/logo-opaco.png', logo_url: '/tests/fixtures/logo-opaco.png',
    }],
  } }));
  await page.goto('/estudio/pedido/?t=9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
  await expect(page.getByRole('img', { name: /Tira plana y pulsera cerrada/ })).toBeVisible();
  await expect(page.locator('.es-pedido-datos')).toContainText('48 piezas');
  await expect(page.locator('.es-pedido-datos')).toContainText('Pendiente de confirmar');
  await expect(page.getByRole('link', { name: 'Descargar imagen original' })).toBeVisible();
});
