import { createHmac, timingSafeEqual } from 'node:crypto';
import { json } from './_lib/http.js';
import { buildPostgrestUrl, sbHeaders } from './_lib/supabase.js';
import { logError } from './_lib/log.js';

// Verificación manual conforme al formato Svix: id.timestamp.cuerpo crudo.
export function verifySvix(raw, headers, secret, now = Date.now()) {
  const id = String(headers['svix-id'] || '');
  const ts = String(headers['svix-timestamp'] || '');
  const signatures = String(headers['svix-signature'] || '');
  if (!/^whsec_[A-Za-z0-9+/_=-]+$/.test(secret || '') || !/^\d{10}$/.test(ts) || !id || Math.abs(now - Number(ts) * 1000) > 300_000) return false;
  const key = Buffer.from(secret.slice(6), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest();
  return signatures.split(' ').some((part) => {
    if (!part.startsWith('v1,')) return false;
    const received = Buffer.from(part.slice(3), 'base64');
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (!process.env.RESEND_WEBHOOK_SECRET) return json(res, 503, { error: 'NOT_CONFIGURED' });
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if (Buffer.byteLength(raw) > 65536) return json(res, 413, { error: 'PAYLOAD_TOO_LARGE' });
  }
  if (!verifySvix(raw, req.headers, process.env.RESEND_WEBHOOK_SECRET)) return json(res, 401, { error: 'INVALID_SIGNATURE' });
  let event;
  try { event = JSON.parse(raw); } catch { return json(res, 400, { error: 'INVALID_JSON' }); }
  const type = ({
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.clicked': 'clicked',
    'contact.updated': event.data?.unsubscribed === true ? 'contact_unsubscribed' : null,
  })[event.type];
  if (!type) return json(res, 200, { ok: true });
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return json(res, 503, { error: 'NOT_CONFIGURED' });
  const headers = sbHeaders({ key });
  try {
    const providerId = String(event.data?.email_id || '');
    let mail;
    if (providerId) {
      const r = await fetch(buildPostgrestUrl(base, 'quote_email_log', { select: 'id,intent_id', eq: { provider_id: providerId }, limit: 1 }), { headers });
      if (!r.ok) throw new Error(`webhook mail lookup ${r.status}`);
      [mail] = await r.json();
    }
    const insert = await fetch(`${buildPostgrestUrl(base, 'quote_email_events')}?on_conflict=webhook_id`, {
      method: 'POST', headers: sbHeaders({ key, prefer: 'resolution=ignore-duplicates,return=minimal' }),
      body: JSON.stringify({ webhook_id: String(req.headers['svix-id']), provider_id: providerId || null,
        intent_id: mail?.intent_id || null, event: type,
        event_at: /^\d{4}-/.test(event.created_at || '') ? event.created_at : new Date().toISOString() }),
    });
    if (!insert.ok) throw new Error(`webhook insert ${insert.status}`);
    if (mail && type !== 'contact_unsubscribed') {
      const allowedStates = type === 'delivered' ? ['claimed', 'sent', 'failed']
        : type === 'clicked' ? ['claimed', 'sent', 'failed', 'delivered'] : null;
      const update = await fetch(buildPostgrestUrl(base, 'quote_email_log', {
        eq: { id: mail.id }, ...(allowedStates ? { in: { state: allowedStates } } : {}),
      }), {
        method: 'PATCH', headers: sbHeaders({ key, prefer: 'return=minimal' }),
        body: JSON.stringify({ state: type, updated_at: new Date().toISOString() }),
      });
      if (!update.ok) throw new Error(`webhook update ${update.status}`);
    }
    if (type === 'bounced' || type === 'contact_unsubscribed') {
      const email = type === 'contact_unsubscribed' ? event.data?.email : event.data?.to;
      const recipient = Array.isArray(email) ? email[0] : email;
      if (typeof recipient === 'string' && recipient.includes('@')) {
        const r = await fetch(buildPostgrestUrl(base, 'quote_intents', { eq: { email: recipient.toLowerCase() } }), {
          method: 'PATCH', headers: sbHeaders({ key, prefer: 'return=minimal' }),
          body: JSON.stringify({ unsubscribed_at: new Date().toISOString(), marketing_consent: false }),
        });
        if (!r.ok) throw new Error(`webhook suppress ${r.status}`);
      }
    }
    return json(res, 200, { ok: true });
  } catch (error) {
    logError('resend-webhook', error);
    return json(res, 502, { error: 'WEBHOOK_FAILED' });
  }
}
