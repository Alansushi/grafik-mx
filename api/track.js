// POST /api/track — recibe lotes de eventos de analítica del sitio.
//
// Lo llama analytics.js con sendBeacon, así que el cliente NUNCA lee la
// respuesta: los códigos sirven a las pruebas y a los logs de Vercel, no a la
// interfaz. Medir no puede afectar al visitante bajo ninguna circunstancia.
//
// ── Qué se guarda y qué no ──
//
// La validación es una lista blanca (api/_lib/events.js): sólo se guardan
// campos declarados. La IP jamás llega a la tabla: se usa únicamente para el
// límite de tasa, y aun ahí va como HMAC (con la service key como secreto) para
// que la fila de rate_limits no sea una lista de IPs de visitantes. País y
// región salen de los headers de Vercel.
//
// ── Filtros silenciosos (204, sin pista para quien prueba) ──
//
// Hosts que no son de producción (localhost, previews) y bots. No es un
// control de seguridad —cualquiera puede fingir un Host desde un script— sino
// higiene de datos: que una prueba o un rastreador no infle las visitas.

import { createHmac } from 'node:crypto';
import { readEnv } from './_lib/env.js';
import { json, requireMethod, readJsonBody, clientIp } from './_lib/http.js';
import { buildPostgrestUrl, sbHeaders } from './_lib/supabase.js';
import { logError } from './_lib/log.js';
import {
  validateBatch, cleanGeo, parseAllowedHosts, requestHostname, isBotUserAgent,
} from './_lib/events.js';

// Un visitante activo manda un lote cada pocos segundos como mucho (cola de
// 2 s + envío inmediato en cada clic de CTA). El tope es por IP y las IP se
// comparten: una oficina entera, y sobre todo los operadores móviles con CGNAT,
// que meten a muchos visitantes detrás de la misma. 120 por minuto deja margen
// a eso (y a la Fase 2, que emite más eventos por visita) y sigue frenando a un
// script, que necesita mucho más para inflar algo.
const RATE = { window: 60, max: 120 };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  let supabaseUrl;
  let serviceKey;
  try {
    supabaseUrl = readEnv(process.env, 'SUPABASE_URL', { required: true });
    serviceKey = readEnv(process.env, 'SUPABASE_SERVICE_ROLE_KEY', { required: true });
  } catch (err) {
    logError('track', err);
    return json(res, 503, { error: 'NOT_CONFIGURED' });
  }

  const allowedHosts = parseAllowedHosts(readEnv(process.env, 'TRACK_ALLOWED_HOSTS'));
  if (
    !allowedHosts.includes(requestHostname(req.headers)) ||
    isBotUserAgent(req.headers['user-agent'])
  ) {
    return res.status(204).end();
  }

  let body;
  try {
    body = await readJsonBody(req, { maxBytes: 8192 });
  } catch (err) {
    return json(res, err.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: err.code ?? 'BAD_REQUEST' });
  }

  const lote = validateBatch(body);
  if (!lote.ok) return json(res, 400, { error: lote.error });
  if (lote.rows.length === 0) return json(res, 400, { error: 'NO_VALID_EVENTS' });

  const geo = cleanGeo(req.headers['x-vercel-ip-country'], req.headers['x-vercel-ip-country-region']);
  const rows = lote.rows.map((row) => ({ ...row, ...geo }));

  const headers = sbHeaders({ key: serviceKey, prefer: 'return=minimal' });
  const ipHash = createHmac('sha256', serviceKey).update(clientIp(req)).digest('hex').slice(0, 16);

  try {
    const permitido = await rateLimit(supabaseUrl, headers, `track:${ipHash}`);
    if (!permitido) return json(res, 429, { error: 'RATE_LIMITED' });

    const r = await fetch(buildPostgrestUrl(supabaseUrl, 'site_events'), {
      method: 'POST',
      headers,
      body: JSON.stringify(rows),
    });
    if (!r.ok) throw new Error(`PostgREST ${r.status} insertando en site_events: ${(await r.text()).slice(0, 200)}`);

    return res.status(204).end();
  } catch (err) {
    logError('track', err);
    return json(res, 502, { error: 'TRACK_FAILED' });
  }
}

async function rateLimit(baseUrl, headers, bucket) {
  const r = await fetch(`${baseUrl.replace(/\/+$/, '')}/rest/v1/rpc/rpc_rate_limit_hit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_bucket: bucket, p_window_seconds: RATE.window, p_max_hits: RATE.max }),
  });
  // Si el limitador falla, se deja pasar: perder métricas por una función
  // auxiliar caída es peor que el abuso que previene. Queda el log.
  if (!r.ok) {
    logError('track', new Error(`rate limit ${r.status}`), { bucket });
    return true;
  }
  return r.json();
}
