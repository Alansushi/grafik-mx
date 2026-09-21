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

// ── Fase 2 ────────────────────────────────────────────────────────────────
// El servidor sólo acepta lo que declara api/_lib/events.js; aquí se comprueba
// que el cliente emite el evento correcto en el momento correcto.

// expect.poll NO sondea de forma continua: usa intervalos crecientes (100, 250,
// 500, 1000 ms). Con un plazo de 2500 ms las lecturas caen ~0/100/350/850/1850 y
// la siguiente en 2850, ya fuera de plazo: un lote que llega a los ~1940 ms se
// cuela en el hueco y la prueba falla sin que el cliente tenga ningún defecto.
// Los eventos con cola de 2 s se esperan con intervalo fijo y plazo holgado.
const ESPERA = { timeout: 5000, intervals: [150] };
const irA = (page, id) => page.evaluate((i) => document.getElementById(i).scrollIntoView(), id);
const de = (t, nombre) => () => t.eventos().filter((e) => e.name === nombre);

test.describe('analytics.js — interacciones secundarias', () => {
  test('19. nav_click distingue la barra de un botón de la página, e ignora el ancla vacía', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#nav-servicios');
    await page.waitForTimeout(900); // supera el antirrebote entre clics del mismo destino
    await page.click('#pagina-contacto');
    await page.click('#ancla-vacia');
    await expect.poll(() => de(t, 'nav_click')().length, ESPERA).toBe(2);
    expect(de(t, 'nav_click')().map((e) => e.props)).toEqual([
      { target: 'servicios', from: 'nav' },
      { target: 'contacto', from: 'page' },
    ]);
    expect(t.clics()).toHaveLength(0); // un ancla no es un CTA
  });

  test('20. work_open lleva slug y categoría (opcional); el doble clic cuenta una vez', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.dblclick('#work1');
    await page.waitForTimeout(900);
    await page.click('#work2');
    await expect.poll(() => de(t, 'work_open')().length, ESPERA).toBe(2);
    expect(de(t, 'work_open')().map((e) => e.props)).toEqual([
      { slug: 'boletos-arrolladora', cat: 'Boletos' },
      { slug: 'poster-papantla' },
    ]);
  });

  test('21. faq_open: slug sin acentos ni signos, una vez por pregunta, y sólo si tiene data-faq', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#faq1 summary'); // abre
    await page.click('#faq1 summary'); // cierra
    await page.click('#faq1 summary'); // reabre: no cuenta otra vez
    await page.click('#faq2 summary');
    await page.click('#faq-sin-marca summary');
    await expect.poll(() => de(t, 'faq_open')().length, ESPERA).toBe(2);
    await page.waitForTimeout(300);
    expect(de(t, 'faq_open')().map((e) => e.props.q)).toEqual([
      'cuanto-tarda-una-impresion',
      'hacen-envios-a-otros-estados',
    ]);
  });

  test('21b. faq_open con una pregunta larguísima: <= 60, sin cortar palabras y sin guion final', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#faq-larga summary');
    await expect.poll(() => de(t, 'faq_open')().length, ESPERA).toBe(1);
    const q = de(t, 'faq_open')()[0].props.q;
    expect(q).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(q.length).toBeLessThanOrEqual(60);
    // Se corta en un guion: el resto de la pregunta empieza por una palabra entera.
    expect('cuanto-tiempo-tarda-la-produccion-de-lonas-e-impresion-en-gran-formato-para-eventos-y-ferias')
      .toMatch(new RegExp('^' + q + '-'));
  });

  test('22. form_start: sólo dentro del formulario, una vez, y NUNCA transporta lo escrito', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#fuera');
    await page.fill('#fuera', 'no es del formulario');
    await page.waitForTimeout(300);
    expect(de(t, 'form_start')()).toHaveLength(0);

    await page.click('#nombre');
    await page.fill('#nombre', 'Juanito Prueba');
    await page.click('#detalle');
    await page.fill('#detalle', 'texto secreto del pedido');
    await page.click('#chip'); // clic dentro del formulario: no es un segundo inicio
    await expect.poll(() => de(t, 'form_start')().length, ESPERA).toBe(1);
    await page.waitForTimeout(MAS_QUE_LA_COLA);

    expect(de(t, 'form_start')()).toHaveLength(1);
    expect(de(t, 'form_start')()[0].props).toEqual({});
    const todo = JSON.stringify(t.lotes);
    expect(todo).not.toContain('Juanito');
    expect(todo).not.toContain('secreto');
    expect(todo).not.toContain('no es del formulario');
  });

  test('23. form_start también se dispara con un clic en el formulario (Safari no enfoca los botones)', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#chip');
    await expect.poll(() => de(t, 'form_start')().length, ESPERA).toBe(1);
  });
});

test.describe('analytics.js — secciones vistas', () => {
  test('24. una sección cuenta tras 800 ms visible, una sola vez por sesión', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await irA(page, 'servicios');
    await page.waitForTimeout(400);
    expect(de(t, 'section_view')()).toHaveLength(0); // aún no cumple el tiempo
    await expect.poll(() => de(t, 'section_view')().length, ESPERA).toBe(1);
    expect(de(t, 'section_view')()[0].props).toEqual({ section: 'servicios' });

    await page.evaluate(() => window.scrollTo(0, 0));
    await irA(page, 'servicios'); // volver a verla no la cuenta de nuevo
    await page.waitForTimeout(MAS_QUE_LA_COLA);
    expect(de(t, 'section_view')().filter((e) => e.props.section === 'servicios')).toHaveLength(1);
  });

  test('25. una sección que sólo se cruza de paso no cuenta', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await irA(page, 'trabajos');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);
    expect(de(t, 'section_view')().filter((e) => e.props.section === 'trabajos')).toHaveLength(0);
  });

  test('26. el hero (#top) y el .ssr-fallback nunca emiten section_view, aunque estén visibles', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.waitForTimeout(MAS_QUE_LA_COLA);
    expect(de(t, 'section_view')()).toHaveLength(0);
    expect(t.eventos().some((e) => e.name === 'page_view')).toBe(true);
  });

  test('27. data-section (bloques sin id) y varias secciones seguidas', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    for (const id of ['faqs', 'contacto']) {
      await irA(page, id);
      await page.waitForTimeout(1000);
    }
    await page.evaluate(() => document.querySelector('footer').scrollIntoView());
    await expect.poll(() => de(t, 'section_view')().map((e) => e.props.section).sort(), ESPERA)
      .toEqual(['contacto', 'faqs', 'footer']);
  });

  test('29. la sección anterior que sólo asoma bajo el menú fijo (~100 px) no cuenta como vista', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    // Saltar a #faqs dejando 100 px de margen arriba, como hace scroll-padding-top
    // con el menú pegajoso: #servicios queda con sus últimos 100 px a la vista.
    await page.evaluate(() => window.scrollTo(0, document.getElementById('faqs').offsetTop - 100));
    await expect.poll(() => de(t, 'section_view')().map((e) => e.props.section), ESPERA).toContain('faqs');
    await page.waitForTimeout(1200);
    expect(de(t, 'section_view')().map((e) => e.props.section)).not.toContain('servicios');
  });

  test('28. secciones que React añade DESPUÉS de cargar analytics.js también se observan', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.evaluate(() => {
      const s = document.createElement('section');
      s.id = 'proceso';
      s.style.height = '600px';
      document.body.appendChild(s);
    });
    await irA(page, 'proceso');
    await expect.poll(() => de(t, 'section_view')().map((e) => e.props.section), ESPERA).toContain('proceso');
  });
});

test.describe('analytics.js — Fase 3 (estudio)', () => {
  test('31. un enlace con data-event emite ese evento con su `where`', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#respaldo');
    await expect.poll(() => de(t, 'studio_fallback')().length, ESPERA).toBe(1);
    expect(de(t, 'studio_fallback')()[0].props).toEqual({ where: 'konva' });
    expect(t.clics()).toHaveLength(0); // es otro evento, no un cta_click del sitio
  });

  test('32. el clic con la rueda en ese enlace también cuenta, y el doble clic no se duplica', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#respaldo', { button: 'middle' });
    await page.waitForTimeout(900);
    await page.dblclick('#respaldo');
    await expect.poll(() => de(t, 'studio_fallback')().length, ESPERA).toBe(2);
    await page.waitForTimeout(300);
    expect(de(t, 'studio_fallback')()).toHaveLength(2); // rueda + un doble clic (= uno)
  });

  test('33. studio_submit sale DE INMEDIATO: tras él el cliente salta a WhatsApp y la pestaña queda oculta', async ({ page }) => {
    const t = await preparar(page);
    await page.goto(PAGE);
    await page.click('#enviar-pedido');
    // Antes de que venza la cola de 2 s: igual que un cta_click.
    await expect.poll(() => de(t, 'studio_submit')().length, { timeout: 1500, intervals: [100] }).toBe(1);
    expect(de(t, 'studio_submit')()[0].props).toEqual({ short_code: 'GK-7A3F1C', qty: 12 });
  });
});
