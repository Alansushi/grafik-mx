import { json } from './_lib/http.js';
import { buildPostgrestUrl, sbHeaders } from './_lib/supabase.js';
import { isUuid } from './_lib/validation.js';
import { logError } from './_lib/log.js';

function page(res, token, message) {
  const form = token ? `<form method="post"><input type="hidden" name="token" value="${token}"><button type="submit">Confirmar baja</button></form>` : '';
  res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').setHeader('Cache-Control', 'no-store').send(
    `<!doctype html><html lang="es"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Baja de correos | GRAFIK</title><body style="font:18px Barlow,Arial,sans-serif;max-width:35rem;margin:5rem auto;padding:1rem"><h1>GRAFIK</h1><p>${message}</p>${form}<p><a href="/">Volver al sitio</a></p></body></html>`
  );
}

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method === 'GET') {
    const token = String(req.query?.t || '');
    return page(res, isUuid(token) ? token : null, isUuid(token) ? 'Confirma que ya no quieres recibir correos de seguimiento ni promociones.' : 'El enlace no es válido.');
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if (raw.length > 1000) return json(res, 413, { error: 'PAYLOAD_TOO_LARGE' });
  }
  const token = new URLSearchParams(raw).get('token');
  if (!isUuid(token)) return page(res, null, 'El enlace no es válido.');
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return json(res, 503, { error: 'NOT_CONFIGURED' });
  const headers = sbHeaders({ key, prefer: 'return=minimal' });
  try {
    const r = await fetch(buildPostgrestUrl(base, 'quote_intents', { select: 'email', eq: { unsubscribe_token: token }, limit: 1 }), { headers });
    if (!r.ok) throw new Error(`unsubscribe lookup ${r.status}`);
    const [intent] = await r.json();
    if (intent) {
      const updated = await fetch(buildPostgrestUrl(base, 'quote_intents', { eq: { email: intent.email } }), {
        method: 'PATCH', headers,
        body: JSON.stringify({ unsubscribed_at: new Date().toISOString(), marketing_consent: false }),
      });
      if (!updated.ok) throw new Error(`unsubscribe update ${updated.status}`);
    }
    return page(res, null, 'Tu baja quedó registrada.');
  } catch (error) {
    logError('unsubscribe', error);
    return json(res, 502, { error: 'UNSUBSCRIBE_FAILED' });
  }
}
