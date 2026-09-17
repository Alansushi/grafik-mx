// POST /api/quote — el precio autoritativo.
//
// El cliente NUNCA manda precios y este endpoint NUNCA los acepta: el body sólo
// lleva qué prenda, qué técnica y cuántas piezas por talla. El total se calcula
// aquí, leyendo pricing_rules con service_role — la única forma de conocer la
// tabla de precios, porque con la anon key esa tabla devuelve 401.
//
// Tampoco DEVUELVE la tabla de precios: sale el unitario y el total del tramo
// que aplica, no los demás tramos. Un competidor no puede reconstruir el
// tabulador pidiendo cotizaciones.

import { readEnv } from './_lib/env.js';
import { json, requireMethod, readJsonBody } from './_lib/http.js';
import { buildPostgrestUrl, sbHeaders } from './_lib/supabase.js';
import { logError } from './_lib/log.js';
import { normalizeBreakdown, validateBreakdown, totalUnits } from '../estudio/lib/sizes.js';
import { quote, quoteCart } from '../estudio/lib/pricing.js';
import { isUuid } from './_lib/validation.js';

const MAX_ITEMS = 10;

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  let supabaseUrl;
  let serviceKey;
  try {
    supabaseUrl = readEnv(process.env, 'SUPABASE_URL', { required: true });
    serviceKey = readEnv(process.env, 'SUPABASE_SERVICE_ROLE_KEY', { required: true });
  } catch (err) {
    logError('quote', err);
    return json(res, 503, { error: 'NOT_CONFIGURED' });
  }

  let body;
  try {
    body = await readJsonBody(req, { maxBytes: 65536 });
  } catch (err) {
    return json(res, err.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: err.code ?? 'BAD_REQUEST' });
  }

  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items || items.length === 0) {
    return json(res, 400, { error: 'EMPTY_ITEMS' });
  }
  if (items.length > MAX_ITEMS) {
    return json(res, 400, { error: 'TOO_MANY_ITEMS', max: MAX_ITEMS });
  }
  for (const it of items) {
    if (!isUuid(it?.garment_type_id) || !isUuid(it?.technique_id)) {
      return json(res, 400, { error: 'INVALID_ID' });
    }
  }

  const headers = sbHeaders({ key: serviceKey });

  try {
    // Se piden sólo las prendas y reglas que esta cotización necesita, no el
    // catálogo entero.
    const garmentIds = [...new Set(items.map((i) => i.garment_type_id))];
    const [garments, rules] = await Promise.all([
      sbGet(supabaseUrl, headers, 'garment_types', {
        select: 'id,slug,name,allowed_sizes,min_qty,max_qty,is_active',
        in: { id: garmentIds },
      }),
      sbGet(supabaseUrl, headers, 'pricing_rules', {
        select: 'id,garment_type_id,technique_id,tiers,technique_surcharge_cents,size_surcharges_cents,currency,is_placeholder',
        in: { garment_type_id: garmentIds },
      }),
    ]);

    const quoteInputs = [];
    const perItem = [];

    for (const [index, it] of items.entries()) {
      const garment = garments.find((g) => g.id === it.garment_type_id);
      if (!garment || !garment.is_active) {
        return json(res, 404, { error: 'GARMENT_NOT_FOUND', index });
      }
      const rule = rules.find(
        (r) => r.garment_type_id === it.garment_type_id && r.technique_id === it.technique_id,
      );
      if (!rule) {
        return json(res, 404, { error: 'PRICING_RULE_NOT_FOUND', index });
      }

      // normalizeBreakdown ANTES de cualquier suma: un <input type="number">
      // devuelve strings, y totalUnits lanza NON_NUMERIC_QTY si se le pasan
      // sin normalizar (ver estudio/lib/sizes.js).
      let breakdown;
      try {
        breakdown = normalizeBreakdown(it.size_breakdown ?? {});
      } catch (err) {
        return json(res, 400, { error: err.code ?? 'INVALID_BREAKDOWN', index });
      }

      const check = validateBreakdown(breakdown, {
        allowedSizes: garment.allowed_sizes,
        minTotal: garment.min_qty,
        maxTotal: garment.max_qty,
      });
      if (!check.valid) {
        return json(res, 400, { error: 'INVALID_BREAKDOWN', index, details: check.errors });
      }

      quoteInputs.push({ rule, breakdown });
      perItem.push({ index, garment_slug: garment.slug, qty: totalUnits(breakdown) });
    }

    const cart = quoteCart(quoteInputs);

    return json(res, 200, {
      currency: cart.currency,
      total_cents: cart.total_cents,
      is_placeholder: cart.is_placeholder,
      items: cart.items.map((q, i) => ({
        ...perItem[i],
        unit_price_cents: q.unit_price_cents,
        subtotal_cents: q.subtotal_cents,
        size_surcharge_cents: q.size_surcharge_cents,
        total_cents: q.total_cents,
        lines: q.lines,
        // tier_applied NO se devuelve: revelaría los límites del tramo y, con
        // varias consultas, todo el tabulador.
      })),
    });
  } catch (err) {
    logError('quote', err);
    return json(res, 502, { error: 'QUOTE_FAILED' });
  }
}

async function sbGet(baseUrl, headers, table, params) {
  const r = await fetch(buildPostgrestUrl(baseUrl, table, params), { headers });
  if (!r.ok) {
    const body = await r.text().catch(() => '(sin cuerpo)');
    throw new Error(`PostgREST ${r.status} en ${table}: ${body.slice(0, 200)}`);
  }
  return r.json();
}
