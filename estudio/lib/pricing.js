// estudio/lib/pricing.js — motor de precios: tiers por volumen, recargos y
// el candado que impide cobrar precios placeholder en producción.
//
// Convención transversal (ver también sizes.js y format.js): TODO el dinero
// es un entero de centavos. Nunca se divide dinero entre cantidades ni se
// multiplica por fracciones — sólo sumas y multiplicaciones enteras, que en
// JS son exactas dentro del rango seguro (Number.MAX_SAFE_INTEGER). Eso es
// lo único que garantiza Number.isInteger(total_cents) siempre, sin redondeos
// explícitos en ningún punto de este archivo.
//
// @typedef {{min_qty:number, max_qty:number|null, unit_price_cents:number}} Tier
// @typedef {{id:string, garment_type_id:string, technique_id:string,
//            tiers:Tier[], technique_surcharge_cents:number,
//            size_surcharges_cents:Record<string,number>,
//            currency:'MXN', is_placeholder:boolean}} PricingRule

import { PricingError, MpConfigError } from './errors.js';
import { totalUnits } from './sizes.js';

/** Ordena tiers ascendentemente por min_qty, sin mutar el array de entrada. */
export function sortTiers(tiers) {
  return [...tiers].sort((a, b) => a.min_qty - b.min_qty);
}

/**
 * Valida la forma estructural de una lista de tiers de precio: que no haya
 * huecos (GAP) ni solapes (OVERLAP) entre tramos consecutivos, que el primer
 * tramo empiece en 1, que el último quede abierto (max_qty:null — sin techo
 * de cantidad) y que ningún precio sea negativo. Acumula todos los errores
 * encontrados; no se detiene en el primero.
 */
export function validateTiers(tiers) {
  const errors = [];
  const sorted = sortTiers(tiers);

  // Una lista vacía pasaba como válida y sólo reventaba después, en
  // resolveTier. El panel de admin (incremento 13) usa esta función para
  // decidir si guarda una regla de precio: sin este chequeo guardaría una
  // regla incobrable y el fallo aparecería recién en el checkout de un
  // cliente real.
  if (sorted.length === 0) {
    errors.push({ code: 'NO_TIERS' });
    return { valid: false, errors };
  }

  for (const tier of sorted) {
    if (tier.unit_price_cents < 0) {
      errors.push({ code: 'NEGATIVE_PRICE' });
    }
  }

  if (sorted.length > 0 && sorted[0].min_qty !== 1) {
    errors.push({ code: 'MUST_START_AT_1' });
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.max_qty === null) continue; // un tramo abierto no deja hueco ni se solapa
    if (next.min_qty > current.max_qty + 1) {
      errors.push({ code: 'GAP', at: current.max_qty + 1 });
    } else if (next.min_qty <= current.max_qty) {
      errors.push({ code: 'OVERLAP', at: next.min_qty });
    }
  }

  if (sorted.length > 0 && sorted[sorted.length - 1].max_qty !== null) {
    errors.push({ code: 'MISSING_OPEN_TIER' });
  }

  return { valid: errors.length === 0, errors };
}

/** Encuentra el tier aplicable a una cantidad. Tolera tiers desordenados. */
export function resolveTier(tiers, qty) {
  if (qty === 0) {
    throw new PricingError('QTY_ZERO', 'La cantidad no puede ser cero.', { qty });
  }
  if (qty < 0) {
    throw new PricingError('QTY_NEGATIVE', 'La cantidad no puede ser negativa.', { qty });
  }
  if (tiers.length === 0) {
    throw new PricingError('NO_TIERS', 'La regla de precio no tiene tramos definidos.', {});
  }

  const sorted = sortTiers(tiers);
  const found = sorted.find(
    (tier) => qty >= tier.min_qty && (tier.max_qty === null || qty <= tier.max_qty),
  );
  if (!found) {
    throw new PricingError('NO_TIER_FOR_QTY', `Ningún tramo de precio cubre la cantidad ${qty}.`, { qty });
  }
  return found;
}

/** Precio unitario: el del tier resuelto más el recargo fijo de técnica. */
export function unitPriceCents(rule, qty) {
  const tier = resolveTier(rule.tiers, qty);
  return tier.unit_price_cents + rule.technique_surcharge_cents;
}

/** Suma de recargos por talla: recargo_por_unidad × cantidad, por cada talla presente. */
export function sizeSurchargeCents(rule, breakdown) {
  let total = 0;
  for (const size of Object.keys(breakdown)) {
    const perUnit = rule.size_surcharges_cents?.[size] || 0;
    total += perUnit * breakdown[size];
  }
  return total;
}

/** Cotiza un item: resuelve tier, aplica recargos y desglosa en `lines`. */
export function quote({ rule, breakdown }) {
  const qty = totalUnits(breakdown);
  const tierApplied = resolveTier(rule.tiers, qty);
  const unitCents = tierApplied.unit_price_cents + rule.technique_surcharge_cents;
  const subtotalCents = unitCents * qty;
  const sizeSurcharge = sizeSurchargeCents(rule, breakdown);
  const totalCents = subtotalCents + sizeSurcharge;

  const lines = [{ label: 'Subtotal', qty, unit_cents: unitCents, amount_cents: subtotalCents }];
  if (sizeSurcharge > 0) {
    lines.push({ label: 'Recargo por talla', qty: 1, unit_cents: sizeSurcharge, amount_cents: sizeSurcharge });
  }

  return {
    qty,
    tier_applied: tierApplied,
    unit_price_cents: unitCents,
    subtotal_cents: subtotalCents,
    technique_surcharge_cents: rule.technique_surcharge_cents,
    size_surcharge_cents: sizeSurcharge,
    total_cents: totalCents,
    currency: rule.currency,
    is_placeholder: rule.is_placeholder,
    lines,
  };
}

/**
 * Cotiza un carrito completo. `is_placeholder` se propaga con OR: basta un
 * solo item con precio placeholder para que el carrito entero se considere
 * no cobrable en producción (ver assertChargeable) — un carrito no es "más
 * confiable" que su item menos confiable.
 */
export function quoteCart(items) {
  const quotes = items.map((item) => quote(item));
  const totalCents = quotes.reduce((sum, q) => sum + q.total_cents, 0);
  const isPlaceholder = quotes.some((q) => q.is_placeholder);
  const currency = quotes.length > 0 ? quotes[0].currency : 'MXN';
  return { items: quotes, total_cents: totalCents, is_placeholder: isPlaceholder, currency };
}

/** Un access token de Mercado Pago de pruebas siempre empieza con 'TEST-'. */
export function isTestAccessToken(token) {
  return typeof token === 'string' && token.startsWith('TEST-');
}

/**
 * Candado de precios placeholder — decisión de seguridad, no una validación
 * más. No existe ningún flag "ALLOW_PLACEHOLDER=true" en ninguna parte del
 * sistema: la única condición que habilita cobrar un carrito con precios
 * placeholder es que el access token de Mercado Pago sea de pruebas
 * ('TEST-...'). Un access token real de Mercado Pago SIEMPRE empieza con
 * 'APP_USR-', nunca con 'TEST-' — por construcción de Mercado Pago, no por
 * convención nuestra. Eso hace la regla auto-aplicable: para que un
 * placeholder se cobrara "por accidente" en producción, alguien tendría que
 * configurar ahí un access token de pruebas, lo cual rompe cualquier cobro
 * real y se notaría de inmediato. No hay interruptor que alguien pueda
 * activar sin querer.
 */
export function assertChargeable(cart, { accessToken } = {}) {
  if (!accessToken) {
    throw new MpConfigError('MISSING_ACCESS_TOKEN', 'Falta configurar el access token de Mercado Pago.', {});
  }
  // Defensa en profundidad: buildPreferenceBody (§2.8) ya rechaza items vacíos
  // y precio cero, pero una preferencia de $0 no debería llegar siquiera hasta
  // allá. Cobrar $0 no falla ruidosamente en Mercado Pago: crea un pedido
  // fantasma que parece legítimo.
  if (!cart.items || cart.items.length === 0) {
    throw new PricingError('EMPTY_CART', 'No se puede cobrar un carrito vacío.', {});
  }
  if (!(cart.total_cents > 0)) {
    throw new PricingError(
      'NON_POSITIVE_TOTAL',
      'No se puede cobrar un total de cero o negativo.',
      { total_cents: cart.total_cents },
    );
  }
  if (cart.is_placeholder && !isTestAccessToken(accessToken)) {
    throw new PricingError(
      'PLACEHOLDER_PRICING_IN_LIVE_MODE',
      'No se puede cobrar un precio placeholder con un access token de producción.',
      {},
    );
  }
}
