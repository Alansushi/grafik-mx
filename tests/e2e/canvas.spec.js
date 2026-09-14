import { test, expect } from '@playwright/test';
import { hexToRgb } from '../../estudio/lib/color.js';
import { clampTransformToArea, rotatedAabb, rectContains } from '../../estudio/lib/geometry.js';
import { CATALOG_FIXTURE } from '../fixtures/catalog.js';

// CERO screenshot diffing (spec §3.5).
//
// Todas las aserciones son numéricas: se lee el píxel REAL del canvas del
// navegador con getImageData y se compara contra los mismos módulos puros
// ejecutados aquí en Node. Un screenshot diff se rompe con cada cambio de
// antialiasing, de versión de navegador o de fuente, y no dice nada sobre si la
// matemática del blend es correcta. Esto sí.
//
// Corre en Chromium Y WebKit: Safari es donde los blend modes se implementan
// distinto, y el motor de preview es justo lo que no puede fallar ahí.

const STUDIO = '/estudio/?debug=1';

/** Sirve el catálogo sin backend: el servidor estático no tiene /api. */
async function stubCatalog(page) {
  await page.route('**/api/catalog', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CATALOG_FIXTURE),
    }),
  );
}

async function openStudio(page) {
  await stubCatalog(page);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(STUDIO);
  await page.waitForFunction(() => window.__studio?.stage, null, { timeout: 20000 });
  return errors;
}

test.describe('motor de canvas', () => {
  test('C1. monta el stage con la topología de layers correcta', async ({ page }) => {
    const errors = await openStudio(page);
    const info = await page.evaluate(() => window.__studio.stage.debugInfo());

    // Una layer para lo que mezcla y otra para el Transformer. Si alguien
    // partiera "compose" en varias, el blend dejaría de cruzar y este test
    // sería lo primero en avisar.
    expect(info.layers).toEqual(['compose', 'ui']);
    expect(info.composeChildren).toBe(4); // prenda, logo, fold, guía
    expect(info.stageWidth).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  // CONTRATO CAMBIADO A PROPÓSITO tras VER el render.
  //
  // C2 y C3 verificaban el blend `color` que pedía el §3.2 del spec, y pasaban:
  // el navegador coincidía con la referencia W3C ±3 por canal. Pero al mirar la
  // captura, #C1272D (rojo profundo) salía rosa pálido y #1B2A4A (azul marino
  // muy oscuro) salía azul cielo — porque `color` conserva la LUMINOSIDAD del
  // fondo, y con una sola base gris a L≈180 todos los colores salen igual de
  // claros. Matemáticamente correcto, comercialmente inservible: la premisa del
  // proyecto es que el cliente vea el color EXACTO que va a comprar.
  //
  // La técnica ahora es normalizar la base contra el nivel de tela plana y
  // multiplicar por el color (ver garment-painter.js). Estos dos casos pasan a
  // verificar la promesa que de verdad le importa al cliente.

  test('C2. la tela plana se ve EXACTAMENTE del color elegido', async ({ page }) => {
    await openStudio(page);
    const { size } = await page.evaluate(() => {
      const d = window.__studio.stage.debugInfo();
      return { size: { width: d.stageWidth, height: d.stageHeight } };
    });

    for (const hex of ['#C1272D', '#1B2A4A', '#1E6B3A', '#F2C200', '#FFFFFF']) {
      await page.evaluate((h) => window.__studio.setColor(h), hex);
      await page.waitForTimeout(60);

      // El punto más claro de la prenda: la normalización lleva la tela plana a
      // 255, así que multiplicar deja ahí el color tal cual.
      const brightest = await page.evaluate(([w, h]) => {
        let best = null;
        for (let x = Math.round(w * 0.15); x < w * 0.85; x += 7) {
          for (let y = Math.round(h * 0.2); y < h * 0.95; y += 7) {
            const p = window.__studio.stage.sampleComposePixel(x, y);
            if (p.a < 250) continue;
            const l = 0.3 * p.r + 0.59 * p.g + 0.11 * p.b;
            if (!best || l > best.l) best = { ...p, l, x, y };
          }
        }
        return best;
      }, [size.width, size.height]);

      const want = hexToRgb(hex);
      for (const ch of ['r', 'g', 'b']) {
        expect(
          Math.abs(brightest[ch] - want[ch]),
          `canal ${ch} con ${hex}: la tela plana da ${brightest[ch]}, el color pedido es ${want[ch]}`,
        ).toBeLessThanOrEqual(3);
      }
    }
  });

  test('C3. los pliegues sobreviven: la estructura no depende del color', async ({ page }) => {
    await openStudio(page);
    const { size } = await page.evaluate(() => {
      const d = window.__studio.stage.debugInfo();
      return { size: { width: d.stageWidth, height: d.stageHeight } };
    });

    // Para cada color, la razón entre el punto más oscuro y el más claro de la
    // prenda. Si multiply conserva las razones de atenuación del original, esa
    // razón debe ser la MISMA con cualquier color: el sombreado es del mapa, no
    // del tinte. Si no lo fuera, cambiar de color aplanaría o exageraría los
    // pliegues.
    const razones = [];
    for (const hex of ['#C1272D', '#1E6B3A', '#9A9A9A']) {
      await page.evaluate((h) => window.__studio.setColor(h), hex);
      await page.waitForTimeout(60);
      const r = await page.evaluate(([w, h]) => {
        let min = null; let max = null;
        for (let x = Math.round(w * 0.15); x < w * 0.85; x += 7) {
          for (let y = Math.round(h * 0.2); y < h * 0.95; y += 7) {
            const p = window.__studio.stage.sampleComposePixel(x, y);
            if (p.a < 250) continue;
            const l = 0.3 * p.r + 0.59 * p.g + 0.11 * p.b;
            if (min === null || l < min) min = l;
            if (max === null || l > max) max = l;
          }
        }
        return max > 0 ? min / max : 0;
      }, [size.width, size.height]);
      razones.push({ hex, r });
    }

    const ref = razones[0].r;
    expect(ref, 'debe haber contraste real entre pliegue y tela plana').toBeLessThan(0.92);
    expect(ref, 'pero no tanto como para verse sucia').toBeGreaterThan(0.3);
    for (const { hex, r } of razones) {
      expect(Math.abs(r - ref), `${hex} altera la estructura de pliegues (${r.toFixed(3)} vs ${ref.toFixed(3)})`).toBeLessThan(0.05);
    }
  });

  test('C4. el snapshot sale y no incluye los tiradores del Transformer', async ({ page }) => {
    await openStudio(page);
    const blob = await page.evaluate(async () => {
      const b = await window.__studio.stage.snapshot({ pixelRatio: 1 });
      return { size: b.size, type: b.type };
    });
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(3000);

    // El Transformer vive en la layer 'ui' y el snapshot sale de 'compose',
    // así que queda fuera por construcción, no por acordarse de ocultarlo.
    const info = await page.evaluate(() => window.__studio.stage.debugInfo());
    expect(info.uiChildren).toBe(1);
  });

  test('C5. pixelRatio 2 duplica el lado del PNG', async ({ page }) => {
    await openStudio(page);
    const dims = await page.evaluate(async () => {
      const read = async (ratio) => {
        const blob = await window.__studio.stage.snapshot({ pixelRatio: ratio });
        const bmp = await createImageBitmap(blob);
        return { w: bmp.width, h: bmp.height };
      };
      return { one: await read(1), two: await read(2) };
    });
    expect(dims.two.w).toBe(dims.one.w * 2);
    expect(dims.two.h).toBe(dims.one.h * 2);
  });

  test('C6. el clamp del navegador coincide con el de Node', async ({ page }) => {
    await openStudio(page);
    const { printArea } = await page.evaluate(() => window.__studio.stage.debugInfo());

    const natural = { width: 200, height: 80 };
    await page.evaluate(async (ns) => {
      // Un logo de prueba, cargado como blob para no contaminar el canvas.
      const c = document.createElement('canvas');
      c.width = ns.width; c.height = ns.height;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#D02B34';
      ctx.fillRect(0, 0, ns.width, ns.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const { loadImageFromBlob } = await import('/estudio/canvas/image-loader.js');
      const img = await loadImageFromBlob(blob);
      window.__studio.stage.setLogo({ image: img, naturalSize: ns });
    }, natural);

    for (const t of [
      { x: 9999, y: 9999, scaleX: 1, scaleY: 1, rotation: 0 },
      { x: -500, y: -500, scaleX: 1, scaleY: 1, rotation: 45 },
      { x: 100, y: 100, scaleX: 8, scaleY: 8, rotation: 30 },
    ]) {
      const got = await page.evaluate((tr) => {
        window.__studio.stage.setTransform(tr);
        return window.__studio.stage.getTransform();
      }, t);
      const want = clampTransformToArea(t, natural, printArea);

      for (const k of ['x', 'y', 'scaleX', 'scaleY', 'rotation']) {
        expect(Math.abs(got[k] - want[k]), `${k} para ${JSON.stringify(t)}`).toBeLessThan(0.01);
      }
      // Y la invariante que de verdad importa: el logo cabe en el área.
      expect(rectContains(printArea, rotatedAabb(got, natural), 0.01)).toBe(true);
    }
  });

  test('C7. anti-taint: una imagen servida SIN CORS no rompe el snapshot', async ({ page }) => {
    // Se sirve un PNG desde otro origen y sin Access-Control-Allow-Origin.
    // Cargado con <img src=remoto> contaminaría el canvas y toDataURL lanzaría.
    // image-loader.js lo pasa por fetch → blob, así que el <img> nunca ve la
    // URL remota y el canvas queda limpio. Este test es la prueba de que la
    // regla del §3.3 se está cumpliendo de verdad.
    await page.route('https://cdn-ajeno.example/logo.png', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: {}, // sin Access-Control-Allow-Origin, a propósito
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64',
        ),
      }),
    );
    await openStudio(page);

    const result = await page.evaluate(async () => {
      const { loadImageFromUrl } = await import('/estudio/canvas/image-loader.js');
      const img = await loadImageFromUrl('https://cdn-ajeno.example/logo.png');
      window.__studio.stage.setLogo({ image: img, naturalSize: { width: 1, height: 1 } });
      const blob = await window.__studio.stage.snapshot({ pixelRatio: 1 });
      return { ok: true, size: blob.size };
    });
    expect(result.ok).toBe(true);
    expect(result.size).toBeGreaterThan(1000);
  });

  test('C8. anti-taint negativo: el camino prohibido SÍ contamina', async ({ page }) => {
    // Documenta por qué existe la regla. Si este test empezara a pasar sin
    // lanzar, significaría que el navegador cambió las reglas de tainting y
    // habría que revisar si el cortafuegos sigue haciendo falta.
    await page.route('https://cdn-ajeno.example/otro.png', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: {},
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64',
        ),
      }),
    );
    await openStudio(page);

    const code = await page.evaluate(async () => {
      const { assertNotTainted } = await import('/estudio/canvas/image-loader.js');
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = 'https://cdn-ajeno.example/otro.png'; // el camino PROHIBIDO
      });
      const c = document.createElement('canvas');
      c.width = 10; c.height = 10;
      c.getContext('2d').drawImage(img, 0, 0);
      try {
        assertNotTainted(c);
        return 'NO_LANZO';
      } catch (e) {
        return e.code ?? e.name;
      }
    });
    expect(code).toBe('CANVAS_TAINTED');
  });

  test('C9. cambiar de color repetidamente no degrada (el cache funciona)', async ({ page }) => {
    await openStudio(page);
    const times = await page.evaluate(async () => {
      const hexes = ['#D02B34', '#1B2A4A', '#F2C200', '#1E6B3A', '#9A9A9A'];
      const out = [];
      for (let i = 0; i < 10; i++) {
        const t0 = performance.now();
        window.__studio.setColor(hexes[i % hexes.length]);
        out.push(performance.now() - t0);
      }
      return out;
    });
    // Las primeras pintan y cachean; las últimas deben salir del cache.
    const primeras = times.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const ultimas = times.slice(-3).reduce((a, b) => a + b, 0) / 3;
    expect(ultimas).toBeLessThanOrEqual(Math.max(primeras * 2, 8));
  });
});
