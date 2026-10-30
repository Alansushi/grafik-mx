// Invocación privada desde Supabase Cron (cada 15 minutos).
import { timingSafeEqual } from 'node:crypto';
import { json } from './_lib/http.js';
import { buildPostgrestUrl, sbHeaders } from './_lib/supabase.js';
import { sendQuoteEmail } from './_lib/quote-mail.js';
import { logError } from './_lib/log.js';
import { captureEnabled } from './_lib/capture-config.js';

function authorized(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(String(received));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (!authorized(req.headers['x-grafik-cron'], process.env.QUOTE_CRON_SECRET)) return json(res, 401, { error: 'UNAUTHORIZED' });
  if (!captureEnabled() || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return json(res, 503, { error: 'NOT_CONFIGURED' });
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return json(res, 503, { error: 'NOT_CONFIGURED' });
  const headers = sbHeaders({ key, prefer: 'return=representation' });
  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/rest/v1/rpc/claim_quote_reminders`, {
      method: 'POST', headers, body: JSON.stringify({ p_limit: 50 }),
    });
    if (!response.ok) throw new Error(`claim reminders ${response.status}`);
    const claimed = await response.json();
    let sent = 0;
    for (const row of claimed) {
      // El estado puede haber cambiado entre el reclamo en SQL y esta lectura.
      const freshRes = await fetch(buildPostgrestUrl(base, 'quote_intents', {
        select: 'id,email,name,channel,status,unsubscribed_at,unsubscribe_token,return_token', eq: { id: row.id }, limit: 1,
      }), { headers });
      if (!freshRes.ok) throw new Error(`read intent ${freshRes.status}`);
      const [fresh] = await freshRes.json();
      if (fresh?.status !== 'started' || fresh.unsubscribed_at) continue;
      const ok = await sendQuoteEmail(base, key, fresh, 'reminder');
      if (ok) {
        sent += 1;
        await fetch(buildPostgrestUrl(base, 'quote_intents', { eq: { id: row.id, status: 'started' } }), {
          method: 'PATCH', headers: sbHeaders({ key, prefer: 'return=minimal' }),
          body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
        });
      } else {
        // Solamente se reintenta dentro de la ventana de idempotencia de Resend.
        const log = await fetch(buildPostgrestUrl(base, 'quote_email_log', {
          select: 'state,created_at', eq: { intent_id: row.id, kind: 'reminder' }, limit: 1,
        }), { headers });
        const [previous] = log.ok ? await log.json() : [];
        if (previous?.state === 'sent' || previous?.state === 'delivered' || previous?.state === 'clicked') {
          await fetch(buildPostgrestUrl(base, 'quote_intents', { eq: { id: row.id } }), {
            method: 'PATCH', headers: sbHeaders({ key, prefer: 'return=minimal' }),
            body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
          });
        } else if (previous?.state === 'failed' && Date.now() - Date.parse(previous.created_at) < 23 * 3600_000) {
          await fetch(buildPostgrestUrl(base, 'quote_intents', { eq: { id: row.id, status: 'started' } }), {
            method: 'PATCH', headers: sbHeaders({ key, prefer: 'return=minimal' }),
            body: JSON.stringify({ reminder_claimed_at: null }),
          });
        }
      }
    }
    return json(res, 200, { claimed: claimed.length, sent });
  } catch (error) {
    logError('send-reminders', error);
    return json(res, 502, { error: 'REMINDERS_FAILED' });
  }
}
