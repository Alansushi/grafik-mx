// estudio/lib/compose.js — implementación de referencia (JS puro, sin DOM)
// del blend 'color' y 'multiply' según W3C Compositing and Blending Level 1.
//
// Este módulo NO pinta nada: es la matemática contra la que se verifican los
// píxeles reales que sí pinta el navegador (Canvas 2D con
// globalCompositeOperation). El motivo está en el §3.1 del spec: Konva aplica
// el gco sobre el canvas de su propia Layer y ese resultado se lee de vuelta
// con getImageData; comparar esa lectura contra las funciones de aquí es lo
// que permite que el test visual sea numérico (con tolerancia) en vez de un
// screenshot diff frágil.
//
// Convención de este archivo: los "fold maps" y bases en escala de grises se
// asumen puros (r === g === b); donde hace falta reducir un píxel a un solo
// valor de gris se lee siempre el canal r como representante. Es una asunción
// documentada, no un accidente — el resto del pipeline (garment-painter,
// mockup procedural) garantiza que esos buffers siempre llegan así.
//
// @typedef {{r:number,g:number,b:number}} Rgb

import { hexToRgb, rgbToHex } from './color.js';
import { ValidationError } from './errors.js';

/**
 * Lum(C) = 0.3R + 0.59G + 0.11B — W3C Compositing and Blending Level 1,
 * "Non-separable blend modes". Es una luminancia perceptual clásica (los
 * mismos coeficientes NTSC/ITU-R BT.601 aproximados), DISTINTA de la
 * relativeLuminance WCAG de color.js (que linealiza sRGB con 0.2126/0.7152/
 * 0.0722): esta opera directo sobre los canales 8-bit sin linealizar, porque
 * es la fórmula que el propio Canvas usa internamente para el gco 'color'.
 * Se opera sobre 0..255, no sobre 0..1, para no tener que reescalar en cada
 * llamada desde código que ya trae Uint8ClampedArray.
 */
export function lum({ r, g, b }) {
  return 0.3 * r + 0.59 * g + 0.11 * b;
}

/**
 * ClipColor — W3C. Dado un color que puede tener canales fuera de [0,255]
 * (típicamente porque SetLum acaba de sumarle un delta de luminosidad),
 * lo trae de vuelta a rango preservando su Lum EXACTAMENTE.
 *
 * Cómo funciona: si algún canal quedó por debajo de 0, escala todo el color
 * hacia L a lo largo del eje "por debajo" usando el factor L/(L-n) — eso
 * lleva el canal mínimo (n) exactamente a 0 sin mover L (la combinación
 * lineal 0.3+0.59+0.11=1 hace que escalar simétricamente alrededor de L deje
 * Lum invariante). Si algún canal quedó por encima de 255, hace lo mismo
 * hacia el otro lado con (255-L)/(x-L), llevando el máximo (x) a 255.
 *
 * Las dos correcciones son secuenciales (la segunda usa los valores que dejó
 * la primera, pero L/n/x se calculan una sola vez sobre el color de entrada)
 * porque así lo define el pseudocódigo del spec, y es lo que hace que negro y
 * blanco puros salgan intactos de blendColorPixel sin ningún caso especial:
 * con L=0 el primer factor es 0/(0-n)=0 y colapsa todo a 0; con L=255 el
 * segundo factor es (255-255)/(x-255)=0 y colapsa todo a 255.
 */
export function clipColor(rgb) {
  const l = lum(rgb);
  const n = Math.min(rgb.r, rgb.g, rgb.b);
  const x = Math.max(rgb.r, rgb.g, rgb.b);

  let { r, g, b } = rgb;

  if (n < 0 && l !== n) {
    const factor = l / (l - n);
    r = l + (r - l) * factor;
    g = l + (g - l) * factor;
    b = l + (b - l) * factor;
  }

  if (x > 255 && x !== l) {
    const factor = (255 - l) / (x - l);
    r = l + (r - l) * factor;
    g = l + (g - l) * factor;
    b = l + (b - l) * factor;
  }

  return { r, g, b };
}

/**
 * SetLum — W3C. Desplaza el color para que su Lum sea exactamente `l`
 * (sumando la misma diferencia a los tres canales, lo que por linealidad
 * cambia Lum en exactamente esa diferencia) y luego llama a ClipColor para
 * traer de vuelta a [0,255] lo que ese desplazamiento haya sacado de rango.
 */
export function setLum(rgb, l) {
  const d = l - lum(rgb);
  return clipColor({ r: rgb.r + d, g: rgb.g + d, b: rgb.b + d });
}

/**
 * globalCompositeOperation = 'color'. Toma el tono/saturación de la FUENTE
 * (el color que el cliente elige) y la luminosidad del FONDO (la foto gris de
 * la prenda, con sus pliegues y sombras intactos). Por eso una sola foto
 * sirve para todos los colores: sólo se reemplaza la crominancia.
 */
export function blendColorPixel(backdrop, source) {
  return setLum(source, lum(backdrop));
}

/**
 * globalCompositeOperation = 'multiply'. Separable y sin ClipColor: cada
 * canal es backdrop*source/255. Se usa para el fold map (sombra de pliegues)
 * sobre el logo — normalizado de antemano (ver normalizeFoldMapPixels) para
 * que las zonas planas del mapa (255) no oscurezcan nada y sólo los pliegues
 * reales (más oscuros que 255) resten brillo.
 */
export function blendMultiplyPixel(backdrop, source) {
  return {
    r: (backdrop.r * source.r) / 255,
    g: (backdrop.g * source.g) / 255,
    b: (backdrop.b * source.b) / 255,
  };
}

/**
 * Estadísticas de un buffer en escala de grises (lee el canal r de cada
 * píxel, ver convención al inicio del archivo). `opaqueCount` cuenta los
 * píxeles totalmente opacos (a === 255) — no "visibles en algo", sino
 * literalmente sin ninguna transparencia, que es la lectura más estricta y
 * la que no depende de un umbral arbitrario.
 */
export function grayscaleStats(data) {
  const n = data.length / 4;
  let sum = 0;
  let min = 255;
  let max = 0;
  let alphaSum = 0;
  let opaqueCount = 0;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const v = data[o];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    const a = data[o + 3];
    alphaSum += a;
    if (a === 255) opaqueCount++;
  }

  return {
    mean: n === 0 ? 0 : sum / n,
    min,
    max,
    alphaMean: n === 0 ? 0 : alphaSum / n,
    opaqueCount,
  };
}

/**
 * Normaliza un fold map (mapa de pliegues en escala de grises) para aplicarlo
 * con `multiply` sobre el logo, de modo que el logo herede los pliegues de la
 * tela sin oscurecerse en conjunto.
 *
 * La referencia NO es la media, es el nivel de TELA PLANA — se estima con un
 * percentil alto de los grises (`referencePercentile`, 0.9 por defecto). Ese
 * nivel se mapea a `targetLevel` (255), donde multiply es factor 1.0 y no
 * altera nada; los pliegues, que están por debajo, son los únicos que restan
 * brillo.
 *
 * Por qué MULTIPLICATIVO y no un desplazamiento aditivo: multiply es una
 * operación multiplicativa, así que lo que importa no son los valores
 * absolutos sino cuánto atenúa cada pliegue RESPECTO a la tela plana. Escalar
 * preserva esas razones; sumar una constante las comprime. Con un mapa real
 * (plana 180, pliegue 120, arruga 80) la diferencia es grande:
 *
 *   atenuación real      1.000 / 0.667 / 0.444
 *   aditivo (+95)        1.000 / 0.843 / 0.686   ← pliegues casi borrados
 *   multiplicativo       1.000 / 0.667 / 0.444   ← fiel al original
 *
 * Y por qué la media era mala referencia: la media incluye los pliegues, así
 * que llevarla a 255 —el techo del rango— obliga a recortar toda la
 * información de sombra contra el máximo.
 *
 * Escalar por un factor positivo es monótono, y el clamp de
 * Uint8ClampedArray también, así que el orden relativo de los píxeles siempre
 * se conserva (caso 14).
 */
export function normalizeFoldMapPixels(data, targetLevel = 255, referencePercentile = 0.9) {
  const n = data.length / 4;
  if (n === 0) return new Uint8ClampedArray(0);

  // Percentil sobre el canal rojo: el mapa es gris, así que r === g === b.
  const grays = new Array(n);
  for (let i = 0; i < n; i++) grays[i] = data[i * 4];
  grays.sort((a, b) => a - b);
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(referencePercentile * n) - 1));
  const reference = grays[idx];

  // Un mapa completamente negro no lleva información de pliegues utilizable y
  // además haría una división por cero. Se neutraliza (todo a targetLevel) en
  // vez de reventar: multiply con un mapa neutro simplemente no hace nada, que
  // es el fallo seguro.
  const scale = reference === 0 ? 0 : targetLevel / reference;

  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    // La asignación a Uint8ClampedArray ya redondea y acota a [0,255] según
    // ToUint8Clamp — no hay que reimplementar ese clamp a mano.
    const v = reference === 0 ? targetLevel : data[o] * scale;
    out[o] = v;
    out[o + 1] = v;
    out[o + 2] = v;
    out[o + 3] = data[o + 3]; // alfa intacto: no forma parte del "gris"
  }
  return out;
}

/**
 * Aplica el blend 'color' píxel a píxel: cada píxel opaco de `base` (el fondo
 * gris de la prenda) se tiñe con `hex` (la fuente, constante para todo el
 * buffer). Los píxeles con a===0 se dejan intactos en RGB — no hay nada que
 * teñir si no hay nada visible, y tocarlos igual sólo arriesgaría artefactos
 * en los bordes de máscaras con alfa binario.
 */
export function tintPixels(base, hex) {
  const source = hexToRgb(hex);
  const out = new Uint8ClampedArray(base.length);
  const n = base.length / 4;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = base[o + 3];
    if (a === 0) {
      out[o] = base[o];
      out[o + 1] = base[o + 1];
      out[o + 2] = base[o + 2];
      out[o + 3] = 0;
      continue;
    }
    const backdrop = { r: base[o], g: base[o + 1], b: base[o + 2] };
    const blended = blendColorPixel(backdrop, source);
    out[o] = blended.r;
    out[o + 1] = blended.g;
    out[o + 2] = blended.b;
    out[o + 3] = a;
  }
  return out;
}

/**
 * Color dominante de un buffer de píxeles (p.ej. un logo recién subido, para
 * sugerir un tono de partida). Ignora píxeles con alfa por debajo de
 * `alphaThreshold` y agrupa el resto en cubos de `bucketBits` bits por canal
 * (histograma de color de baja resolución) para no dejar que un antialiasing
 * de un solo píxel de diferencia divida el voto entre dos colores casi
 * idénticos. El color devuelto es el promedio real de los píxeles del cubo
 * ganador, no el centro geométrico del cubo — así un input sólido (como en el
 * caso de prueba) reproduce su color exacto en vez de un valor cuantizado.
 */
export function dominantColorFromPixels(data, opts = {}) {
  const alphaThreshold = opts.alphaThreshold ?? 16;
  const bucketBits = opts.bucketBits ?? 4;
  const shift = 8 - bucketBits;

  const buckets = new Map();
  const n = data.length / 4;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = data[o + 3];
    if (a < alphaThreshold) continue;

    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const key =
      (r >> shift) * (1 << (2 * bucketBits)) +
      (g >> shift) * (1 << bucketBits) +
      (b >> shift);

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, r: 0, g: 0, b: 0 };
      buckets.set(key, bucket);
    }
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
  }

  if (buckets.size === 0) {
    throw new ValidationError(
      'NO_OPAQUE_PIXELS',
      'No hay píxeles opacos suficientes para determinar un color dominante.',
      { alphaThreshold }
    );
  }

  let best = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }

  return rgbToHex({
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  });
}

/**
 * ¿Este buffer usa de verdad su canal alfa? `threshold` por defecto es 255:
 * basta un solo píxel que no sea totalmente opaco para responder true. Un
 * JPG decodificado siempre trae alfa 255 uniforme (no tiene canal alfa real),
 * así que da false; un PNG con transparencia parcial da true.
 */
export function pixelsHaveAlpha(data, threshold = 255) {
  const n = data.length / 4;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < threshold) return true;
  }
  return false;
}

/** Lee el píxel en (x,y) de un buffer RGBA plano de ancho `width`. */
export function samplePixel(data, width, x, y) {
  const o = (y * width + x) * 4;
  return { r: data[o], g: data[o + 1], b: data[o + 2], a: data[o + 3] };
}
