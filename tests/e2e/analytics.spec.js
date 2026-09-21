import { test, expect } from '@playwright/test';

// analytics.js contra una página fixture, con /api/track interceptado: hermético
// y sin Supabase. Lo que se comprueba es el contrato del cliente —qué evento
// sale, cuándo, y con qué contexto— más las garantías de privacidad (opt-out).
//
// El CONTRATO con el servidor (qué cta_id existen) lo vigila
// tests/unit/events.test.js contra el index.html real.

const PAGE = '/tests/fixtures/analytics-page.html';

/** Instala el interceptor y devuelve lo que llegue a /api/track. */
async function preparar(page, { force = true, dnt = false } = {}) {
  const lotes = [];
  await page.addInitScript(([f, d]) => {
    if (f) window.grafikAnalyticsConfig = { force: true };
    if (d) Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
  }, [force, dnt]);
  await page.route('**/api/track', async (route) => {
    lotes.push(JSON.parse(route.request().postData()));
    await route.fulfill({ status: 204 });
  });
  return {
    lotes,
    eventos: () => lotes.flatMap((l) => l.events),
    clics: () => lotes.flatMap((l) => l.events).filter((e) => e.name === 'cta_click'),
  };
}

// Ventana en la que un page_view YA habría salido (cola de 2 s) si se estuviera
// enviando algo: las pruebas de "no se envía nada" esperan más que eso.
const MAS_QUE_LA_COLA = 2600;

test.describe('analytics.js — eventos', () => {
  test('1. page_view al cargar, con sid de sesión y contexto de dispositivo', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await expect.poll(() => t.eventos().length, { timeout: 5000 }).toBeGreaterThan(0);

    const [lote] = t.lotes;
    expect(lote.sid).toMatch(/^[a-z0-9]{12}$/);
    expect(lote.events[0]).toMatchObject({ name: 'page_view', path: '/tests/fixtures/analytics-page.html' });
    expect(lote.events[0].t_ms).toBeGreaterThanOrEqual(0);
    expect(lote.ctx).toMatchObject({ device: 'desktop', referrer_host: null, utm_source: null });
    expect(lote.ctx.vw).toBe(page.viewportSize().width);
  });

  test('2. clic en un CTA de WhatsApp sale de inmediato, sin esperar la cola de 2 s', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#wa');
    await expect.poll(() => t.clics().length, { timeout: 1500 }).toBe(1);
    expect(t.clics()[0].props).toEqual({ cta_id: 'hero', kind: 'whatsapp' });
  });

  test('3. clic sobre el ícono interno del enlace cuenta como clic del enlace', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#ico');
    await expect.poll(() => t.clics().length, { timeout: 1500 }).toBe(1);
    expect(t.clics()[0].props.cta_id).toBe('hero');
  });

  test('4. enlace tel: → kind "tel"', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#tel');
    await expect.poll(() => t.clics().length, { timeout: 1500 }).toBe(1);
    expect(t.clics()[0].props).toEqual({ cta_id: 'contacto-tel', kind: 'tel' });
  });

  test('5. el lightbox lleva la categoría del trabajo (con acento)', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#lightbox');
    await expect.poll(() => t.clics().length, { timeout: 1500 }).toBe(1);
    expect(t.clics()[0].props).toEqual({ cta_id: 'lightbox', kind: 'whatsapp', work_cat: 'Pósters' });
  });

  test('6. enlaces sin data-cta, o con href que no es wa.me/tel:, no producen cta_click', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#sin-cta');
    await page.click('#href-raro');
    await page.waitForTimeout(MAS_QUE_LA_COLA);
    expect(t.clics()).toHaveLength(0);
    expect(t.eventos().some((e) => e.name === 'page_view')).toBe(true); // sí se está enviando
  });

  test('7. doble clic accidental = una sola intención', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.dblclick('#wa');
    await page.waitForTimeout(600);
    expect(t.clics()).toHaveLength(1);
  });

  test('8. clic con la rueda (pestaña nueva) también cuenta', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#wa', { button: 'middle' });
    await expect.poll(() => t.clics().length, { timeout: 1500 }).toBe(1);
  });

  test('9. grafikTrack manual (el formulario) viaja con su servicio', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#form');
    await expect.poll(() => t.clics().length, { timeout: 1500 }).toBe(1);
    expect(t.clics()[0].props).toEqual({ cta_id: 'contacto-form', kind: 'form', servicio: 'Lonas' });
  });

  // Playwright NO ve las peticiones que salen mientras la página se descarga (ni
  // como request, ni como response, ni como failed), así que /api/track
  // interceptado no sirve aquí. Lo observable es el lado del cliente: que en
  // pagehide se llame a sendBeacon, antes de que venza la cola de 2 s, con un
  // cuerpo JSON no vacío y que el navegador lo acepte. Que el servidor lo
  // reciba se comprueba en producción, no en esta suite.
  test('10. si el usuario se va antes de 2 s, pagehide entrega la cola con sendBeacon', async ({ page }) => {
    await page.addInitScript(() => {
      window.grafikAnalyticsConfig = { force: true };
      const original = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url, data) => {
        const aceptado = original(url, data);
        const previas = JSON.parse(sessionStorage.getItem('__beacons') || '[]');
        previas.push({ url, aceptado, tipo: data.type, bytes: data.size, ms: Math.round(performance.now()) });
        sessionStorage.setItem('__beacons', JSON.stringify(previas));
        return aceptado;
      };
    });
    await page.goto(PAGE);
    await page.goto('/robots.txt'); // mismo origen: permite leer sessionStorage tras la descarga
    const beacons = JSON.parse(await page.evaluate(() => sessionStorage.getItem('__beacons')));

    expect(beacons).toHaveLength(1);
    expect(beacons[0]).toMatchObject({ url: '/api/track', aceptado: true, tipo: 'application/json' });
    expect(beacons[0].bytes).toBeGreaterThan(0);
    expect(beacons[0].ms).toBeLessThan(2000); // salió por pagehide, no por el temporizador
  });
});

test.describe('analytics.js — contexto de sesión', () => {
  test('11. UTM y referrer se fijan al aterrizar y sobreviven a la siguiente carga', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(`${PAGE}?utm_source=instagram&utm_medium=bio&utm_campaign=sept`, { referer: 'https://l.instagram.com/' });
    await expect.poll(() => t.lotes.length, { timeout: 5000 }).toBe(1);
    expect(t.lotes[0].ctx).toMatchObject({
      referrer_host: 'l.instagram.com', utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'sept',
    });

    // Segunda carga en la misma pestaña, ya sin parámetros y con el propio sitio
    // como referrer: NO debe pisar la fuente real de la visita.
    await page.goto(PAGE);
    await expect.poll(() => t.lotes.length, { timeout: 5000 }).toBe(2);
    expect(t.lotes[1].sid).toBe(t.lotes[0].sid);
    expect(t.lotes[1].ctx).toMatchObject({ referrer_host: 'l.instagram.com', utm_source: 'instagram' });
  });

  test('12. cada pestaña nueva es otra sesión', async ({ browser }) => {
    const sids = [];
    for (let i = 0; i < 2; i++) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const t = await preparar(page);
      await page.goto(PAGE);
      await expect.poll(() => t.lotes.length, { timeout: 5000 }).toBe(1);
      sids.push(t.lotes[0].sid);
      await ctx.close();
    }
    expect(sids[0]).not.toBe(sids[1]);
  });
});

test.describe('analytics.js — móvil', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('13. viewport de 390 px → device "mobile"', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await expect.poll(() => t.lotes.length, { timeout: 5000 }).toBe(1);
    expect(t.lotes[0].ctx).toMatchObject({ device: 'mobile', vw: 390 });
  });
});

test.describe('analytics.js — privacidad y datos limpios', () => {
  test('14. ?notrack apaga la medición y persiste sin el parámetro; ?notrack=0 la reactiva', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(`${PAGE}?notrack`);
    await page.click('#wa');
    await page.waitForTimeout(MAS_QUE_LA_COLA);
    expect(t.lotes).toHaveLength(0);

    await page.goto(PAGE); // sin parámetro: la bandera de localStorage sigue puesta
    await page.click('#wa');
    await page.waitForTimeout(MAS_QUE_LA_COLA);
    expect(t.lotes).toHaveLength(0);

    await page.goto(`${PAGE}?notrack=0`);
    await expect.poll(() => t.lotes.length, { timeout: 5000 }).toBeGreaterThan(0);
  });

  test('15. Do Not Track → no se envía nada, pero grafikTrack existe y no lanza', async ({ page }) => {
    const t = await preparar(page, { dnt: true });
    await page.goto(PAGE);
    await page.click('#wa');
    await page.click('#form');
    await page.waitForTimeout(MAS_QUE_LA_COLA);
    expect(t.lotes).toHaveLength(0);
    expect(await page.evaluate(() => typeof window.grafikTrack)).toBe('function');
  });

  test('16. fuera de grafik.mx (localhost) no se envía nada salvo que se fuerce', async ({ page }) => {
    const t = await preparar(page, { force: false });
    await page.goto(PAGE);
    await page.click('#wa');
    await page.waitForTimeout(MAS_QUE_LA_COLA);
    expect(t.lotes).toHaveLength(0);
  });

  test('17. ?debug imprime los eventos en consola', async ({ page }) => {
    await preparar(page, { force: false });
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    await page.goto(`${PAGE}?debug`);
    await page.click('#wa');
    await expect.poll(() => logs.filter((l) => l.includes('[grafik:analytics]')).length, { timeout: 2000 }).toBeGreaterThanOrEqual(2);
  });

  test('18. si /api/track falla (500), la página no se rompe ni lanza errores', async ({ page }) => {
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.addInitScript(() => { window.grafikAnalyticsConfig = { force: true }; });
    await page.route('**/api/track', (r) => r.fulfill({ status: 500, body: 'x' }));
    await page.goto(PAGE);
    await page.click('#wa');
    await page.waitForTimeout(MAS_QUE_LA_COLA);
    expect(errores).toEqual([]);
  });
});
