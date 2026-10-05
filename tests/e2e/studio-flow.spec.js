import { test, expect } from '@playwright/test';
import { rotatedAabb, rectContains } from '../../estudio/lib/geometry.js';
import { CATALOG_FIXTURE } from '../fixtures/catalog.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Flujo completo del configurador: prenda → logo → tallas → precio.
// El backend se falsea con page.route(), así que este proyecto corre hermético
// igual que canvas.spec.js — sin Supabase, sin cuentas, sin red real.

const LOGO_PNG = fileURLToPath(new URL('../fixtures/logo-transparente.png', import.meta.url));

/** Etapa A no cotiza: espera a que el total de piezas deje de ser 0. */
const hayPiezas = (page) =>
  page.waitForFunction(
    () => document.querySelector('.es-tallas-total span:last-child')?.textContent !== '0',
    null, { timeout: 10000 },
  );

async function abrir(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.route('**/api/catalog', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG_FIXTURE) }));

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

  test('F5. capturar tallas NO pide ni muestra precios', async ({ page }) => {
    let pedidos = 0;
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.route('**/api/catalog', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG_FIXTURE) }));
    await page.route('**/api/quote', async (r) => { pedidos += 1; await r.abort(); });

    await page.goto('/estudio/?debug=1');
    await page.waitForFunction(() => window.__studio?.stage, null, { timeout: 20000 });

    await page.evaluate(() => window.__studioBridge.setSize('M', '12'));
    await hayPiezas(page);
    await page.waitForTimeout(600); // más que el debounce de tallas

    expect(pedidos).toBe(0);
    const resumen = await page.locator('.es-panel-resumen').innerText();
    expect(resumen).not.toMatch(/\$|precio|total|cotizando|referencia/i);
    expect(resumen).toContain('12 pzas');
    expect(errors, `errores en consola: ${errors.join(' | ')}`).toEqual([]);
  });

  test('F6. las cantidades en string no se concatenan', async ({ page }) => {
    // El input del DOM entrega strings. Antes se concatenaban y 5 + 7 salía 57.
    await abrir(page);
    await page.evaluate(() => {
      window.__studioBridge.setSize('M', '5');
      window.__studioBridge.setSize('L', '7');
    });
    await hayPiezas(page);
    await expect(page.locator('.es-tallas-total span:last-child')).toHaveText('12'); // no 57
  });

  test('F6b. sin mínimo: una sola pieza es válida', async ({ page }) => {
    await abrir(page);
    await page.evaluate(() => window.__studioBridge.setSize('M', '1'));
    await hayPiezas(page);
    await expect(page.locator('.es-tallas-total span:last-child')).toHaveText('1');
    await expect(page.locator('.es-tallas-errors')).toHaveCount(0);
  });

  // ── Hallazgos de la puerta de revisión del incremento 8 ──────────────────

  test('F7. una cantidad no numérica AVISA, no revierte en silencio', async ({ page }) => {
    // Era un catch vacío: pegar "1,000" desde Excel hacía que el campo
    // revirtiera al valor anterior sin ningún mensaje. En un pedido por
    // volumen eso termina en la cantidad equivocada y nadie se entera.
    await abrir(page);
    await page.evaluate(() => window.__studioBridge.setSize('M', '12'));
    await hayPiezas(page);

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
    await hayPiezas(page);
    await page.locator('#es-customer-name').fill('Ana Ruiz');
    await page.locator('#es-customer-email').fill('cliente@ejemplo.mx');
    await page.locator('#es-customer-phone').fill('55 1234 5678');

    // Con contacto completo pero SIN logo, el botón sigue bloqueado.
    await expect(page.locator('.es-resumen-submit')).toBeDisabled();

    await page.locator('input[type="file"]').first().setInputFiles(LOGO_PNG);
    await page.waitForFunction(() => window.__studio.transform !== null, null, { timeout: 10000 });
    await expect(page.locator('.es-resumen-submit')).toBeEnabled();
  });

  test('F9. enviar el pedido: sube archivos, crea la orden y abre WhatsApp', async ({ page }) => {
    const subidas = [];
    let cuerpoPedido = null;

    await page.route('**/api/catalog', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG_FIXTURE) }));
    await page.route('**/api/upload-url', async (r) => {
      const b = JSON.parse(r.request().postData() ?? '{}');
      subidas.push(b);
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

    await page.route('**/api/submit-quote', async (r) => {
      cuerpoPedido = JSON.parse(r.request().postData() ?? '{}');
      await r.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({
          short_code: 'GK-7A3F1C',
          public_token: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        }),
      });
    });

    await page.goto('/estudio/?debug=1');
    await page.waitForFunction(() => window.__studio?.stage, null, { timeout: 20000 });

    // window.open abriría una pestaña real; se intercepta para leer la URL.
    await page.evaluate(() => {
      window.__abierto = null;
      window.open = (url) => { window.__abierto = url; return null; };
    });

    await page.locator('input[type="file"]').first().setInputFiles(LOGO_PNG);
    await page.waitForFunction(() => window.__studio.transform !== null, null, { timeout: 10000 });
    await page.evaluate(() => window.__studioBridge.setSize('M', '12'));
    await hayPiezas(page);
    await page.locator('#es-customer-name').fill('Ana Ruiz');
    await page.locator('#es-customer-email').fill('ana@ejemplo.mx');
    await page.locator('#es-customer-phone').fill('55 1234 5678');

    await page.locator('.es-resumen-submit').click();
    await page.waitForFunction(() => window.__abierto !== null, null, { timeout: 15000 });

    // Se subieron los dos binarios, y ninguno cruzó api/*.
    expect(subidas.map((u) => u.kind).sort()).toEqual(['logo', 'preview']);

    // El cuerpo del pedido NO lleva precios: Etapa A no cotiza.
    expect(JSON.stringify(cuerpoPedido)).not.toMatch(/cents|unit_price|total/i);

    // Y todas las rutas pertenecen al MISMO borrador. Sin esto, un cliente
    // podría adjuntar a su pedido el archivo de otro y leerlo después con su
    // propia liga de order-status.
    const draftId = cuerpoPedido.draftId;
    expect(draftId).toMatch(/^[0-9a-f-]{36}$/);
    for (const it of cuerpoPedido.items) {
      expect(it.logo_path).toContain(`/${draftId}/`);
      expect(it.preview_path).toContain(`/${draftId}/`);
    }

    // El mensaje usa el folio que devolvió el SERVIDOR, no uno inventado aquí.
    const url = await page.evaluate(() => window.__abierto);
    expect(url).toContain('wa.me/525539014600');
    const texto = decodeURIComponent(url.split('text=')[1]);
    expect(texto).toContain('GK-7A3F1C');
    expect(texto).toContain('/estudio/pedido/?t=9b1deb4d');
    expect(texto).toContain('Ana Ruiz');
    expect(texto).toContain('ana@ejemplo.mx');
    expect(texto).toContain('55 1234 5678');
    expect(texto).not.toMatch(/\$|total|precio/i);
  });

  test('F10. la guía del área imprimible se adapta al color de la prenda', async ({ page }) => {
    // El trazo era fijo, casi blanco. Con el mockup procedural (gris medio)
    // siempre contrastaba, así que nadie lo notó; con la foto real de una
    // playera BLANCA la guía desaparece y el cliente deja de ver dónde puede
    // colocar su logo. Se comprueba la DECISIÓN, no el píxel: el trazo es una
    // línea punteada de 1 px y muestrearla sería frágil.
    await abrir(page);

    await page.evaluate(() => window.__studioBridge.setColor('#0C0C0C'));
    await page.waitForFunction(
      () => window.__studio.stage?.debugInfo().printAreaGuideStroke?.includes('240'),
      null,
      { timeout: 10000 },
    );
    const sobreOscura = await page.evaluate(() => window.__studio.stage.debugInfo().printAreaGuideStroke);

    await page.evaluate(() => window.__studioBridge.setColor('#FFFFFF'));
    await page.waitForFunction(
      () => window.__studio.stage?.debugInfo().printAreaGuideStroke?.includes('12,12,12'),
      null,
      { timeout: 10000 },
    );
    const sobreClara = await page.evaluate(() => window.__studio.stage.debugInfo().printAreaGuideStroke);

    expect(sobreOscura).not.toBe(sobreClara);
    expect(sobreOscura).toContain('240');      // trazo claro sobre prenda oscura
    expect(sobreClara).toContain('12,12,12');  // trazo oscuro sobre prenda clara
  });

  test('F11. el aviso de resolución reacciona al tamaño al que se pone el logo', async ({ page }) => {
    // En pantalla TODO se ve nítido porque el canvas escala el logo a lo que
    // haga falta. El dpi real depende del tamaño al que se imprime, así que el
    // aviso tiene que recalcularse mientras el cliente escala — no una sola vez
    // al subir el archivo.
    await abrir(page);
    await page.locator('input[type="file"]').first().setInputFiles(LOGO_PNG);
    await page.waitForFunction(() => window.__studio.transform !== null, null, { timeout: 10000 });

    const aviso = page.locator('.es-print-quality');

    // El fixture mide 200×80 px y por defecto se encaja al fit automático
    // (INITIAL_FIT_HEADROOM en konva-adapter.js deja el logo al 90% del ancho
    // del área, 28.4 de 31.6 cm): 18 dpi. Es justo el caso que llegaba a
    // producción sin que nada se lo dijera al cliente.
    await expect(aviso).toHaveAttribute('data-dpi-level', 'fail');
    await expect(aviso).toContainText('18 dpi');
    await expect(aviso).toContainText('28.4');

    // Al achicarlo, el mismo archivo pasa a ser suficiente.
    await page.evaluate(() => {
      const s = window.__studio.stage;
      s.setTransform({ ...s.getTransform(), scaleX: 0.15, scaleY: 0.15 });
    });
    await expect(aviso).toHaveAttribute('data-dpi-level', 'ok');
    await expect(aviso).toContainText('suficiente');

    // Y en el tramo intermedio avisa sin alarmar.
    await page.evaluate(() => {
      const s = window.__studio.stage;
      s.setTransform({ ...s.getTransform(), scaleX: 0.2, scaleY: 0.2 });
    });
    await expect(aviso).toHaveAttribute('data-dpi-level', 'warn');
  });

  test('F12. un SVG no dispara el aviso de resolución', async ({ page }) => {
    // Un vector se rasteriza en el RIP al tamaño que haga falta. Avisarle de
    // "baja resolución" sería un falso positivo, y los falsos positivos enseñan
    // al cliente a ignorar los avisos que sí importan.
    await abrir(page);
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80">' +
        '<circle cx="100" cy="40" r="30" fill="#D02B34"/></svg>',
      ),
    });
    await page.waitForFunction(() => window.__studio.transform !== null, null, { timeout: 10000 });

    const aviso = page.locator('.es-print-quality');
    await expect(aviso).toHaveAttribute('data-dpi-level', 'ok');
    // Sigue diciendo a qué tamaño sale, que es útil igual...
    await expect(aviso).toContainText('cm');
    // ...pero sin hablar de dpi, que en un vector no significa nada.
    await expect(aviso).not.toContainText('dpi');
  });

  // ── Interacción directa sobre el lienzo ──────────────────────────────────
  // Se sube el logo por la UI real: con el logo inyectado en el stage, el
  // dropzone (que React sigue mostrando) taparía el lienzo y se comería los clics.

  async function conLogo(page) {
    await abrir(page);
    await page.locator('input[type="file"]').first().setInputFiles(LOGO_PNG);
    await page.waitForFunction(() => window.__studio.transform !== null, null, { timeout: 10000 });
  }

  /** Coordenadas de pantalla de un punto lógico del canvas. */
  async function aPantalla(page, x, y) {
    const box = await page.locator('#es-stage').boundingBox();
    const { stageWidth, stageHeight } = await page.evaluate(() => window.__studio.stage.debugInfo());
    return { x: box.x + (x * box.width) / stageWidth, y: box.y + (y * box.height) / stageHeight };
  }

  const estado = (page) => page.evaluate(() => ({
    sel: window.__studio.stage.isLogoSelected(),
    ...window.__studio.stage.debugInfo(),
  }));

  test('F13. clic en el logo lo selecciona; clic fuera lo deselecciona; la guía del área no se oculta', async ({ page }) => {
    await conLogo(page);
    expect((await estado(page)).sel).toBe(true);

    const fuera = await aPantalla(page, 8, 8);
    await page.mouse.click(fuera.x, fuera.y);
    let info = await estado(page);
    expect(info.sel).toBe(false);
    expect(info.transformerVisible).toBe(false);
    expect(info.printAreaGuideVisible).toBe(true);

    const t = await page.evaluate(() => window.__studio.stage.getTransform());
    const dentro = await aPantalla(page, t.x, t.y);
    await page.mouse.click(dentro.x, dentro.y);
    info = await estado(page);
    expect(info.sel).toBe(true);
    expect(info.transformerVisible).toBe(true);
    expect(info.printAreaGuideVisible).toBe(true);
  });

  test('F14. Delete quita el logo seleccionado; dentro de un campo no hace nada', async ({ page }) => {
    await conLogo(page);

    const campo = page.locator('input:not([type="file"])').first();
    await campo.focus();
    await page.keyboard.press('Backspace');
    expect((await estado(page)).hasLogo).toBe(true);
    await campo.evaluate((el) => el.blur());

    await page.keyboard.press('Delete');
    const info = await estado(page);
    expect(info.hasLogo).toBe(false);
    expect(info.transformerVisible).toBe(false);
  });

  test('F15. arrastrar cerca del centro se imanta y muestra las guías; al soltar se ocultan', async ({ page }) => {
    await conLogo(page);
    const { printArea } = await page.evaluate(() => window.__studio.stage.debugInfo());
    const cx = printArea.x + printArea.width / 2;
    const cy = printArea.y + printArea.height / 2;

    // Primero lejos del centro, para que el imán no esté ya activo al empezar.
    await page.evaluate(({ x, y }) => {
      const s = window.__studio.stage;
      s.setTransform({ ...s.getTransform(), x, y });
    }, { x: cx - 30, y: cy + 20 });

    const t = await page.evaluate(() => window.__studio.stage.getTransform());
    const ini = await aPantalla(page, t.x, t.y);
    const fin = await aPantalla(page, cx + 3, cy - 3);
    await page.mouse.move(ini.x, ini.y);
    await page.mouse.down();
    await page.mouse.move((ini.x + fin.x) / 2, (ini.y + fin.y) / 2, { steps: 4 });
    await page.mouse.move(fin.x, fin.y, { steps: 4 });
    expect((await estado(page)).centerGuidesVisible).toEqual({ v: true, h: true });
    await page.mouse.up();

    const despues = await page.evaluate(() => ({
      t: window.__studio.stage.getTransform(),
      g: window.__studio.stage.debugInfo().centerGuidesVisible,
    }));
    expect(despues.g).toEqual({ v: false, h: false });
    expect(despues.t.x).toBeCloseTo(cx, 1);
    expect(despues.t.y).toBeCloseTo(cy, 1);
  });

  test('F16. los tiradores y trazos miden lo mismo en pantalla sin importar la escala del lienzo', async ({ page }) => {
    await conLogo(page);
    const medir = async () => {
      const box = await page.locator('#es-stage').boundingBox();
      const i = await page.evaluate(() => window.__studio.stage.debugInfo());
      const escala = box.width / i.stageWidth;
      return { anchor: i.anchorSize * escala, borde: i.borderStrokeWidth * escala };
    };
    const a = await medir();
    // Mínimo útil: ~12 px para ratón (24 con puntero táctil) y un trazo visible.
    expect(a.anchor).toBeGreaterThanOrEqual(11.5);
    expect(a.borde).toBeGreaterThanOrEqual(1);

    // Al reducir la ventana el lienzo se achica y los tiradores deben seguir igual.
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForFunction(() => document.querySelector('#es-stage').getBoundingClientRect().width < 350);
    await page.waitForTimeout(100);
    const b = await medir();
    expect(b.anchor).toBeGreaterThanOrEqual(11.5);
    expect(Math.abs(b.anchor - a.anchor)).toBeLessThan(a.anchor * 0.15);
  });

  test('F17. con logo el lienzo bloquea el scroll táctil; sin logo, no', async ({ page }) => {
    await abrir(page);
    const touchAction = () => page.locator('#es-stage').evaluate((el) => getComputedStyle(el).touchAction);
    expect(await touchAction()).toBe('auto');

    await page.locator('input[type="file"]').first().setInputFiles(LOGO_PNG);
    await page.waitForFunction(() => window.__studio.transform !== null, null, { timeout: 10000 });
    expect(await touchAction()).toBe('none');

    await page.keyboard.press('Delete');
    expect(await touchAction()).toBe('auto');
  });

  test('F18. encoger con una esquina no baja del piso del slider', async ({ page }) => {
    await conLogo(page);
    // La esquina opuesta queda fija: para encoger de verdad hay que llevar la
    // inferior derecha hacia la superior izquierda, y un poco más allá.
    const esquinas = await page.evaluate(() => {
      const tr = Konva.stages[0].find('Transformer')[0];
      const pos = (n) => { const p = tr.findOne('.' + n).getAbsolutePosition(); return { x: p.x, y: p.y }; };
      return { br: pos('bottom-right'), tl: pos('top-left') };
    });
    const t0 = await page.evaluate(() => window.__studio.stage.getTransform());
    const ini = await aPantalla(page, esquinas.br.x, esquinas.br.y);
    const fin = await aPantalla(page, esquinas.tl.x + 10, esquinas.tl.y + 10);
    await page.mouse.move(ini.x, ini.y);
    await page.mouse.down();
    await page.mouse.move(fin.x, fin.y, { steps: 16 });
    await page.mouse.up();

    const { t, fit } = await page.evaluate(() => ({
      t: window.__studio.stage.getTransform(),
      fit: window.__studio.stage.getFitScale(),
    }));
    expect(t.scaleX).toBeLessThan(t0.scaleX); // sí encogió
    expect(t.scaleX).toBeGreaterThanOrEqual(0.2 * fit - 1e-6);
  });
});
