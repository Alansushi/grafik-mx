// Captura privada. Se activa sólo tras publicar el aviso de privacidad.
import { createHmac } from 'node:crypto';
import { readEnv } from './_lib/env.js';
import { json, readJsonBody, clientIp } from './_lib/http.js';
import { buildPostgrestUrl, sbHeaders } from './_lib/supabase.js';
import { isUuid, isEmail } from './_lib/validation.js';
import { logError } from './_lib/log.js';
import { sendQuoteEmail } from './_lib/quote-mail.js';
import { captureEnabled } from './_lib/capture-config.js';

export { captureEnabled };

export default async function handler(req, res) {
  if (req.method === 'GET') return json(res, 200, captureEnabled() ? {
    enabled: true,
    privacy: { controller: process.env.PRIVACY_CONTROLLER, address: process.env.PRIVACY_ADDRESS,
      email: process.env.PRIVACY_EMAIL },
  } : { enabled: false });
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (!captureEnabled()) return json(res, 503, { error: 'CAPTURE_DISABLED' });
  let body;
  try { body = await readJsonBody(req, { maxBytes: 4096 }); }
  catch { return json(res, 400, { error: 'INVALID_BODY' }); }
  const { key, action, channel } = body || {};
  if (!isUuid(key) || !['start', 'complete', 'cancel'].includes(action)) return json(res, 400, { error: 'INVALID_ACTION' });
  if (action !== 'cancel' && !['contacto', 'estudio'].includes(channel)) return json(res, 400, { error: 'INVALID_CHANNEL' });
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  if (action !== 'cancel' && (!isEmail(email) || email.length > 254 || (name && (name.length < 2 || name.length > 120)))) {
    return json(res, 400, { error: 'INVALID_CONTACT' });
  }
  if (channel === 'estudio' && action !== 'cancel' && name.length < 2) return json(res, 400, { error: 'INVALID_NAME' });
  const service = String(body.service || '').trim().slice(0, 80) || null;
  const details = String(body.details || '').trim().slice(0, 2000) || null;
  const phone = String(body.phone || '').trim().slice(0, 30) || null;
  const consent = body.marketingConsent === true;
  const device = ['mobile', 'tablet', 'desktop'].includes(body.device) ? body.device : null;
  const utm = /^[\p{L}\p{N} _.\-]{1,100}$/u.test(body.utmSource || '') ? body.utmSource : null;
  const referrer = /^[a-z0-9.-]{1,100}$/.test(body.referrerHost || '') ? body.referrerHost : null;

  let base, secret;
  try {
    base = readEnv(process.env, 'SUPABASE_URL', { required: true });
    secret = readEnv(process.env, 'SUPABASE_SERVICE_ROLE_KEY', { required: true });
  } catch { return json(res, 503, { error: 'NOT_CONFIGURED' }); }
  const headers = sbHeaders({ key: secret, prefer: 'return=representation' });
  try {
    const ipHash = createHmac('sha256', secret).update(clientIp(req)).digest('hex').slice(0, 16);
    const rate = await fetch(`${base.replace(/\/+$/, '')}/rest/v1/rpc/rpc_rate_limit_hit`, {
      method: 'POST', headers,
      body: JSON.stringify({ p_bucket: `intent:${ipHash}`, p_window_seconds: 3600, p_max_hits: 60 }),
    });
    if (!rate.ok || !(await rate.json())) return json(res, 429, { error: 'RATE_LIMITED' });

    const url = buildPostgrestUrl(base, 'quote_intents', { select: 'id,status,channel,email,name,unsubscribed_at,unsubscribe_token,return_token', eq: { client_key: key }, limit: 1 });
    const existingRes = await fetch(url, { headers });
    if (!existingRes.ok) throw new Error('intent lookup failed');
    const existing = (await existingRes.json())[0];
    if (action === 'cancel') {
      if (existing?.status === 'started') await fetch(buildPostgrestUrl(base, 'quote_intents', { eq: { client_key: key, status: 'started' } }), {
        method: 'PATCH', headers, body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() }),
      });
      return json(res, 200, { saved: Boolean(existing) });
    }
    if (existing && (existing.channel !== channel || existing.email !== email)) return json(res, 409, { error: 'KEY_CONFLICT' });
    if (existing?.status === 'completed') {
      if (action === 'complete') await sendQuoteEmail(base, secret, existing, 'confirmation').catch((err) => logError('quote-confirmation', err));
      return json(res, 200, { saved: true, completed: true });
    }
    if (existing?.status === 'cancelled') return json(res, 409, { error: 'CANCELLED' });
    const now = new Date().toISOString();
    const suppression = await fetch(`${buildPostgrestUrl(base, 'quote_intents', { select: 'id', eq: { email }, limit: 1 })}&unsubscribed_at=not.is.null`, { headers });
    if (!suppression.ok) throw new Error(`suppression lookup ${suppression.status}`);
    const suppressed = (await suppression.json()).length > 0 || Boolean(existing?.unsubscribed_at);
    const data = {
      name: name || null, email, phone, service, details,
      marketing_consent: consent && !suppressed, consent_at: consent && !suppressed ? now : null,
      ...(suppressed ? { unsubscribed_at: existing?.unsubscribed_at || now } : {}),
      updated_at: now,
      ...(action === 'complete' ? { status: 'completed', completed_at: now } : {}),
    };
    let response = existing
      ? await fetch(buildPostgrestUrl(base, 'quote_intents', { eq: { client_key: key, status: 'started' } }), { method: 'PATCH', headers, body: JSON.stringify(data) })
      : await fetch(buildPostgrestUrl(base, 'quote_intents'), { method: 'POST', headers, body: JSON.stringify({
        ...data, client_key: key, channel, device, utm_source: utm, referrer_host: referrer,
      }) });
    // El autoguardado y Enviar pueden llegar a la vez. Si ambos intentaron
    // INSERT, la clave única deja pasar uno; el otro relee y aplica la
    // transición sólo si sigue en started. Nunca rebaja completed a started.
    if (!existing && response.status === 409) {
      const raced = await fetch(url, { headers });
      if (!raced.ok) throw new Error(`intent race lookup ${raced.status}`);
      const [current] = await raced.json();
      if (!current || current.channel !== channel || current.email !== email) return json(res, 409, { error: 'KEY_CONFLICT' });
      if (current.status === 'completed') {
        if (action === 'complete') await sendQuoteEmail(base, secret, current, 'confirmation').catch((err) => logError('quote-confirmation', err));
        return json(res, 200, { saved: true, completed: true });
      }
      if (current.status !== 'started') return json(res, 409, { error: 'CANCELLED' });
      response = await fetch(buildPostgrestUrl(base, 'quote_intents', { eq: { client_key: key, status: 'started' } }), {
        method: 'PATCH', headers, body: JSON.stringify(data),
      });
    }
    if (!response.ok) throw new Error(`intent write ${response.status}`);
    if (action === 'complete') {
      let [intent] = await response.json();
      if (!intent) {
        const current = await fetch(url, { headers });
        if (current.ok) [intent] = await current.json();
      }
      if (intent) await sendQuoteEmail(base, secret, intent, 'confirmation').catch((err) => logError('quote-confirmation', err));
    }
    return json(res, 200, { saved: true, completed: action === 'complete' });
  } catch (err) {
    logError('quote-intent', err);
    return json(res, 502, { error: 'SAVE_FAILED' });
  }
}
