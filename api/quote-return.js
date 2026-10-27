import { json, readJsonBody } from './_lib/http.js';
import { buildPostgrestUrl, sbHeaders } from './_lib/supabase.js';
import { isUuid } from './_lib/validation.js';
import { logError } from './_lib/log.js';
import { captureEnabled } from './_lib/capture-config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (!captureEnabled()) return json(res, 503, { error: 'CAPTURE_DISABLED' });
  let body;
  try { body = await readJsonBody(req, { maxBytes: 200 }); } catch { return json(res, 400, { error: 'INVALID_BODY' }); }
  if (!isUuid(body?.token)) return json(res, 400, { error: 'INVALID_TOKEN' });
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return json(res, 503, { error: 'NOT_CONFIGURED' });
  try {
    const url = `${buildPostgrestUrl(base, 'quote_intents', { eq: { return_token: body.token, status: 'started' } })}&reminder_sent_at=not.is.null&returned_at=is.null`;
    const r = await fetch(url, {
      method: 'PATCH', headers: sbHeaders({ key, prefer: 'return=minimal' }),
      body: JSON.stringify({ returned_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(`quote return ${r.status}`);
    return json(res, 200, { ok: true });
  } catch (error) {
    logError('quote-return', error);
    return json(res, 502, { error: 'RETURN_FAILED' });
  }
}
