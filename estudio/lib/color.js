// estudio/lib/color.js — utilidades de color puras (sin DOM, sin canvas).
//
// @typedef {{r:number,g:number,b:number}} Rgb
// @typedef {{h:number,s:number,l:number}} Hsl   // h en 0..360, s/l en 0..1

import { ValidationError } from './errors.js';

const HEX_FULL_RE = /^[0-9a-fA-F]{6}$/;
const HEX_SHORT_RE = /^[0-9a-fA-F]{3}$/;

/**
 * Umbral WCAG en el que se considera que un fondo es "oscuro" a efectos de
 * elegir variante de logo. No es 0.5: la percepción de luminancia no es
 * lineal, y 0.179 es el punto donde el contraste contra blanco puro empieza
 * a caer por debajo de 4.5:1 (el mínimo AA para texto).
 */
const DARK_LUMINANCE_THRESHOLD = 0.179;

/** Acepta '#RRGGBB', 'RRGGBB' y el shorthand '#RGB' / 'RGB'. */
export function hexToRgb(hex) {
  if (typeof hex !== 'string' || hex.length === 0) {
    throw new ValidationError('INVALID_HEX', 'El color no puede estar vacío.', { hex });
  }
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  let full;
  if (HEX_SHORT_RE.test(clean)) {
    full = clean.split('').map((c) => c + c).join('');
  } else if (HEX_FULL_RE.test(clean)) {
    full = clean;
  } else {
    throw new ValidationError('INVALID_HEX', `"${hex}" no es un color hexadecimal válido.`, { hex });
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Siempre devuelve '#RRGGBB' en mayúsculas, sin importar cómo llegó el rgb.
 *
 * Acota a [0,255] antes de convertir: compose.js alimenta esta función con
 * canales CALCULADOS (clipColor del blend W3C, buckets de
 * dominantColorFromPixels), no leídos de un hex. Sin acotar, un canal de 300
 * produce '12c' —tres dígitos— y el hex sale corrupto sin lanzar nada.
 */
export function rgbToHex({ r, g, b }) {
  const toHex = (channel) => {
    const clamped = Math.min(255, Math.max(0, Math.round(channel)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/** Linealiza un canal 8-bit sRGB según WCAG 2.x. */
export function srgbToLinear(channel8bit) {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa WCAG 2.x: 0.2126 R + 0.7152 G + 0.0722 B, canales linealizados. */
export function relativeLuminance({ r, g, b }) {
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

/** Ratio de contraste WCAG entre dos hex. Simétrico por construcción (max/min). */
export function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isDarkColor(hex) {
  return relativeLuminance(hexToRgb(hex)) < DARK_LUMINANCE_THRESHOLD;
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { h: 0, s: 0, l };
  }

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === rn) {
    h = ((gn - bn) / delta) % 6;
  } else if (max === gn) {
    h = (bn - rn) / delta + 2;
  } else {
    h = (rn - gn) / delta + 4;
  }
  h *= 60;
  if (h < 0) h += 360;

  return { h, s, l };
}

export function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  // Normaliza h a [0,360) por si llega ligeramente fuera de rango (p.ej. 360
  // exacto por acumulación de error flotante en el round-trip con rgbToHsl).
  const hh = ((h % 360) + 360) % 360;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;

  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c; gp = x; bp = 0;
  } else if (hh < 120) {
    rp = x; gp = c; bp = 0;
  } else if (hh < 180) {
    rp = 0; gp = c; bp = x;
  } else if (hh < 240) {
    rp = 0; gp = x; bp = c;
  } else if (hh < 300) {
    rp = x; gp = 0; bp = c;
  } else {
    rp = c; gp = 0; bp = x;
  }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

/**
 * Legibilidad del logo sobre la prenda, en términos entendibles sin conocer
 * WCAG: 'ok' (AA para texto normal, ratio >= 4.5), 'warn' (roza el mínimo
 * para texto grande, ratio >= 3) o 'fail' (por debajo de eso).
 */
export function legibility(garmentHex, logoHex) {
  const ratio = contrastRatio(garmentHex, logoHex);
  const ratioLabel = ratio.toFixed(2);

  let level;
  let message;
  if (ratio >= 4.5) {
    level = 'ok';
    message = `Buen contraste (${ratioLabel}:1): el logo se verá nítido sobre esta prenda.`;
  } else if (ratio >= 3) {
    level = 'warn';
    message = `Contraste moderado (${ratioLabel}:1): el logo podría verse apagado sobre esta prenda.`;
  } else {
    level = 'fail';
    message = `Contraste bajo (${ratioLabel}:1): el logo será difícil de distinguir sobre esta prenda.`;
  }
  return { ratio, level, message };
}

/** Sugiere variante de logo ('claro' sobre prendas oscuras, 'oscuro' sobre claras). */
export function suggestLogoVariant(garmentHex) {
  return isDarkColor(garmentHex) ? 'claro' : 'oscuro';
}
