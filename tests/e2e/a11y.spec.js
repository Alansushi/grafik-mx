import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { contrastRatio, rgbToHex } from '../../estudio/lib/color.js';
import { CATALOG_FIXTURE } from '../fixtures/catalog.js';

const LOGO_PNG = fileURLToPath(new URL('../fixtures/logo-transparente.png', import.meta.url));

// Tres defectos VISUALES llegaron a producción con la suite en verde:
// botones invisibles (texto blanco sobre fondo blanco), sliders azules del
// navegador en vez de rojos, y una playera marino que se renderizaba celeste.
// Los tres se encontraron mirando una captura, no con una aserción.
//
// css-classes.test.js (Vitest) cerró el primero comprobando que toda clase
// usada existe en la hoja. Pero un parser de CSS no puede cerrar los otros
// dos tipos de fallo, porque no dependen de lo que DICE la hoja sino de lo
// que un elemento real acaba midiendo y coloreando sobre el fondo que de
// verdad tiene detrás: fondos heredados de ancestros, colores translúcidos
// que se componen, media queries, estados como :disabled. Eso sólo se sabe
// en un navegador. Por eso esto es un spec de Playwright y no de Vitest.
//
// Tres clases de fallo que hoy nadie comprueba:
//   A1-A2  contraste real de todo texto visible (WCAG 1.4.3, nivel AA)
//   A3     área táctil de 44 px (studio.css ya lo declara en un comentario)
//   A4     desbordamiento horizontal a 390 px y a 1280 px
//
// El cálculo del ratio NO se reimplementa aquí: se extraen del DOM los colores
// ya resueltos y se pasan por contrastRatio() de estudio/lib/color.js, que es
// la fórmula del W3C y ya está probada en tests/unit/color.test.js.

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

const PEDIDO_FIXTURE = {
  short_code: 'GK-4F2A9C',
  status: 'quoted',
  customer_name: 'Ana Ruiz',
  currency: 'MXN',
  total_cents: 180000,
  priced_with_placeholder: true,
  items: [{
    garment: 'Playera cuello redondo',
    color_hex: '#1B2A4A',
    color_name: 'Azul Marino',
    technique: 'DTF',
    size_breakdown: { M: 12 },
    unit_price_cents: 15000,
    subtotal_cents: 180000,
    preview_url: null,
    logo_url: null,
  }],
};

/**
 * Recolector que corre DENTRO del navegador. Devuelve datos crudos (colores ya
 * resueltos a rgb, tamaños en px) para que el cálculo del contraste ocurra en
 * Node contra estudio/lib/color.js. Así la aserción no depende de una segunda
 * implementación de la fórmula viviendo en el string de page.evaluate().
 */
const RECOLECTOR = () => {
  /** 'rgba(12, 12, 12, 0.5)' → {r,g,b,a}. Tolerante a las formas con y sin coma. */
  function parseColor(str) {
    if (!str || str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    const n = str.match(/[\d.]+/g);
    if (!n || n.length < 3) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: +n[0], g: +n[1], b: +n[2], a: n.length > 3 ? +n[3] : 1 };
  }

  /** `sobre` es opaco; devuelve el resultado de pintar `encima` sobre él. */
  function componer(encima, sobre) {
    const a = encima.a;
    return {
      r: encima.r * a + sobre.r * (1 - a),
      g: encima.g * a + sobre.g * (1 - a),
      b: encima.b * a + sobre.b * (1 - a),
      a: 1,
    };
  }

  /**
   * Fondo EFECTIVO de un elemento. Sube por los ancestros acumulando cada
   * background translúcido hasta topar con uno opaco, y luego los compone de
   * abajo hacia arriba. Este es el paso que hace que la prueba sirva: el fondo
   * casi nunca está declarado en el mismo elemento que el texto, y cuando lo
   * está puede ser un rgba() que deja pasar el de atrás (studio.css usa
   * rgba(240,240,238,0.04) en :hover, por ejemplo).
   */
  function fondoEfectivo(el) {
    const capas = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c.a === 0) continue;
      capas.push(c);
      if (c.a === 1) break;
    }
    // Sin ningún fondo opaco en la cadena, el lienzo del navegador es blanco.
    let base = capas.length && capas[capas.length - 1].a === 1
      ? capas.pop()
      : { r: 255, g: 255, b: 255, a: 1 };
    while (capas.length) base = componer(capas.pop(), base);
    return base;
  }

  function invisible(el) {
    for (let n = el; n instanceof Element; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return true;
      if (parseFloat(cs.opacity) === 0) return true;
      if (n.getAttribute('aria-hidden') === 'true') return true;
    }
    return false;
  }

  function etiqueta(el) {
    const clases = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\s+/).join('.')
      : '';
    const texto = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 45);
    return `${el.tagName.toLowerCase()}${clases}  «${texto}»`;
  }

  const textos = [];
  const tactiles = [];

  for (const el of document.querySelectorAll('body *')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (invisible(el)) continue;

    const cs = getComputedStyle(el);

    // ── Texto ──────────────────────────────────────────────────────────
    // Sólo el elemento que contiene DIRECTAMENTE el nodo de texto. Sin este
    // filtro, cada ancestro se reportaría otra vez con el mismo texto y con
    // un color que ni siquiera es el que se pinta.
    const tieneTextoPropio = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
    );
    // WCAG 1.4.3 exime explícitamente los componentes de interfaz inactivos.
    const inactivo = el.disabled === true || el.closest('[disabled]') !== null;

    if (tieneTextoPropio && !inactivo) {
      const fondo = fondoEfectivo(el);
      textos.push({
        etiqueta: etiqueta(el),
        color: componer(parseColor(cs.color), fondo),
        fondo,
        fontSize: parseFloat(cs.fontSize),
        fontWeight: parseInt(cs.fontWeight, 10) || 400,
      });
    }

    // Los placeholders también son texto que el cliente tiene que leer, y
    // llevan su propio color que no aparece en getComputedStyle(el).color.
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.placeholder) {
      const ph = getComputedStyle(el, '::placeholder');
      if (ph && ph.color) {
        const fondo = fondoEfectivo(el);
        textos.push({
          etiqueta: `${etiqueta(el)} ::placeholder «${el.placeholder}»`,
          color: componer(parseColor(ph.color), fondo),
          fondo,
          fontSize: parseFloat(ph.fontSize || cs.fontSize),
          fontWeight: parseInt(ph.fontWeight || cs.fontWeight, 10) || 400,
        });
      }
    }

    // ── Área táctil ────────────────────────────────────────────────────
    // Los enlaces en línea dentro de un párrafo quedan fuera: su caja la fija
    // el texto que los rodea y WCAG 2.5.8 los exime por eso mismo.
    const esControl = ['BUTTON', 'SELECT', 'TEXTAREA'].includes(el.tagName)
      || (el.tagName === 'INPUT' && !['hidden'].includes(el.type))
      || (el.tagName === 'A' && el.href && cs.display !== 'inline');
    if (esControl && !inactivo) {
      tactiles.push({ etiqueta: etiqueta(el), width: rect.width, height: rect.height, tipo: el.type || '' });
    }
  }

  return { textos, tactiles };
};

function comoHex({ r, g, b }) {
  return rgbToHex({ r: Math.round(r), g: Math.round(g), b: Math.round(b) });
}

/** Umbral de WCAG 1.4.3: 3:1 para texto grande, 4.5:1 para el resto. */
function umbral({ fontSize, fontWeight }) {
  const grande = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
  return grande ? 3 : 4.5;
}

function fallosDeContraste(textos) {
  const fallos = [];
  for (const t of textos) {
    const ratio = contrastRatio(comoHex(t.color), comoHex(t.fondo));
    const min = umbral(t);
    if (ratio < min) {
      fallos.push(
        `${ratio.toFixed(2)}:1 (mínimo ${min}) — ${comoHex(t.color)} sobre ${comoHex(t.fondo)}\n` +
        `      ${t.etiqueta}`,
      );
    }
  }
  return fallos;
}

async function montarEstudio(page) {
  await page.route('**/api/catalog', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG_FIXTURE) }));
  await page.route('**/api/quote', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QUOTE_12) }));

  await page.goto('/estudio/?debug=1');
  await page.waitForFunction(() => window.__studio?.stage, null, { timeout: 20000 });
}

test.describe('accesibilidad del configurador', () => {
  test('A1. todo texto visible de /estudio/ cumple contraste AA', async ({ page }) => {
    await montarEstudio(page);

    // Buena parte del texto del estudio sólo EXISTE tras interactuar, y lo que
    // no se pinta no se audita. Hay que llevar la pantalla a su estado completo
    // antes de recolectar:
    //
    //   · Sin tallas no hay cotización, y el aviso de "precios de referencia"
    //     vive dentro del resumen — justo donde el cliente lee el PRECIO.
    //   · Sin logo no existen la tarjeta del archivo, los controles de escala
    //     ni el aviso de resolución de impresión.
    await page.locator('input[type="file"]').first().setInputFiles(LOGO_PNG);
    await page.waitForFunction(() => window.__studio.transform !== null, null, { timeout: 10000 });
    await page.evaluate(() => window.__studioBridge.setSize('M', '12'));
    await page.waitForFunction(() => window.__studio.quote !== null, null, { timeout: 10000 });

    const { textos } = await page.evaluate(RECOLECTOR);
    expect(textos.length, 'no se recolectó ningún texto: el recolector está roto').toBeGreaterThan(15);

    // Guardia explícita: si un cambio deja de pintar estos bloques, el test
    // seguiría en verde auditando una pantalla a medias.
    for (const marca of ['es-print-quality', 'es-resumen-placeholder', 'es-logo-card-meta']) {
      expect(
        textos.some((t) => t.etiqueta.includes(marca)),
        `.${marca} no llegó al recolector: la pantalla no está en su estado completo`,
      ).toBe(true);
    }

    const fallos = fallosDeContraste(textos);
    expect(fallos, `Textos por debajo de WCAG AA:\n  - ${fallos.join('\n  - ')}`).toEqual([]);
  });

  test('A2. el mensaje de error de un campo también cumple contraste', async ({ page }) => {
    // .es-error-text estaba en --es-rojo (3.45:1 sobre --es-carbon). Es el peor
    // sitio posible para un contraste flojo: es el texto que explica por qué un
    // dato no se aceptó. No aparece en A1 porque exige provocar el error.
    await montarEstudio(page);
    await page.evaluate(() => window.__studioBridge.setSize('M', '1,000'));
    await expect(page.locator('.es-error-text').first()).toBeVisible();

    const { textos } = await page.evaluate(RECOLECTOR);
    const errores = textos.filter((t) => t.etiqueta.includes('es-error-text'));
    expect(errores.length, 'no se encontró .es-error-text en el recolector').toBeGreaterThan(0);

    const fallos = fallosDeContraste(errores);
    expect(fallos, `El mensaje de error no se lee:\n  - ${fallos.join('\n  - ')}`).toEqual([]);
  });

  test('A3. los controles tienen al menos 44x44 px de área táctil', async ({ page }) => {
    await montarEstudio(page);

    // Sin logo, #es-logo-scale/#es-logo-rotation (y su input numérico) ni
    // siquiera existen en el DOM: sin este upload, A3 nunca los mide.
    await page.locator('input[type="file"]').first().setInputFiles(LOGO_PNG);
    await page.waitForFunction(() => window.__studio.transform !== null, null, { timeout: 10000 });
    await page.evaluate(() => window.__studioBridge.setSize('M', '12'));
    await page.waitForFunction(() => window.__studio.quote !== null, null, { timeout: 10000 });

    const { tactiles } = await page.evaluate(RECOLECTOR);
    expect(tactiles.length, 'no se recolectó ningún control').toBeGreaterThan(5);

    // Los swatches de color son una rejilla de cuadros: se miden igual que el
    // resto. studio.css ya promete 44 px en un comentario (.es-btn-sm) — esto
    // convierte esa promesa en una aserción.
    const chicos = tactiles
      .filter((c) => c.width < 44 || c.height < 44)
      .map((c) => `${Math.round(c.width)}x${Math.round(c.height)} — ${c.etiqueta}`);

    expect(chicos, `Controles por debajo de 44x44:\n  - ${chicos.join('\n  - ')}`).toEqual([]);
  });

  test('A4. no hay desbordamiento horizontal a 390 px ni a 1280 px', async ({ page }) => {
    await montarEstudio(page);

    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      // Un reflow tras cambiar el viewport: el stage se redimensiona.
      await page.waitForTimeout(250);

      const { scrollWidth, clientWidth, culpables } = await page.evaluate(() => {
        const raiz = document.documentElement;
        // Si hay desbordamiento, decir QUÉ lo causa — si no, el fallo obliga a
        // bisecar el CSS a mano.
        const culpables = [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > raiz.clientWidth + 1)
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
        return { scrollWidth: raiz.scrollWidth, clientWidth: raiz.clientWidth, culpables };
      });

      expect(
        scrollWidth,
        `a ${width}px la página se desborda (${scrollWidth} > ${clientWidth}). Sospechosos: ${culpables.join(', ')}`,
      ).toBeLessThanOrEqual(clientWidth + 1);
    }
  });

  test('A5. la página de pedido también cumple contraste AA', async ({ page }) => {
    // Es la página que TÚ abres para ver lo que el cliente configuró, y la
    // única que usa .es-pedido-datos dt — una de las reglas que estaba en
    // --es-plata-dim a 3.09:1.
    await page.route('**/api/order-status**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PEDIDO_FIXTURE) }));

    await page.goto('/estudio/pedido/?t=11111111-2222-3333-4444-555555555555');
    await expect(page.locator('.es-pedido-folio')).toBeVisible();

    const { textos } = await page.evaluate(RECOLECTOR);
    expect(textos.length, 'la página de pedido no pintó contenido').toBeGreaterThan(8);

    const fallos = fallosDeContraste(textos);
    expect(fallos, `Textos por debajo de WCAG AA en /estudio/pedido/:\n  - ${fallos.join('\n  - ')}`).toEqual([]);
  });
});
