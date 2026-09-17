// GET /api/order-status?t=<public_token> — consulta de un pedido por su liga.
//
// En Etapa A el flujo termina en WhatsApp, y wa.me no admite adjuntos. Por eso
// el mensaje lleva una liga a /estudio/pedido/?t=..., y esta es la API que esa
// página consume para mostrar lo que el cliente aprobó.
//
// ── La vista es REDACTADA, y eso es el punto del endpoint ──
//
// `public_token` es la única credencial: quien tiene la liga, entra. Un uuid v4
// son 122 bits, así que no es enumerable — pero una liga se reenvía, se pega en
// un chat de grupo, se queda en un historial. Así que lo que se devuelve es
// sólo lo necesario para VER el pedido, y nada más.
//
// Fuera de la respuesta, a propósito: el id interno del pedido (es lo que usa
// external_reference de Mercado Pago en Etapa B), customer_id, el correo y el
// teléfono del cliente, los ids de pago, el pricing_snapshot completo y las
// rutas crudas de Storage. De las rutas sólo salen URLs firmadas, que caducan.

import { readEnv } from './_lib/env.js';
import { json, requireMethod } from './_lib/http.js';
import { buildPostgrestUrl, sbHeaders } from './_lib/supabase.js';
import { logError } from './_lib/log.js';
import { isUuid } from './_lib/validation.js';

// Una semana: suficiente para que el equipo trabaje el pedido sin que la liga
// quede viva indefinidamente si el mensaje se reenvía.
const SIGNED_URL_TTL = 604800;
const RATE = { window: 300, max: 30 };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  let supabaseUrl;
  let serviceKey;
  try {
    supabaseUrl = readEnv(process.env, 'SUPABASE_URL', { required: true });
    serviceKey = readEnv(process.env, 'SUPABASE_SERVICE_ROLE_KEY', { required: true });
  } catch (err) {
    logError('order-status', err);
    return json(res, 503, { error: 'NOT_CONFIGURED' });
  }

  const token = req.query?.t ?? new URL(req.url, 'http://x').searchParams.get('t');
  if (!isUuid(token)) return json(res, 400, { error: 'INVALID_TOKEN' });

  const headers = sbHeaders({ key: serviceKey });

  try {
    if (!(await rateLimit(supabaseUrl, headers, `order-status:${token}`))) {
      return json(res, 429, { error: 'RATE_LIMITED' });
    }

    const [order] = await sbGet(supabaseUrl, headers, 'orders', {
      select: 'id,short_code,status,currency,total_cents,priced_with_placeholder,created_at,customer_id',
      eq: { public_token: token },
      limit: 1,
    });
    // Cuerpo genérico: distinguir "no existe" de cualquier otra cosa ayudaría a
    // sondear tokens ajenos.
    if (!order) return json(res, 404, { error: 'NOT_FOUND' });

    const [items, [customer]] = await Promise.all([
      sbGet(supabaseUrl, headers, 'order_items', {
        select: 'item_index,garment_type_id,garment_variant_id,technique_id,size_breakdown,qty,logo_object_path,preview_object_path,unit_price_cents,subtotal_cents',
        eq: { order_id: order.id },
        order: 'item_index.asc',
      }),
      sbGet(supabaseUrl, headers, 'customers', { select: 'name', eq: { id: order.customer_id }, limit: 1 }),
    ]);

    // El catálogo se resuelve por id para poder mostrar nombres en vez de uuids.
    const [garments, variants, techniques] = await Promise.all([
      sbGet(supabaseUrl, headers, 'garment_types', {
        select: 'id,name,slug', in: { id: [...new Set(items.map((i) => i.garment_type_id))] },
      }),
      sbGet(supabaseUrl, headers, 'garment_variants', {
        select: 'id,color_hex,color_name', in: { id: [...new Set(items.map((i) => i.garment_variant_id))] },
      }),
      sbGet(supabaseUrl, headers, 'print_techniques', {
        select: 'id,name,slug', in: { id: [...new Set(items.map((i) => i.technique_id))] },
      }),
    ]);

    const itemsSalida = await Promise.all(items.map(async (it) => ({
      item_index: it.item_index,
      garment: garments.find((g) => g.id === it.garment_type_id)?.name ?? null,
      color_hex: variants.find((v) => v.id === it.garment_variant_id)?.color_hex ?? null,
      color_name: variants.find((v) => v.id === it.garment_variant_id)?.color_name ?? null,
      technique: techniques.find((t) => t.id === it.technique_id)?.name ?? null,
      size_breakdown: it.size_breakdown,
      qty: it.qty,
      unit_price_cents: it.unit_price_cents,
      subtotal_cents: it.subtotal_cents,
      preview_url: await firmar(supabaseUrl, headers, 'previews', it.preview_object_path),
      logo_url: await firmar(supabaseUrl, headers, 'logos', it.logo_object_path),
    })));

    return json(res, 200, {
      short_code: order.short_code,
      status: order.status,
      currency: order.currency,
      total_cents: order.total_cents,
      priced_with_placeholder: order.priced_with_placeholder,
      created_at: order.created_at,
      customer_name: customer?.name ?? null,
      items: itemsSalida,
    });
  } catch (err) {
    logError('order-status', err);
    return json(res, 502, { error: 'LOOKUP_FAILED' });
  }
}

/**
 * URL firmada de lectura para un bucket privado.
 *
 * Forma verificada contra el proyecto real: la respuesta trae `signedURL` (con
 * URL en mayúsculas) y su valor es una ruta RELATIVA que empieza en
 * `/object/sign/...`, así que hay que anteponer `${SUPABASE_URL}/storage/v1`.
 * Sin ese prefijo se obtiene un 404 al abrirla — un fallo que sólo aparece
 * cuando alguien hace clic en la liga, no al construirla.
 *
 * Si la firma falla devuelve null en vez de lanzar: una imagen que no carga es
 * mucho mejor que una página de pedido que no abre.
 */
async function firmar(baseUrl, headers, bucket, path) {
  if (!path) return null;
  try {
    const r = await fetch(`${baseUrl.replace(/\/+$/, '')}/storage/v1/object/sign/${bucket}/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL }),
    });
    if (!r.ok) {
      logError('order-status', new Error(`firma ${r.status} en ${bucket}`), { bucket });
      return null;
    }
    const { signedURL } = await r.json();
    if (typeof signedURL !== 'string') return null;
    return `${baseUrl.replace(/\/+$/, '')}/storage/v1${signedURL.startsWith('/') ? '' : '/'}${signedURL}`;
  } catch (err) {
    logError('order-status', err, { bucket });
    return null;
  }
}

async function rateLimit(baseUrl, headers, bucket) {
  const r = await fetch(`${baseUrl.replace(/\/+$/, '')}/rest/v1/rpc/rpc_rate_limit_hit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_bucket: bucket, p_window_seconds: RATE.window, p_max_hits: RATE.max }),
  });
  // Fail-open deliberado: cortar consultas legítimas porque el limitador se
  // cayó sería peor que el abuso que previene. Mismo criterio que submit-quote.
  if (!r.ok) {
    logError('order-status', new Error(`rate limit ${r.status}`), { bucket });
    return true;
  }
  return r.json();
}

async function sbGet(baseUrl, headers, table, params) {
  const r = await fetch(buildPostgrestUrl(baseUrl, table, params), { headers });
  if (!r.ok) throw new Error(`PostgREST ${r.status} en ${table}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
