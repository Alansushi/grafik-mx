import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { CATALOG_FIXTURE } from '../fixtures/catalog.js';
import { validateBatch } from '../../api/_lib/events.js';

// El embudo de /estudio/ visto desde el navegador: se recorre el configurador con
// la UI real (el puente ?debug=1 sólo se usa para meter tallas, como en F9) y se
// comprueba qué llega a /api/track. Hermético: catálogo, cotización, subidas y
// envío del pedido van falseados con page.route().
//
// La segunda mitad de cada prueba es el contrato con el servidor: lo capturado se
// pasa por el validador REAL (api/_lib/events.js). Si el cliente y el servidor
// discreparan en un evento, un slug o un `where`, aquí saldría como "descartado".

const LOGO_PNG = fileURLToPath(new URL('../fixtures/logo-transparente.png', import.meta.url));

const QUOTE_12 = {
  currency: 'MXN', total_cents: 180000, is_placeholder: true,
  items: [{
    index: 0, garment_slug: 'playera', qty: 12,
    unit_price_cents: 15000, subtotal_cents: 180000,
    size_surcharge_cents: 0, total_cents: 180000,
    lines: [{ label: 'Subtotal', qty: 12, unit_cents: 15000, amount_cents: 180000 }],
  }],
};

// Ver el comentario de ESPERA en analytics.spec.js: expect.poll deja huecos.
const ESPERA = { timeout: 6000, intervals: [150] };
// Más que la cola de 2 s: un evento que se estuviera enviando ya habría salido.
const MAS_QUE_LA_COLA = 2600;

/**
 * Falsea el backend e intercepta /api/track. `opts` permite forzar cada fallo.
 * Devuelve helpers para leer los eventos capturados.
 */
async function preparar(page, opts = {}) {
  const {
    catalogStatus = 200,
    quote = { status: 200, body: QUOTE_12 },
    submit = {
      status: 201,
      body: { short_code: 'GK-7A3F1C', public_token: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', total_cents: 180000, currency: 'MXN', is_placeholder: true },
    },
    bloquearKonva = false,
    bloquearAnalytics = false,
  } = opts;

  const lotes = [];
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));

  await page.addInitScript(() => {
    window.grafikAnalyticsConfig = { force: true };
    window.__abierto = null;
    window.open = (url) => { window.__abierto = url; return null; }; // no abrir WhatsApp de verdad
    document.addEventListener('click', (e) => {
      if (e.target.closest('a[href^="https://wa.me"]')) e.preventDefault();
    });
  });

  if (bloquearKonva) await page.route('**/konva.min.js', (r) => r.abort());
  if (bloquearAnalytics) await page.route('**/analytics.js', (r) => r.abort());

  await page.route('**/api/track', async (r) => {
    lotes.push(JSON.parse(r.request().postData()));
    await r.fulfill({ status: 204 });
  });
  await page.route('**/api/catalog', (r) => catalogStatus === 200
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG_FIXTURE) })
    : r.fulfill({ status: catalogStatus, contentType: 'application/json', body: '{"error":"boom"}' }));
  await page.route('**/api/quote', (r) =>
    r.fulfill({ status: quote.status, contentType: 'application/json', body: JSON.stringify(quote.body) }));
  await page.route('**/api/upload-url', async (r) => {
    const b = JSON.parse(r.request().postData() ?? '{}');
    await r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        bucket: b.kind === 'logo' ? 'logos' : 'previews',
        path: `2026/09/${b.draftId}/archivo-abc123.png`,
        upload_url: 'https://supabase.test/storage/v1/object/upload/sign/x?token=t',
        token: 'tok', max_bytes: 8388608,
      }),
    });
  });
  await page.route('https://supabase.test/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  await page.route('**/api/submit-quote', (r) =>
    r.fulfill({ status: submit.status, contentType: 'application/json', body: JSON.stringify(submit.body) }));

  const eventos = () => lotes.flatMap((l) => l.events);
  return {
    lotes, errores, eventos,
    de: (nombre) => eventos().filter((e) => e.name === nombre),
    nombres: () => eventos().map((e) => e.name),
    /** Todo lo capturado pasa por el validador real del servidor sin descartes. */
    validarContraServidor() {
      let descartados = 0;
      for (const lote of lotes) {
        const r = validateBatch(lote);
        expect(r.ok, JSON.stringify(r)).toBe(true);
        descartados += r.dropped;
      }
      expect(descartados, 'eventos que el servidor descartaría').toBe(0);
    },
  };
}

async function abrir(page) {
  await page.goto('/estudio/?debug=1');
  await page.waitForFunction(() => window.__studio?.stage, null, { timeout: 20000 });
}
const subirLogo = async (page) => {
  await page.locator('input[type="file"]').first().setInputFiles(LOGO_PNG);
  await page.waitForFunction(() => window.__studio.transform !== null, null, { timeout: 10000 });
};
const esperarStageLibre = (page) => expect(page.locator('.es-panel[aria-busy="true"]')).toHaveCount(0);

test.describe('estudio — embudo completo', () => {
  test('E1. el recorrido feliz emite cada paso, en orden, y no filtra nada del cliente', async ({ page }) => {
    const t = await preparar(page);
    await abrir(page);

    await page.getByRole('radio', { name: /gorra/i }).click();
    await esperarStageLibre(page);
    await subirLogo(page);
    await page.getByRole('button', { name: 'Ajustar al área' }).click();
    await page.evaluate(() => window.__studioBridge.setSize('M', '12'));
    await page.waitForFunction(() => window.__studio.quote !== null, null, { timeout: 10000 });
    await page.locator('#es-customer-name').fill('Ana Ruiz');
    await page.locator('#es-customer-email').fill('ana@ejemplo.mx');
    await page.locator('#es-customer-phone').fill('5512345678');
    await page.locator('.es-resumen-submit').click();
    await page.waitForFunction(() => window.__abierto !== null, null, { timeout: 15000 });
    await expect.poll(() => t.de('studio_submit').length, { timeout: 4000, intervals: [100] }).toBe(1);

    const PASOS = ['studio_ready', 'studio_garment', 'studio_logo', 'studio_placed', 'studio_sizes', 'studio_quote', 'studio_submit'];
    expect(t.nombres().filter((n) => PASOS.includes(n))).toEqual(PASOS);

    expect(t.de('studio_garment')[0].props).toEqual({ garment: 'gorra' });
    expect(t.de('studio_logo')[0].props).toEqual({ format: 'png', vector: false });
    expect(t.de('studio_sizes')[0].props).toEqual({ qty: 12 });
    expect(t.de('studio_quote')[0].props).toEqual({ qty: 12 });
    expect(t.de('studio_submit')[0].props).toEqual({ short_code: 'GK-7A3F1C', qty: 12 });

    // Todo cuelga de /estudio/, y llegar a "listo" tiene un tiempo medible.
    expect(t.de('page_view')[0].path).toBe('/estudio/');
    expect(t.de('studio_ready')[0].t_ms).toBeGreaterThan(0);

    // PRIVACIDAD: ni lo que escribió el cliente, ni el nombre de su archivo, ni dinero.
    const todo = JSON.stringify(t.lotes);
    for (const secreto of ['Ana Ruiz', 'ana@ejemplo.mx', '5512345678', 'logo-transparente', '180000']) {
      expect(todo, secreto).not.toContain(secreto);
    }
    // ...ni el borrador, que es la llave de sus archivos en Storage.
    expect(todo).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);

    t.validarContraServidor();
    expect(t.errores).toEqual([]);
  });

  test('E2. studio_placed NO se emite por el ajuste automático (subir el logo, cambiar de prenda), sólo por el cliente', async ({ page }) => {
    const t = await preparar(page);
    await abrir(page);
    await subirLogo(page); // encaja el logo solo: es un cambio de transform, pero del sistema
    await page.waitForTimeout(MAS_QUE_LA_COLA);
    expect(t.de('studio_placed')).toHaveLength(0);
    expect(t.de('studio_logo')).toHaveLength(1); // y el resto sí se está enviando

    // Cambiar de prenda RECREA el stage y reencaja el logo: tampoco cuenta.
    await page.getByRole('radio', { name: /gorra/i }).click();
    await esperarStageLibre(page);
    await page.waitForFunction(() => window.__studio.transform !== null);
    await page.waitForTimeout(MAS_QUE_LA_COLA);
    expect(t.de('studio_placed')).toHaveLength(0);

    // El cliente pulsa "Ajustar al área": ahora sí, y una sola vez.
    await page.getByRole('button', { name: 'Ajustar al área' }).click();
    await expect.poll(() => t.de('studio_placed').length, ESPERA).toBe(1);
    await page.getByRole('button', { name: 'Ajustar al área' }).click();
    await page.waitForTimeout(MAS_QUE_LA_COLA);
    expect(t.de('studio_placed')).toHaveLength(1);
  });

  test('E3. studio_garment sólo cuando la prenda CAMBIA (el botón de la ya elegida también llama a onGarment)', async ({ page }) => {
    const t = await preparar(page);
    await abrir(page);
    await page.getByRole('radio', { name: /playera/i }).click(); // ya está elegida
    await page.getByRole('radio', { name: /gorra/i }).click();
    await esperarStageLibre(page);
    await page.getByRole('radio', { name: /gorra/i }).click(); // otra vez la misma
    await page.getByRole('radio', { name: /playera/i }).click();
    await esperarStageLibre(page);
    await expect.poll(() => t.de('studio_garment').length, ESPERA).toBe(2);
    await page.waitForTimeout(MAS_QUE_LA_COLA);
    expect(t.de('studio_garment').map((e) => e.props.garment)).toEqual(['gorra', 'playera']);
    t.validarContraServidor();
  });
});

test.describe('estudio — señales de fricción', () => {
  test('E4. pedir menos del mínimo: se mide el código accionable (BELOW_MIN), una sola vez, y no hay studio_quote', async ({ page }) => {
    const t = await preparar(page, {
      quote: { status: 400, body: { error: 'INVALID_BREAKDOWN', details: [{ code: 'BELOW_MIN' }] } },
    });
    await abrir(page);
    await page.evaluate(() => window.__studioBridge.setSize('M', '3'));
    await expect.poll(() => t.de('studio_error').length, ESPERA).toBe(1);
    await page.evaluate(() => window.__studioBridge.setSize('M', '4')); // otra cotización, mismo error
    await page.waitForTimeout(MAS_QUE_LA_COLA);

    expect(t.de('studio_error').map((e) => e.props)).toEqual([{ where: 'quote', code: 'BELOW_MIN' }]);
    expect(t.de('studio_sizes')[0].props).toEqual({ qty: 3 }); // llegó a poner tallas...
    expect(t.de('studio_quote')).toHaveLength(0);              // ...pero nunca vio un precio
    t.validarContraServidor();
  });

  test('E5. el aviso de resolución baja se emite al ENTRAR en cada nivel, no en cada arrastre', async ({ page }) => {
    const t = await preparar(page);
    await abrir(page);
    // El fixture mide 200x80 y se encaja al ancho con el headroom del fit
    // automático (INITIAL_FIT_HEADROOM en konva-adapter.js, 90% del techo): 18 dpi.
    await subirLogo(page);
    await expect.poll(() => t.de('studio_lowres').length, ESPERA).toBe(1);
    expect(t.de('studio_lowres')[0].props).toEqual({ level: 'fail', dpi: 18 });

    const escalar = (n) => page.evaluate((k) => {
      const s = window.__studio.stage;
      s.setTransform({ ...s.getTransform(), scaleX: k, scaleY: k });
    }, n);
    await escalar(0.2);   // warn
    await escalar(0.15);  // ok: no es un aviso
    await escalar(0.9);   // fail otra vez: ya se avisó de "fail" en esta sesión
    await escalar(0.21);  // warn otra vez
    await page.waitForTimeout(MAS_QUE_LA_COLA);

    expect(t.de('studio_lowres').map((e) => e.props.level)).toEqual(['fail', 'warn']);
    expect(Number.isInteger(t.de('studio_lowres')[1].props.dpi)).toBe(true);
    t.validarContraServidor();
  });

  test('E6. archivos rechazados: formato y tamaño, con la extensión de una lista cerrada y nunca el nombre', async ({ page }) => {
    const t = await preparar(page);
    await abrir(page);
    const entrada = page.locator('input[type="file"]').first();

    await entrada.setInputFiles({ name: 'diseño-CLIENTE-secreto.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await entrada.setInputFiles({ name: 'logo-final.cdr', mimeType: '', buffer: Buffer.from('CDR') });
    await entrada.setInputFiles({ name: 'enorme.png', mimeType: 'image/png', buffer: Buffer.alloc(8 * 1024 * 1024 + 1) });
    await expect.poll(() => t.de('studio_logo_rejected').length, ESPERA).toBe(3);

    expect(t.de('studio_logo_rejected').map((e) => e.props)).toEqual([
      { reason: 'type', ext: 'pdf' },
      { reason: 'type', ext: 'cdr' },
      { reason: 'size', ext: 'png' },
    ]);
    expect(t.de('studio_logo')).toHaveLength(0); // ninguno llegó a subirse
    expect(JSON.stringify(t.lotes)).not.toMatch(/CLIENTE|secreto|logo-final|enorme/);
    t.validarContraServidor();
  });

  test('E7. un pedido que falla al enviarse se mide con su código, y no hay studio_submit', async ({ page }) => {
    const t = await preparar(page, { submit: { status: 429, body: { error: 'RATE_LIMITED' } } });
    await abrir(page);
    await subirLogo(page);
    await page.evaluate(() => window.__studioBridge.setSize('M', '12'));
    await page.waitForFunction(() => window.__studio.quote !== null, null, { timeout: 10000 });
    await page.locator('#es-customer-email').fill('ana@ejemplo.mx');
    await page.locator('.es-resumen-submit').click();
    await expect.poll(() => t.de('studio_error').length, ESPERA).toBe(1);

    expect(t.de('studio_error')[0].props).toEqual({ where: 'submit', code: 'RATE_LIMITED' });
    expect(t.de('studio_submit')).toHaveLength(0);
    expect(t.errores).toEqual([]);
    t.validarContraServidor();
  });
});

test.describe('estudio — la medición nunca rompe un pedido', () => {
  test('E11. si window.grafikTrack LANZA en cada llamada, el pedido igual se crea y se abre WhatsApp', async ({ page }) => {
    const t = await preparar(page);
    // analytics.js respeta un grafikTrack ya definido; éste falla siempre.
    await page.addInitScript(() => { window.grafikTrack = () => { throw new Error('la medición explotó'); }; });
    await abrir(page);
    await subirLogo(page);
    await page.getByRole('radio', { name: /gorra/i }).click();
    await esperarStageLibre(page);
    await page.evaluate(() => window.__studioBridge.setSize('M', '12'));
    await page.waitForFunction(() => window.__studio.quote !== null, null, { timeout: 10000 });
    await page.locator('#es-customer-email').fill('ana@ejemplo.mx');
    await page.locator('.es-resumen-submit').click();
    await page.waitForFunction(() => window.__abierto !== null, null, { timeout: 15000 });

    const url = await page.evaluate(() => window.__abierto);
    expect(url).toContain('wa.me/525539014600');
    expect(decodeURIComponent(url)).toContain('GK-7A3F1C'); // el folio del pedido recién creado
    expect(t.errores).toEqual([]);                          // y ninguna excepción llegó a la página
    expect(t.eventos()).toHaveLength(0);                    // porque nada se llegó a medir
  });
});

test.describe('estudio — degradaciones al arrancar', () => {
  test('E8. si el catálogo no carga: se mide el error y el clic al WhatsApp de respaldo', async ({ page }) => {
    const t = await preparar(page, { catalogStatus: 500 });
    await page.goto('/estudio/');
    await expect(page.locator('#es-app')).toHaveAttribute('data-state', 'catalog-error');
    await page.locator('#es-notice-catalog a').click();
    await expect.poll(() => t.de('studio_fallback').length, ESPERA).toBe(1);

    expect(t.de('studio_error').map((e) => e.props)).toEqual([{ where: 'catalog' }]);
    expect(t.de('studio_fallback')[0].props).toEqual({ where: 'catalog' });
    expect(t.de('studio_ready')).toHaveLength(0);
    t.validarContraServidor();
  });

  test('E9. si Konva no carga del CDN: se mide el error y el clic al WhatsApp de respaldo', async ({ page }) => {
    const t = await preparar(page, { bloquearKonva: true });
    await page.goto('/estudio/');
    await expect(page.locator('#es-app')).toHaveAttribute('data-state', 'konva-unavailable');
    await page.locator('#es-notice-konva a').click();
    await expect.poll(() => t.de('studio_fallback').length, ESPERA).toBe(1);

    expect(t.de('studio_error').map((e) => e.props)).toEqual([{ where: 'konva' }]);
    expect(t.de('studio_fallback')[0].props).toEqual({ where: 'konva' });
    t.validarContraServidor();
  });

  test('E10. si analytics.js NO carga (bloqueador de anuncios), el configurador funciona igual y sin errores', async ({ page }) => {
    const t = await preparar(page, { bloquearAnalytics: true });
    await abrir(page);
    await expect(page.locator('#es-app')).toHaveAttribute('data-state', 'ready');
    await subirLogo(page);
    await page.evaluate(() => window.__studioBridge.setSize('M', '12'));
    await page.waitForFunction(() => window.__studio.quote !== null, null, { timeout: 10000 });
    await page.locator('#es-customer-email').fill('ana@ejemplo.mx');
    await page.locator('.es-resumen-submit').click();
    await page.waitForFunction(() => window.__abierto !== null, null, { timeout: 15000 });

    expect(t.eventos()).toHaveLength(0); // no se midió nada...
    expect(t.errores).toEqual([]);       // ...y no se rompió nada: el pedido salió a WhatsApp
  });
});
