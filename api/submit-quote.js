// POST /api/submit-quote — crea el pedido de Etapa A.
//
// Cierra el embudo sin cobrar: el pedido nace en estado `quoted` y el cliente
// lo manda por WhatsApp. En Etapa B, el botón de pagar lo moverá a
// `pending_payment` sin tocar nada de este archivo.
//
// ── Dos reglas de seguridad que sostienen todo lo demás ──
//
// 1. EL PRECIO SE RECALCULA AQUÍ. El body no trae ni puede traer cifras: sólo
//    qué prenda, qué técnica y cuántas piezas por talla. El total sale de
//    pricing_rules leído con service_role. Que el cliente no pueda siquiera
//    EXPRESAR un precio es lo que hace imposible manipularlo — no una
//    validación que alguien pueda olvidar más adelante.
//
// 2. LAS RUTAS DE STORAGE DEBEN PERTENECER AL PROPIO BORRADOR. upload-url emite
//    rutas con la forma `YYYY/MM/<draftId>/archivo`. Sin comprobar que el
//    draftId de cada ruta coincide con el del cuerpo, un cliente podría mandar
//    la ruta del logo de OTRO pedido y después leerlo con su propia liga de
//    /api/order-status, que firma lo que encuentre en la fila. Es el agujero
//    clásico de referencia directa a objetos, y aquí se cierra de entrada.

import { readEnv } from './_lib/env.js';
import { json, requireMethod, readJsonBody, clientIp } from './_lib/http.js';
import { buildPostgrestUrl, sbHeaders } from './_lib/supabase.js';
import { logError } from './_lib/log.js';
import { isUuid, isEmail, normalizeMxPhone, isMxPhone } from './_lib/validation.js';
import { normalizeBreakdown, validateBreakdown, totalUnits } from '../estudio/lib/sizes.js';
import { quoteCart } from '../estudio/lib/pricing.js';

const MAX_ITEMS = 10;
// Un pedido por WhatsApp no se manda diez veces seguidas. Limita el daño de un
// reintento en bucle o de un script: cinco envíos por IP cada diez minutos.
const RATE = { window: 600, max: 5 };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  let supabaseUrl;
  let serviceKey;
  try {
    supabaseUrl = readEnv(process.env, 'SUPABASE_URL', { required: true });
    serviceKey = readEnv(process.env, 'SUPABASE_SERVICE_ROLE_KEY', { required: true });
  } catch (err) {
    logError('submit-quote', err);
    return json(res, 503, { error: 'NOT_CONFIGURED' });
  }

  let body;
  try {
    body = await readJsonBody(req, { maxBytes: 65536 });
  } catch (err) {
    return json(res, err.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: err.code ?? 'BAD_REQUEST' });
  }

  const headers = sbHeaders({ key: serviceKey });
  const ip = clientIp(req);

  // ── Validación del cuerpo ────────────────────────────────────────────────
  const { draftId, customer, items } = body ?? {};

  if (!isUuid(draftId)) return json(res, 400, { error: 'INVALID_DRAFT_ID' });
  if (!customer || !isEmail(customer.email)) return json(res, 400, { error: 'INVALID_EMAIL' });
  if (!customer.name || String(customer.name).trim().length < 2) {
    return json(res, 400, { error: 'INVALID_NAME' });
  }
  if (customer.phone && !isMxPhone(customer.phone)) {
    return json(res, 400, { error: 'INVALID_PHONE' });
  }
  if (!Array.isArray(items) || items.length === 0) return json(res, 400, { error: 'EMPTY_ITEMS' });
  if (items.length > MAX_ITEMS) return json(res, 400, { error: 'TOO_MANY_ITEMS', max: MAX_ITEMS });

  for (const [i, it] of items.entries()) {
    if (!isUuid(it?.garment_type_id) || !isUuid(it?.garment_variant_id) || !isUuid(it?.technique_id)) {
      return json(res, 400, { error: 'INVALID_ID', index: i });
    }
    // La comprobación que cierra el agujero de referencia directa.
    for (const campo of ['logo_path', 'preview_path']) {
      const ruta = it?.[campo];
      if (typeof ruta !== 'string' || !ruta.includes(`/${draftId}/`) || ruta.includes('..')) {
        return json(res, 400, { error: 'PATH_NOT_IN_DRAFT', index: i, field: campo });
      }
    }
    if (!it?.logo_transform || typeof it.logo_transform !== 'object') {
      return json(res, 400, { error: 'MISSING_TRANSFORM', index: i });
    }
  }

  try {
    const permitido = await rateLimit(supabaseUrl, headers, `submit:${ip}`);
    if (!permitido) return json(res, 429, { error: 'RATE_LIMITED' });

    // ── Re-cotización autoritativa ─────────────────────────────────────────
    const garmentIds = [...new Set(items.map((i) => i.garment_type_id))];
    const [garments, variants, rules] = await Promise.all([
      sbGet(supabaseUrl, headers, 'garment_types', {
        select: 'id,slug,name,allowed_sizes,min_qty,max_qty,is_active',
        in: { id: garmentIds },
      }),
      sbGet(supabaseUrl, headers, 'garment_variants', {
        select: 'id,garment_type_id,color_hex,color_name',
        in: { garment_type_id: garmentIds },
      }),
      sbGet(supabaseUrl, headers, 'pricing_rules', {
        select: 'id,garment_type_id,technique_id,tiers,technique_surcharge_cents,size_surcharges_cents,currency,is_placeholder',
        in: { garment_type_id: garmentIds },
      }),
    ]);

    const quoteInputs = [];
    const preparados = [];

    for (const [index, it] of items.entries()) {
      const garment = garments.find((g) => g.id === it.garment_type_id);
      if (!garment?.is_active) return json(res, 404, { error: 'GARMENT_NOT_FOUND', index });

      // El color debe pertenecer a ESA prenda: un variant_id de otra prenda
      // produciría un pedido imposible de producir.
      const variant = variants.find(
        (v) => v.id === it.garment_variant_id && v.garment_type_id === it.garment_type_id,
      );
      if (!variant) return json(res, 404, { error: 'VARIANT_NOT_FOUND', index });

      const rule = rules.find(
        (r) => r.garment_type_id === it.garment_type_id && r.technique_id === it.technique_id,
      );
      if (!rule) return json(res, 404, { error: 'PRICING_RULE_NOT_FOUND', index });

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
      preparados.push({ index, item: it, garment, variant, breakdown });
    }

    const cart = quoteCart(quoteInputs);

    // Nota: NO se llama assertChargeable. Es deliberado — en Etapa A no se
    // cobra, así que un precio placeholder sí puede cotizarse y enviarse por
    // WhatsApp. El candado entra en Etapa B, en /api/checkout, que es donde
    // hay dinero de por medio. Lo que sí se hace es dejar constancia en la fila
    // (priced_with_placeholder) para que nadie confunda después una cifra de
    // referencia con una confirmada.

    // ── Persistencia ───────────────────────────────────────────────────────
    const customerId = await upsertCustomer(supabaseUrl, headers, customer);

    const [order] = await sbInsert(supabaseUrl, headers, 'orders', [{
      customer_id: customerId,
      status: 'quoted',
      currency: cart.currency,
      total_cents: cart.total_cents,
      priced_with_placeholder: cart.is_placeholder,
    }], 'id,short_code,public_token');

    const filas = preparados.map(({ index, item, garment, variant, breakdown }) => ({
      order_id: order.id,
      item_index: index,
      garment_type_id: garment.id,
      garment_variant_id: variant.id,
      technique_id: item.technique_id,
      size_breakdown: breakdown,
      qty: totalUnits(breakdown),
      logo_object_path: item.logo_path,
      preview_object_path: item.preview_path,
      logo_transform: item.logo_transform,
      unit_price_cents: cart.items[index].unit_price_cents,
      subtotal_cents: cart.items[index].subtotal_cents,
      // El Quote entero congelado: si mañana cambian las pricing_rules, este
      // pedido conserva con qué precio se cerró.
      pricing_snapshot: cart.items[index],
    }));

    try {
      await sbInsert(supabaseUrl, headers, 'order_items', filas, 'id');
    } catch (err) {
      // Un pedido sin líneas es basura que nadie va a poder interpretar: se
      // borra para no dejarlo huérfano en el panel. Si el borrado también
      // falla, se registra con el short_code para poder limpiarlo a mano.
      await sbDelete(supabaseUrl, headers, 'orders', order.id).catch((e2) =>
        logError('submit-quote', e2, { huerfano: order.short_code }));
      throw err;
    }

    return json(res, 201, {
      short_code: order.short_code,
      public_token: order.public_token,
      total_cents: cart.total_cents,
      currency: cart.currency,
      is_placeholder: cart.is_placeholder,
    });
  } catch (err) {
    logError('submit-quote', err, { ip });
    return json(res, 502, { error: 'SUBMIT_FAILED' });
  }
}

/**
 * Cliente invitado: sin cuenta ni contraseña, el correo lo identifica. Si ya
 * existe se reutiliza su fila en vez de duplicarla — el índice único es sobre
 * lower(email), así que insertar de nuevo fallaría de todos modos.
 */
async function upsertCustomer(baseUrl, headers, customer) {
  const email = String(customer.email).trim().toLowerCase();
  const existentes = await sbGet(baseUrl, headers, 'customers', {
    select: 'id', eq: { email }, limit: 1,
  });
  if (existentes[0]) return existentes[0].id;

  const [fila] = await sbInsert(baseUrl, headers, 'customers', [{
    email,
    name: String(customer.name).trim(),
    phone: customer.phone ? normalizeMxPhone(customer.phone) : null,
  }], 'id');
  return fila.id;
}

async function rateLimit(baseUrl, headers, bucket) {
  const r = await fetch(`${baseUrl.replace(/\/+$/, '')}/rest/v1/rpc/rpc_rate_limit_hit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_bucket: bucket, p_window_seconds: RATE.window, p_max_hits: RATE.max }),
  });
  // Si el limitador falla, se deja pasar: cortar pedidos legítimos porque una
  // función auxiliar se cayó sería peor que el abuso que previene. Queda el log.
  if (!r.ok) {
    logError('submit-quote', new Error(`rate limit ${r.status}`), { bucket });
    return true;
  }
  return r.json();
}

async function sbGet(baseUrl, headers, table, params) {
  const r = await fetch(buildPostgrestUrl(baseUrl, table, params), { headers });
  if (!r.ok) throw new Error(`PostgREST ${r.status} en ${table}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function sbInsert(baseUrl, headers, table, rows, select) {
  const url = buildPostgrestUrl(baseUrl, table, { select });
  const r = await fetch(url, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`PostgREST ${r.status} insertando en ${table}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function sbDelete(baseUrl, headers, table, id) {
  const r = await fetch(buildPostgrestUrl(baseUrl, table, { eq: { id } }), { method: 'DELETE', headers });
  if (!r.ok) throw new Error(`PostgREST ${r.status} borrando de ${table}`);
}
