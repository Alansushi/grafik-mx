import { test, expect } from '@playwright/test';
import { rotatedAabb, rectContains } from '../../estudio/lib/geometry.js';
import { CATALOG_FIXTURE } from '../fixtures/catalog.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Flujo completo del configurador: prenda → logo → tallas → precio.
// El backend se falsea con page.route(), así que este proyecto corre hermético
// igual que canvas.spec.js — sin Supabase, sin cuentas, sin red real.

const LOGO_PNG = fileURLToPath(new URL('../fixtures/logo-transparente.png', import.meta.url));

/** Respuesta de /api/quote coherente con el seed: playera DTF, 12 piezas. */
const QUOTE_12 = {
  currency: 'MXN',
  total_cents: 180000,
  is_placeholder: true,
  items: [{
    index: 0, garment_slug: 'playera', qty: 12,
    unit_price_cents: 15000, subtotal_cents: 180000,
    size_surcharge_cents: 0, total_cents: 180000,
    lines: [{ label: 'Subtotal', qty: 12, unit_cents: 15000, amount_cents: 180000 }],
  }],
};

async function abrir(page, { quote = QUOTE_12 } = {}) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.route('**/api/catalog', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG_FIXTURE) }));
  await page.route('**/api/quote', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(quote) }));

  await page.goto('/estudio/?debug=1');
  await page.waitForFunction(() => window.__studio?.stage, null, { timeout: 20000 });
  return errors;
}

test.describe('flujo del configurador', () => {
  test('F1. la UI monta completa y sin errores de consola', async ({ page }) => {
    const errors = await abrir(page);

    // Los cuatro paneles presentes: prenda, logo, tallas y resumen.
    await expect(page.getByRole('heading', { name: /tu prenda/i })).toBeVisible();
    await expect(page.locator('.es-dropzone')).toBeVisible();
    await expect(page.locator('.es-tallas-grid')).toBeVisible();

    expect(errors, `errores en consola: ${errors.join(' | ')}`).toEqual([]);
  });

  test('F2. cambiar de prenda RECREA el stage con su propia área imprimible', async ({ page }) => {
    await abrir(page);

    const playera = await page.evaluate(() => window.__studio.stage.debugInfo().printArea);
    await page.evaluate(() => window.__studioBridge.setGarmentBySlug('gorra'));
    await page.waitForFunction(
      (antes) => {
        const a = window.__studio.stage?.debugInfo().printArea;
        return a && (a.y !== antes.y || a.height !== antes.height);
      },
      playera,
      { timeout: 10000 },
    );
    const gorra = await page.evaluate(() => window.__studio.stage.debugInfo().printArea);

    // El bug que arreglé del incremento 7: antes la gorra heredaba el área de
    // la playera y el logo quedaba colocado donde no se imprime.
    // Fracciones del catálogo: playera y=0.26 h=0.34 · gorra y=0.38 h=0.20.
    expect(gorra.y).toBeGreaterThan(playera.y);
    expect(gorra.height).toBeLessThan(playera.height);
  });

  test('F3. subir un logo lo coloca dentro del área imprimible', async ({ page }) => {
    await abrir(page);
    await page.locator('input[type="file"]').first().setInputFiles(LOGO_PNG);
    await page.waitForFunction(() => window.__studio.transform !== null, null, { timeout: 10000 });

    const { transform, printArea } = await page.evaluate(() => ({
      transform: window.__studio.transform,
      printArea: window.__studio.stage.debugInfo().printArea,
    }));
    const natural = { width: 200, height: 80 }; // el fixture real
    expect(rectContains(printArea, rotatedAabb(transform, natural), 0.01)).toBe(true);
  });

  test('F4. arrastrar 400 px fuera del área: el AABB rotado sigue contenido', async ({ page }) => {
    await abrir(page);
    await page.locator('input[type="file"]').first().setInputFiles(LOGO_PNG);
    await page.waitForFunction(() => window.__studio.transform !== null, null, { timeout: 10000 });

    // Rotado y empujado muy lejos: las dos cosas a la vez, que es donde un
    // clamp ingenuo falla — el AABB de un rectángulo rotado es más grande que
    // el rectángulo, así que acotar la posición sin considerar la rotación
    // deja que las esquinas se salgan.
    await page.evaluate(() => {
      const s = window.__studio.stage;
      s.setTransform({ ...s.getTransform(), rotation: 37 });
    });

    const caja = await page.locator('#es-stage').boundingBox();
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height * 0.42);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width / 2 + 400, caja.y + caja.height * 0.42 + 400, { steps: 12 });
    await page.mouse.up();

    const { transform, printArea } = await page.evaluate(() => ({
      transform: window.__studio.stage.getTransform(),
      printArea: window.__studio.stage.debugInfo().printArea,
    }));
    const natural = { width: 200, height: 80 };
    const caja2 = rotatedAabb(transform, natural);
    expect(
      rectContains(printArea, caja2, 0.01),
      `el logo se salió: aabb=${JSON.stringify(caja2)} area=${JSON.stringify(printArea)}`,
    ).toBe(true);
  });

  test('F5. capturar tallas pide el precio AL SERVIDOR y lo muestra', async ({ page }) => {
    let pedidos = 0;
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.route('**/api/catalog', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG_FIXTURE) }));
    await page.route('**/api/quote', async (r) => {
      pedidos += 1;
      const body = JSON.parse(r.request().postData() ?? '{}');
      // El cliente NUNCA manda precios: sólo qué, con qué técnica y cuántas.
      expect(JSON.stringify(body)).not.toMatch(/cents|price|total/i);
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QUOTE_12) });
    });

    await page.goto('/estudio/?debug=1');
    await page.waitForFunction(() => window.__studio?.stage, null, { timeout: 20000 });

    await page.evaluate(() => window.__studioBridge.setSize('M', '12'));
    await page.waitForFunction(() => window.__studio.quote !== null, null, { timeout: 10000 });

    expect(pedidos).toBeGreaterThan(0);
    // $1,800.00 — formateado por formatCentsMXN, no a mano en el componente.
    await expect(page.getByText('$1,800.00').first()).toBeVisible();
    // Y el aviso de que son precios de referencia, porque is_placeholder=true.
    await expect(page.getByText(/referencia/i).first()).toBeVisible();
    expect(errors, `errores en consola: ${errors.join(' | ')}`).toEqual([]);
  });

  test('F6. las cantidades en string no se concatenan', async ({ page }) => {
    // El input del DOM entrega strings. Antes se concatenaban y un pedido de
    // 12 piezas se cotizaba como 57, cobrando casi 4x de más. Este caso
    // comprueba que el camino real desde la UI produce el total correcto.
    let visto = null;
    await page.route('**/api/catalog', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG_FIXTURE) }));
    await page.route('**/api/quote', async (r) => {
      visto = JSON.parse(r.request().postData() ?? '{}');
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QUOTE_12) });
    });

    await page.goto('/estudio/?debug=1');
    await page.waitForFunction(() => window.__studio?.stage, null, { timeout: 20000 });

    await page.evaluate(() => {
      window.__studioBridge.setSize('M', '5');
      window.__studioBridge.setSize('L', '7');
    });
    await page.waitForFunction(() => window.__studio.quote !== null, null, { timeout: 10000 });

    const bd = visto.items[0].size_breakdown;
    expect(bd.M).toBe(5);
    expect(bd.L).toBe(7);
    expect(Object.values(bd).reduce((a, b) => a + b, 0)).toBe(12); // no 57
  });

  // ── Hallazgos de la puerta de revisión del incremento 8 ──────────────────

  test('F7. una cantidad no numérica AVISA, no revierte en silencio', async ({ page }) => {
    // Era un catch vacío: pegar "1,000" desde Excel hacía que el campo
    // revirtiera al valor anterior sin ningún mensaje. En un pedido por
    // volumen eso termina en la cantidad equivocada y nadie se entera.
    await abrir(page);
    await page.evaluate(() => window.__studioBridge.setSize('M', '12'));
    await page.waitForFunction(() => window.__studio.quote !== null, null, { timeout: 10000 });

    await page.evaluate(() => window.__studioBridge.setSize('M', '1,000'));

    // El aviso aparece...
    await expect(page.getByText(/sólo números/i).first()).toBeVisible();
    // ...y el campo muestra lo que el cliente tecleó, no el valor anterior:
    // un mensaje sobre algo que no se ve sería igual de confuso.
    await expect(page.locator('#es-talla-M')).toHaveValue('1,000');
  });

  test('F8. sin logo colocado no se puede enviar el pedido', async ({ page }) => {
    // canSubmit exige transform además de logo. Si el stage fallara al montar,
    // el logo quedaría "adjunto" pero sin posición real, y el pedido habría
    // salido con el logo sin colocar.
    await abrir(page);
    await page.evaluate(() => window.__studioBridge.setSize('M', '12'));
    await page.waitForFunction(() => window.__studio.quote !== null, null, { timeout: 10000 });
    await page.locator('#es-customer-email').fill('cliente@ejemplo.mx');

    // Con cotización y correo pero SIN logo, el botón sigue bloqueado.
    await expect(page.locator('.es-resumen-submit')).toBeDisabled();

    await page.locator('input[type="file"]').first().setInputFiles(LOGO_PNG);
    await page.waitForFunction(() => window.__studio.transform !== null, null, { timeout: 10000 });
    await expect(page.locator('.es-resumen-submit')).toBeEnabled();
  });
});
