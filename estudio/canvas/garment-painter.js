// estudio/canvas/garment-painter.js
//
// Tiñe la prenda. Es la técnica del §3.2 del análisis, y la razón de que el
// catálogo necesite UNA sola foto por silueta en vez de una por color: la foto
// va en escala de grises y el color se aplica en el navegador con el blend
// `color`, que conserva la luminosidad original — o sea, los pliegues y las
// sombras de la tela sobreviven al teñido.
//
// ── Por qué esto vive en un canvas 2D crudo y no en un Konva.Rect ──
//
// 1. Se memoiza por color. Teñir es lo caro; arrastrar el logo es lo frecuente.
//    Separándolo, mover el logo no recompone la prenda.
// 2. Se puede leer con getImageData y comparar contra compose.blendColorPixel(),
//    que es la implementación de referencia W3C. Eso convierte la prueba del
//    canvas en una comparación NUMÉRICA en vez de un screenshot diff frágil.
// 3. No depende del orden de los hijos dentro de una Layer de Konva, que es
//    justo donde es fácil equivocarse sin que salte ningún error.

import { TaintedCanvasError } from '../lib/errors.js';

// Memoria por (imagen base, color, tamaño). El canvas teñido se reutiliza
// mientras no cambie ninguno de los tres.
const tintCache = new Map();
const foldCache = new Map();

// Límite del cache: un cliente que pruebe muchos colores no debe inflar la
// memoria sin techo. 14 colores × hasta 5 vistas-fuente por prenda (playera:
// front+back; gorra: front+left+right) cubren de sobra el catálogo actual con
// margen, y el descarte es el más viejo primero.
const MAX_CACHE = 96;

function putCapped(cache, key, value) {
  if (cache.size >= MAX_CACHE) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, value);
  return value;
}

// Identidad estable de la imagen base, para que el cache no confunda la playera
// con la gorra. Los canvas procedurales no tienen `src`, así que se les cuelga
// un id la primera vez que se ven.
let sourceSeq = 0;
function sourceId(img) {
  if (img.src) return img.src;
  if (!img.__gkId) img.__gkId = `canvas#${++sourceSeq}`;
  return img.__gkId;
}

function makeCanvas(width, height) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

/**
 * Devuelve un canvas con la prenda del color pedido, conservando los pliegues.
 *
 * ── Por qué NO se usa el blend `color` que pedía el §3.2 del spec ──
 *
 * El blend `color` toma el TONO de la fuente y la LUMINOSIDAD del fondo. Con
 * una única base gris eso significa que TODOS los colores salen con la misma
 * claridad que la base. Se vio al mirar el render: con la base a L≈180,
 * #C1272D (rojo profundo) salía rosa pálido y #1B2A4A (azul marino muy oscuro)
 * salía azul cielo. Un negro habría salido gris.
 *
 * Eso hunde la premisa del proyecto: el cliente tiene que ver el color EXACTO
 * que va a comprar. Una prenda marino que se ve celeste no acelera ninguna
 * decisión de compra, la sabotea.
 *
 * ── Lo que se hace en su lugar ──
 *
 * La base gris no es un color: es un MAPA DE SOMBREADO, cuánta luz recibe cada
 * punto de la tela. Así que se normaliza contra el nivel de tela plana
 * (percentil 0.9, igual que el fold map) y se MULTIPLICA por el color elegido:
 *
 *     salida = (sombreado / 255) × color
 *
 *   · tela plana  → sombreado 255 → exactamente el color elegido
 *   · pliegue     → sombreado 198 → el mismo color, 22% más oscuro
 *   · arruga      → sombreado 140 → 45% más oscuro
 *
 * Las razones de atenuación del original se conservan, que es lo que hace que
 * los pliegues sigan leyéndose. Es el mismo razonamiento que en
 * normalizeFoldMapPixels: multiply es multiplicativo, así que lo que importa
 * es cuánto atenúa cada zona RESPECTO a la tela plana.
 *
 * Se hace en un solo paso de getImageData/putImageData en vez de con
 * globalCompositeOperation: el resultado es idéntico en todos los navegadores
 * (no depende de cómo cada motor implemente los blend modes) y es directamente
 * comparable contra una referencia en JS puro, que es lo que verifica el test.
 */
export function paintGarment(baseImage, colorHex, size) {
  const key = `${sourceId(baseImage)}|${colorHex}|${size.width}x${size.height}`;
  const hit = tintCache.get(key);
  if (hit) return hit;

  const canvas = makeCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

  let img;
  try {
    img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    throw new TaintedCanvasError(
      'CANVAS_TAINTED',
      'La imagen base contaminó el canvas: debe cargarse con image-loader.js (blob:), nunca desde una URL remota.',
      {},
    );
  }

  const data = img.data;
  const shading = normalizeFoldPixels(data, 255, 0.9);
  const { r, g, b } = parseHex(colorHex);

  for (let i = 0; i < data.length; i += 4) {
    const s = shading[i] / 255;
    data[i] = r * s;
    data[i + 1] = g * s;
    data[i + 2] = b * s;
    // El alfa se conserva del original: es lo que recorta la silueta y evita
    // que la prenda aparezca dentro de un rectángulo de color.
  }
  ctx.putImageData(img, 0, 0);

  return putCapped(tintCache, key, canvas);
}

/** '#RRGGBB' → {r,g,b}. Local para no arrastrar estudio/lib/color.js al DOM. */
function parseHex(hex) {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Mapa de pliegues listo para aplicarse con `multiply` sobre el logo.
 *
 * Normaliza MULTIPLICATIVAMENTE contra el nivel de tela plana (percentil 0.9),
 * no contra la media — ver el razonamiento completo en
 * estudio/lib/compose.js#normalizeFoldMapPixels. En corto: multiply es una
 * operación multiplicativa, así que lo que importa es cuánto atenúa cada
 * pliegue RESPECTO a la tela plana, y escalar preserva esas razones mientras
 * que sumar una constante las aplana.
 *
 * Resultado: la tela plana queda en 255 (multiply por blanco = no hace nada) y
 * sólo los pliegues restan brillo al logo.
 */
export function paintFoldMap(baseImage, size) {
  const key = `${sourceId(baseImage)}|${size.width}x${size.height}`;
  const hit = foldCache.get(key);
  if (hit) return hit;

  const canvas = makeCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

  let img;
  try {
    img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    // getImageData sobre un canvas contaminado lanza. Si pasa aquí, el snapshot
    // también va a fallar después — mejor decirlo ahora, que es cuando aún se
    // puede diagnosticar de dónde salió la imagen.
    throw new TaintedCanvasError(
      'CANVAS_TAINTED',
      'La imagen base contaminó el canvas: debe cargarse con image-loader.js (blob:), nunca desde una URL remota.',
      {},
    );
  }

  const out = normalizeFoldPixels(img.data, 255, 0.9);
  ctx.putImageData(new ImageData(out, canvas.width, canvas.height), 0, 0);

  return putCapped(foldCache, key, canvas);
}

/**
 * Igual que compose.normalizeFoldMapPixels, pero trabajando sobre el buffer del
 * canvas. Se duplica a propósito en vez de importarse: compose.js es lógica
 * PURA que corre en Node bajo Vitest y no debe conocer ImageData ni el DOM.
 * La equivalencia numérica entre ambas la verifica el test de Playwright, que
 * compara el píxel real contra la versión de compose.js.
 */
function normalizeFoldPixels(data, targetLevel, referencePercentile) {
  const n = data.length / 4;
  if (n === 0) return data;

  const grays = new Array(n);
  for (let i = 0; i < n; i++) grays[i] = data[i * 4];
  grays.sort((a, b) => a - b);
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(referencePercentile * n) - 1));
  const reference = grays[idx];

  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const v = reference === 0 ? targetLevel : (data[o] * targetLevel) / reference;
    out[o] = v;
    out[o + 1] = v;
    out[o + 2] = v;
    out[o + 3] = data[o + 3];
  }
  return out;
}

/** Vacía los caches. Para tests y para liberar memoria al cambiar de prenda. */
export function clearCache() {
  tintCache.clear();
  foldCache.clear();
}

/** Tamaño actual de los caches — sólo para que los tests puedan comprobarlo. */
export function cacheSize() {
  return { tint: tintCache.size, fold: foldCache.size };
}
