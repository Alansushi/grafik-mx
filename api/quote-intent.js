// Captura privada. Se activa sólo tras publicar el aviso de privacidad.
import { createHmac, randomBytes } from 'node:crypto';
import { readEnv } from './_lib/env.js';
import { json, readJsonBody, clientIp } from './_lib/http.js';
import { buildPostgrestUrl, sbHeaders } from './_lib/supabase.js';
import { isUuid, isEmail } from './_lib/validation.js';
import { logError } from './_lib/log.js';
import { sendQuoteEmail } from './_lib/quote-mail.js';
import { captureEnabled } from './_lib/capture-config.js';
import { validateCatalogIntent } from './_lib/catalog-intent.js';

export { captureEnabled };

const legacyFolioFor = (key) => 'GQ-' + String(key).replace(/-/g, '').slice(0, 16).toUpperCase();
const newCatalogFolio = () => `GQ-${randomBytes(5).toString('hex').toUpperCase()}`;
async function sendCompletionMail(base, secret, intent) {
  if (!intent) return;
  if (intent.channel === 'catalogos') {
    await sendQuoteEmail(base, secret, intent, 'team_alert').catch((err) => logError('quote-team-alert', err));
  }
  if (intent.email) await sendQuoteEmail(base, secret, intent, 'confirmation').catch((err) => logError('quote-confirmation', err));
}

export default async function handler(req, res) {
  if (req.method === 'GET') return json(res, 200, captureEnabled() ? {
    enabled: true,
    privacy: { controller: process.env.PRIVACY_CONTROLLER, address: process.env.PRIVACY_ADDRESS,
      email: process.env.PRIVACY_EMAIL },
  } : { enabled: false });
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (!captureEnabled()) return json(res, 503, { error: 'CAPTURE_DISABLED' });
  let body;
  try { body = await readJsonBody(req, { maxBytes: 8192 }); }
  catch { return json(res, 400, { error: 'INVALID_BODY' }); }
  const { key, action, channel } = body || {};
  if (!isUuid(key) || !['start', 'complete', 'cancel'].includes(action)) return json(res, 400, { error: 'INVALID_ACTION' });
  if (action !== 'cancel' && !['contacto', 'estudio', 'catalogos'].includes(channel)) return json(res, 400, { error: 'INVALID_CHANNEL' });
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  let catalogData;
  if (channel === 'catalogos' && action !== 'cancel') {
    const validated = validateCatalogIntent(body, { partial: action === 'start' });
    if (!validated.ok) return json(res, 400, { error: validated.error });
    catalogData = validated.data;
  }
  if (action !== 'cancel' && channel !== 'catalogos' && (!isEmail(email) || email.length > 254 || (name && (name.length < 2 || name.length > 120)))) {
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
  const utmMedium = /^[\p{L}\p{N} _.\-]{1,100}$/u.test(body.utmMedium || '') ? body.utmMedium : null;
  const utmCampaign = /^[\p{L}\p{N} _.\-]{1,100}$/u.test(body.utmCampaign || '') ? body.utmCampaign : null;

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

    const url = buildPostgrestUrl(base, 'quote_intents', { select: 'id,client_key,folio,status,channel,email,name,phone,items,intended_use,personalization,required_date,buyer_type,return_catalog,return_page,unsubscribed_at,unsubscribe_token,return_token,utm_source,utm_medium,utm_campaign,referrer_host', eq: { client_key: key }, limit: 1 });
    const existingRes = await fetch(url, { headers });
    if (!existingRes.ok) throw new Error('intent lookup failed');
    const existing = (await existingRes.json())[0];
    if (action === 'cancel') {
      if (existing?.status === 'started') await fetch(buildPostgrestUrl(base, 'quote_intents', { eq: { client_key: key, status: 'started' } }), {
        method: 'PATCH', headers, body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() }),
      });
      return json(res, 200, { saved: Boolean(existing) });
    }
    if (existing && (existing.channel !== channel || (existing.email || null) !== (email || null))) return json(res, 409, { error: 'KEY_CONFLICT' });
    if (existing?.status === 'completed') {
      if (action === 'complete') await sendCompletionMail(base, secret, existing);
      return json(res, 200, { saved: true, completed: true, ...(channel === 'catalogos' ? { folio: existing.folio } : {}) });
    }
    if (existing?.status === 'cancelled') return json(res, 409, { error: 'CANCELLED' });
    const now = new Date().toISOString();
    let suppressed = Boolean(existing?.unsubscribed_at);
    if (email) {
      const suppression = await fetch(`${buildPostgrestUrl(base, 'quote_intents', { select: 'id', eq: { email }, limit: 1 })}&unsubscribed_at=not.is.null`, { headers });
      if (!suppression.ok) throw new Error(`suppression lookup ${suppression.status}`);
      suppressed = (await suppression.json()).length > 0 || suppressed;
    }
    const data = {
      name: name || null, email: email || null, phone, service, details,
      ...(catalogData ? {
        items: catalogData.items, intended_use: catalogData.intended_use,
        personalization: catalogData.personalization, required_date: catalogData.required_date,
        return_catalog: catalogData.return_catalog, return_page: catalogData.return_page,
        buyer_type: catalogData.buyer_type,
        analytics_sid: /^[a-z0-9]{8,32}$/.test(body.analyticsSid || '') ? body.analyticsSid : null,
      } : {}),
      marketing_consent: consent && Boolean(email) && !suppressed,
      consent_at: consent && email && !suppressed ? now : null,
      ...(suppressed ? { unsubscribed_at: existing?.unsubscribed_at || now } : {}),
      updated_at: now,
      ...(!existing?.utm_source && !existing?.referrer_host ? {
        utm_source: utm, utm_medium: utmMedium, utm_campaign: utmCampaign, referrer_host: referrer,
      } : {}),
      ...(action === 'complete' ? { status: 'completed', completed_at: now } : {}),
    };
    let folio = existing?.folio || (channel === 'catalogos' ? newCatalogFolio() : legacyFolioFor(key));
    const insert = () => fetch(buildPostgrestUrl(base, 'quote_intents'), { method: 'POST', headers, body: JSON.stringify({
      ...data, client_key: key, folio, channel, device, utm_source: utm, utm_medium: utmMedium,
      utm_campaign: utmCampaign, referrer_host: referrer,
    }) });
    let response = existing
      ? await fetch(buildPostgrestUrl(base, 'quote_intents', { eq: { client_key: key, status: 'started' } }), { method: 'PATCH', headers, body: JSON.stringify(data) })
      : await insert();
    // El autoguardado y Enviar pueden llegar a la vez. Si ambos intentaron
    // INSERT, la clave única deja pasar uno; el otro relee y aplica la
    // transición sólo si sigue en started. Nunca rebaja completed a started.
    if (!existing && response.status === 409) {
      const raced = await fetch(url, { headers });
      if (!raced.ok) throw new Error(`intent race lookup ${raced.status}`);
      const [current] = await raced.json();
      if (!current && channel === 'catalogos') {
        // A unique folio may already exist; keep the client key and retry with a fresh folio.
        for (let attempt = 0; attempt < 4 && response.status === 409; attempt++) {
          folio = newCatalogFolio();
          response = await insert();
        }
      } else if (!current || current.channel !== channel || (current.email || null) !== (email || null)) return json(res, 409, { error: 'KEY_CONFLICT' });
      if (current?.status === 'completed') {
        if (action === 'complete') await sendCompletionMail(base, secret, current);
        return json(res, 200, { saved: true, completed: true, ...(channel === 'catalogos' ? { folio: current.folio } : {}) });
      }
      if (current) {
        if (current.status !== 'started') return json(res, 409, { error: 'CANCELLED' });
        folio = current.folio;
        response = await fetch(buildPostgrestUrl(base, 'quote_intents', { eq: { client_key: key, status: 'started' } }), {
          method: 'PATCH', headers, body: JSON.stringify(data),
        });
      }
    }
    if (!response.ok) throw new Error(`intent write ${response.status}`);
    if (action === 'complete') {
      let [intent] = await response.json();
      if (!intent) {
        const current = await fetch(url, { headers });
        if (current.ok) [intent] = await current.json();
      }
      if (intent) await sendCompletionMail(base, secret, intent);
    }
    return json(res, 200, { saved: true, completed: action === 'complete', ...(channel === 'catalogos' && action === 'complete' ? { folio } : {}) });
  } catch (err) {
    logError('quote-intent', err);
    return json(res, 502, { error: 'SAVE_FAILED' });
  }
}
