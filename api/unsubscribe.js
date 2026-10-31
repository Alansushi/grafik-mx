import { json } from './_lib/http.js';
import { buildPostgrestUrl, sbHeaders } from './_lib/supabase.js';
import { isUuid } from './_lib/validation.js';
import { logError } from './_lib/log.js';

function page(res, token, message) {
  const form = token ? `<form method="post" class="unsubscribe-form"><input type="hidden" name="token" value="${token}"><button class="btn btn-green unsubscribe-submit" type="submit">Confirmar baja</button></form>` : '';
  res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').setHeader('Cache-Control', 'no-store').send(
    `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#0C0C0C">
  <title>Baja de correos | GRAFIK</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/styles.css">
  <style>
    .unsubscribe-page { min-height: 100dvh; background: var(--negro); color: var(--blanco); }
    .unsubscribe-shell { width: min(100% - 40px, 720px); margin: 0 auto; padding: clamp(32px, 7vw, 72px) 0 64px; }
    .unsubscribe-brand { display: inline-flex; align-items: center; gap: 12px; color: var(--blanco); font: 900 26px/1 'Barlow Condensed', sans-serif; letter-spacing: .14em; }
    .unsubscribe-brand svg { width: 38px; height: 38px; }
    .unsubscribe-card { margin-top: 52px; padding: clamp(28px, 6vw, 48px); background: var(--carbon); border: 1px solid var(--carbon-hi); border-top: 4px solid var(--rojo); }
    .unsubscribe-card h1 { margin: 0 0 20px; font: 900 clamp(38px, 7vw, 60px)/.98 'Barlow Condensed', sans-serif; text-transform: uppercase; }
    .unsubscribe-card p { max-width: 54ch; color: var(--plata-claro); font-size: 17px; line-height: 1.65; }
    .unsubscribe-form { margin-top: 28px; }
    .unsubscribe-submit { min-height: 48px; justify-content: center; }
    .unsubscribe-back { display: inline-block; margin-top: 32px; color: var(--plata); font-size: 14px; text-decoration: underline; text-underline-offset: 4px; }
    .unsubscribe-back:hover { color: var(--blanco); }
    .unsubscribe-page a:focus-visible, .unsubscribe-page button:focus-visible { outline: 2px solid var(--rojo-txt); outline-offset: 4px; }
    @media (max-width: 640px) { .unsubscribe-shell { width: min(100% - 32px, 720px); } .unsubscribe-card { margin-top: 36px; } .unsubscribe-submit { width: 100%; } }
  </style>
</head>
<body class="unsubscribe-page">
  <main class="unsubscribe-shell">
    <a class="unsubscribe-brand" href="/" aria-label="GRAFIK, ir al inicio"><svg aria-hidden="true" viewBox="0 0 68 68"><use href="/defs.svg#mark"></use></svg>GRAFIK</a>
    <section class="unsubscribe-card" aria-labelledby="unsubscribe-title">
      <h1 id="unsubscribe-title">Baja de correos</h1>
      <p>${message}</p>
      ${form}
      <a class="unsubscribe-back" href="/">Volver al sitio</a>
    </section>
  </main>
</body>
</html>`
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
