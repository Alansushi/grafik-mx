// Correo transaccional del embudo. No se envía si falta la configuración.
import { buildPostgrestUrl, sbHeaders } from './supabase.js';
import { logError } from './log.js';
import { captureEnabled } from './capture-config.js';

export async function sendQuoteEmail(base, serviceKey, intent, kind) {
  if (!captureEnabled() || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return false;
  if (!intent || intent.unsubscribed_at || !['confirmation', 'reminder'].includes(kind)) return false;
  if (kind === 'reminder' && intent.status !== 'started') return false;
  if (kind === 'confirmation' && intent.status !== 'completed') return false;

  const headers = sbHeaders({ key: serviceKey, prefer: 'resolution=ignore-duplicates,return=representation' });
  const claim = await fetch(`${buildPostgrestUrl(base, 'quote_email_log')}?on_conflict=intent_id,kind`, {
    method: 'POST', headers,
    body: JSON.stringify({ intent_id: intent.id, kind, state: 'claimed' }),
  });
  if (!claim.ok) throw new Error(`email claim ${claim.status}`);
  let [claimed] = await claim.json();
  if (!claimed) {
    const previous = await fetch(buildPostgrestUrl(base, 'quote_email_log', {
      select: 'id,state,created_at,updated_at', eq: { intent_id: intent.id, kind }, limit: 1,
    }), { headers: sbHeaders({ key: serviceKey }) });
    if (!previous.ok) throw new Error(`email lookup ${previous.status}`);
    const [old] = await previous.json();
    // Resend conserva la idempotencia 24 h. Después no reintentamos un resultado
    // ambiguo, para no enviar un segundo correo si el primero sí salió.
    const staleClaim = old?.state === 'claimed' && Date.now() - Date.parse(old.updated_at) > 10 * 60_000;
    if ((!staleClaim && old?.state !== 'failed') || Date.now() - Date.parse(old.created_at) >= 23 * 3600_000) return false;
    const retry = await fetch(buildPostgrestUrl(base, 'quote_email_log', { eq: { id: old.id, state: old.state, updated_at: old.updated_at } }), {
      method: 'PATCH', headers: sbHeaders({ key: serviceKey, prefer: 'return=representation' }),
      body: JSON.stringify({ state: 'claimed', updated_at: new Date().toISOString() }),
    });
    if (!retry.ok) throw new Error(`email retry ${retry.status}`);
    [claimed] = await retry.json();
    if (!claimed) return false;
  }

  const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://www.grafik.mx').replace(/\/+$/, '');
  const link = intent.channel === 'estudio' ? `${baseUrl}/estudio/` : `${baseUrl}/`;
  const trackedLink = kind === 'reminder' && intent.return_token
    ? `${link}?r=${intent.return_token}${intent.channel === 'contacto' ? '#contacto' : ''}`
    : link;
  const subject = kind === 'confirmation' ? 'Recibimos tu solicitud de cotización | GRAFIK' : '¿Quieres terminar tu cotización? | GRAFIK';
  const body = kind === 'confirmation'
    ? 'Hola. Guardamos los datos de la solicitud que preparaste. Si la iniciaste por WhatsApp, recuerda enviar el mensaje desde esa aplicación para que Orkestalo lo reciba. Orkestalo atiende las solicitudes de cotización de GRAFIK.'
    : 'Hola. Tu cotización sigue pendiente. Puedes continuar desde el siguiente enlace. Si usaste el Estudio, el enlace abre la herramienta de nuevo, pero no restaura el diseño anterior.';
  const payload = {
    from: process.env.EMAIL_FROM,
    to: [intent.email], subject,
    html: `<p>${body}</p><p><a href="${trackedLink}">${kind === 'confirmation' ? 'Visitar GRAFIK' : 'Volver a mi cotización'}</a></p><p>GRAFIK · CDMX</p>`,
  };
  if (intent.unsubscribe_token) payload.html += `<p><a href="${baseUrl}/api/unsubscribe?t=${intent.unsubscribe_token}">No recibir más correos de seguimiento ni promociones</a></p>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `grafik-quote-${intent.id}-${kind}-v1`,
      }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Resend ${response.status}`);
    const result = await response.json();
    const done = await fetch(buildPostgrestUrl(base, 'quote_email_log', { eq: { id: claimed.id } }), {
      method: 'PATCH', headers: sbHeaders({ key: serviceKey, prefer: 'return=minimal' }),
      body: JSON.stringify({ state: 'sent', provider_id: result.id, updated_at: new Date().toISOString() }),
    });
    if (!done.ok) throw new Error(`email log ${done.status}`);
    return true;
  } catch (error) {
    logError('quote-mail', error, { kind });
    await fetch(buildPostgrestUrl(base, 'quote_email_log', { eq: { id: claimed.id, state: 'claimed' } }), {
      method: 'PATCH', headers: sbHeaders({ key: serviceKey, prefer: 'return=minimal' }),
      body: JSON.stringify({ state: 'failed', updated_at: new Date().toISOString() }),
    }).catch(() => {});
    return false;
  }
}
