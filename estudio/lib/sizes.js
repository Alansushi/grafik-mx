// estudio/lib/sizes.js — normalización y validación del desglose de tallas.
//
// @typedef {Record<string, number>} SizeBreakdown

import { ValidationError } from './errors.js';

export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/**
 * Ordena claves de talla según SIZE_ORDER. Las tallas conocidas van primero
 * en su orden canónico; cualquier clave que no esté en SIZE_ORDER (p.ej. una
 * talla mal escrita que validateBreakdown reportará como UNKNOWN_SIZE) se
 * conserva al final, en el orden relativo en que llegó — así ninguna talla
 * se pierde silenciosamente sólo por no ser reconocida.
 */
export function sortSizes(keys) {
  const known = keys.filter((k) => SIZE_ORDER.includes(k));
  const unknown = keys.filter((k) => !SIZE_ORDER.includes(k));
  known.sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
  return [...known, ...unknown];
}

/**
 * Normaliza un desglose crudo (típicamente tecleado por un usuario): recorta
 * espacios, sube a mayúsculas, coerciona cantidades numéricas en string y
 * descarta las tallas en cero (una talla en 0 no es información, es ruido).
 * No valida rangos ni pertenencia a SIZE_ORDER — eso es trabajo de
 * validateBreakdown, que necesita poder reportar esos casos como errores en
 * vez de que normalizeBreakdown los haga desaparecer.
 */
export function normalizeBreakdown(raw) {
  const collected = {};
  for (const rawKey of Object.keys(raw)) {
    const size = rawKey.trim().toUpperCase();
    const rawValue = raw[rawKey];
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (Number.isNaN(value)) {
      throw new ValidationError(
        'NON_NUMERIC_QTY',
        `La cantidad de la talla "${size}" no es numérica.`,
        { size, value: rawValue },
      );
    }
    if (value === 0) continue;
    collected[size] = value;
  }

  const ordered = {};
  for (const size of sortSizes(Object.keys(collected))) {
    ordered[size] = collected[size];
  }
  return ordered;
}

/**
 * Suma las piezas de un desglose. Falla RUIDOSO ante cualquier valor que no
 * sea un número finito, en vez de intentar coercionarlo.
 *
 * La versión ingenua (`reduce((s, q) => s + q, 0)`) concatenaba en cuanto las
 * cantidades llegaban como string — y llegan así por defecto, porque un
 * `<input type="number">` del DOM devuelve strings. `{M:'5', L:'7'}` daba
 * `'057'`: un pedido de 12 piezas se cotizaba como 57, saltaba al tramo de
 * 50+ y cobraba casi cuatro veces de más, sin que `Number.isInteger` del
 * total lo detectara.
 *
 * Coercionar aquí en silencio sería igual de malo: escondería que alguien se
 * saltó `normalizeBreakdown`, que es el módulo cuyo trabajo ES normalizar. El
 * contrato es normalizar primero, sumar después.
 */
export function totalUnits(b) {
  let total = 0;
  for (const size of Object.keys(b)) {
    const qty = b[size];
    if (typeof qty !== 'number' || !Number.isFinite(qty)) {
      throw new ValidationError(
        'NON_NUMERIC_QTY',
        `La cantidad de la talla "${size}" no es un número. Normaliza el desglose con normalizeBreakdown antes de sumarlo.`,
        { size, value: qty },
      );
    }
    total += qty;
  }
  return total;
}

/**
 * Valida un desglose de tallas contra las reglas del catálogo. Acumula
 * TODOS los errores encontrados en vez de detenerse en el primero: un
 * formulario que reporta un solo error a la vez obliga al cliente a
 * corregir y reenviar en rondas, cuando puede señalar todo de una vez.
 *
 * `allowedSizes` por defecto es SIZE_ORDER completo: sin esa lista explícita
 * no tendría sentido aceptar una talla que el propio módulo no reconoce.
 */
export function validateBreakdown(b, opts = {}) {
  const { allowedSizes = SIZE_ORDER, minTotal, maxTotal, maxPerSize } = opts;
  const errors = [];
  let total = 0;

  for (const size of Object.keys(b)) {
    const qty = b[size];

    // A diferencia de totalUnits, aquí no se lanza: el trabajo de esta
    // función es REPORTAR todos los problemas de una vez para que el
    // formulario los muestre juntos. Pero el valor no numérico se excluye del
    // total, para que `total` siempre sea un número y no una concatenación.
    if (typeof qty !== 'number' || !Number.isFinite(qty)) {
      errors.push({ code: 'NON_NUMERIC_QTY', size });
      continue;
    }
    total += qty;

    if (!allowedSizes.includes(size)) {
      errors.push({ code: 'UNKNOWN_SIZE', size });
      continue; // una talla que no existe no tiene cantidad que evaluar
    }
    if (qty < 0) {
      errors.push({ code: 'NEGATIVE_QTY', size });
    } else if (!Number.isInteger(qty)) {
      errors.push({ code: 'NON_INTEGER', size });
    }
    if (maxPerSize !== undefined && qty > maxPerSize) {
      errors.push({ code: 'MAX_PER_SIZE', size, max: maxPerSize, got: qty });
    }
  }

  if (minTotal !== undefined && total < minTotal) {
    errors.push({ code: 'BELOW_MIN', min: minTotal, got: total });
  }
  if (maxTotal !== undefined && total > maxTotal) {
    errors.push({ code: 'ABOVE_MAX', max: maxTotal, got: total });
  }

  return { valid: errors.length === 0, total, errors };
}

/** Etiqueta legible: '6 pzas · S×2 M×4', tallas en orden canónico. */
export function breakdownToLabel(b) {
  const total = totalUnits(b);
  const parts = sortSizes(Object.keys(b)).map((size) => `${size}×${b[size]}`);
  return `${total} pzas · ${parts.join(' ')}`;
}

/** Suma dos desgloses talla por talla, sin mutar ninguno de los dos. */
export function mergeBreakdowns(a, b) {
  const merged = {};
  for (const size of new Set([...Object.keys(a), ...Object.keys(b)])) {
    merged[size] = (a[size] || 0) + (b[size] || 0);
  }

  const ordered = {};
  for (const size of sortSizes(Object.keys(merged))) {
    ordered[size] = merged[size];
  }
  return ordered;
}
