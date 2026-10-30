// HTML compartido por el envío y las vistas locales. Mantener aquí todo el texto visible.
const COLORS = {
  black: '#0C0C0C', carbon: '#181818', red: '#D02B34',
  paper: '#F0F0EE', silver: '#B8B8B8', ink: '#222222',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function renderQuoteMail({ kind, intent, baseUrl = 'https://www.grafik.mx' }) {
  if (!['confirmation', 'reminder'].includes(kind)) throw new Error('Invalid quote email kind');
  const site = String(baseUrl).replace(/\/+$/, '');
  const studio = intent.channel === 'estudio';
  const name = String(intent.name || '').trim();
  const greeting = name ? `Hola, ${escapeHtml(name)}.` : 'Hola.';
  const destination = `${site}${studio ? '/estudio/' : '/'}`;
  const returnUrl = kind === 'reminder' && intent.return_token
    ? `${destination}?r=${encodeURIComponent(intent.return_token)}${studio ? '' : '#contacto'}`
    : destination;
  const unsubscribeUrl = intent.unsubscribe_token
    ? `${site}/api/unsubscribe?t=${encodeURIComponent(intent.unsubscribe_token)}` : null;

  const copy = kind === 'confirmation' ? {
    subject: 'Guardamos tu solicitud de cotización | GRAFIK',
    preheader: 'Gracias por preparar tu solicitud. Si abriste WhatsApp, recuerda enviar el mensaje desde ahí.',
    eyebrow: 'SOLICITUD GUARDADA',
    title: 'Gracias por elegir GRAFIK.',
    intro: 'Guardamos los datos de la solicitud que preparaste.',
    detail: 'Si abriste WhatsApp para cotizar, todavía necesitas revisar y enviar el mensaje desde WhatsApp para que Orkestalo lo reciba. Orkestalo atiende las solicitudes de cotización de GRAFIK.',
    button: studio ? 'Volver al Estudio' : 'Visitar GRAFIK',
    note: '¿Tienes otra idea en mente? Conoce más formas de imprimir y personalizar con GRAFIK.',
  } : studio ? {
    subject: 'Tu cotización en el Estudio sigue pendiente | GRAFIK',
    preheader: 'Vuelve al Estudio para preparar tu cotización. El enlace no recupera tu diseño anterior.',
    eyebrow: 'TU IDEA SIGUE AQUÍ',
    title: 'Tu proyecto merece continuar.',
    intro: 'Puedes volver al Estudio y preparar tu cotización cuando quieras.',
    detail: 'El enlace abre la herramienta de nuevo, pero no recupera tu diseño anterior. Tendrás que volver a subir tu logo y configurar el producto.',
    button: 'Volver al Estudio',
    note: 'Si prefieres, también puedes escribirnos por WhatsApp y contarnos qué necesitas.',
  } : {
    subject: '¿Quieres terminar tu cotización? | GRAFIK',
    preheader: 'Tu solicitud quedó pendiente. Retómala desde el formulario de contacto.',
    eyebrow: 'TU COTIZACIÓN TE ESPERA',
    title: 'Sigamos con tu proyecto.',
    intro: 'Tu solicitud de cotización quedó pendiente. Puedes retomarla desde el formulario de contacto.',
    detail: 'Cuéntanos qué necesitas y, al terminar, revisa y envía el mensaje desde WhatsApp para que Orkestalo lo reciba.',
    button: 'Retomar mi cotización',
    note: 'Estamos para ayudarte con impresión y publicidad en CDMX.',
  };

  const bodyFont = "'Barlow',Arial,Helvetica,sans-serif";
  const displayFont = "'Barlow Condensed','Arial Narrow',Arial,sans-serif";
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(copy.subject)}</title>
  <style type="text/css">@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Barlow:wght@400;500;600&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:${COLORS.carbon};font-family:${bodyFont};-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;color:${COLORS.carbon};max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(copy.preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:${COLORS.carbon};">
    <tr><td align="center" style="padding:28px 12px 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;border-collapse:collapse;">
        <tr><td style="background:${COLORS.black};padding:24px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
            <td width="48" style="width:48px;vertical-align:middle;"><img src="${escapeHtml(site)}/assets/grafik-favicon-512.png" alt="" width="48" height="48" style="display:block;width:48px;height:48px;border:0;"></td>
            <td style="padding-left:13px;vertical-align:middle;color:${COLORS.paper};font-family:${displayFont};font-size:27px;font-weight:900;letter-spacing:0.18em;line-height:1;">GRAFIK</td>
          </tr></table>
        </td></tr>
        <tr><td style="background:${COLORS.paper};padding:40px 40px 42px;color:${COLORS.ink};font-family:${bodyFont};">
          <p style="margin:0 0 13px;color:${COLORS.red};font-family:${bodyFont};font-size:11px;font-weight:600;letter-spacing:0.16em;line-height:1.4;">${escapeHtml(copy.eyebrow)}</p>
          <h1 style="margin:0 0 22px;color:${COLORS.black};font-family:${displayFont};font-size:38px;font-weight:900;line-height:1.05;text-transform:uppercase;">${escapeHtml(copy.title)}</h1>
          <p style="margin:0 0 14px;color:${COLORS.ink};font-family:${bodyFont};font-size:16px;line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 14px;color:${COLORS.ink};font-family:${bodyFont};font-size:16px;line-height:1.6;">${escapeHtml(copy.intro)}</p>
          <p style="margin:0 0 28px;color:${COLORS.ink};font-family:${bodyFont};font-size:16px;line-height:1.6;">${escapeHtml(copy.detail)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td bgcolor="${COLORS.red}" style="background:${COLORS.red};">
            <a href="${escapeHtml(returnUrl)}" style="display:inline-block;padding:15px 24px;color:#FFFFFF;font-family:${bodyFont};font-size:14px;font-weight:600;line-height:1.2;text-decoration:none;">${escapeHtml(copy.button)} &nbsp;→</a>
          </td></tr></table>
          <p style="margin:26px 0 0;padding-top:21px;border-top:1px solid #D7D7D4;color:#555555;font-family:${bodyFont};font-size:13px;line-height:1.55;">${escapeHtml(copy.note)}</p>
        </td></tr>
        <tr><td style="height:3px;line-height:3px;font-size:0;background:${COLORS.red};">&nbsp;</td></tr>
        <tr><td style="background:${COLORS.black};padding:25px 32px 22px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;"><tr>
            <td style="width:45%;vertical-align:top;color:${COLORS.paper};font-family:${displayFont};font-size:23px;font-weight:900;letter-spacing:0.18em;line-height:1.2;">GRAFIK<br><span style="color:${COLORS.silver};font-family:${bodyFont};font-size:11px;font-weight:400;letter-spacing:0.04em;">Imprenta y publicidad · CDMX</span></td>
            <td align="right" style="vertical-align:top;color:${COLORS.silver};font-family:${bodyFont};font-size:12px;line-height:1.7;"><a href="https://wa.me/525539014600" style="color:${COLORS.paper};text-decoration:none;">WhatsApp · 55 3901 4600</a><br><a href="${escapeHtml(site)}/" style="color:${COLORS.silver};text-decoration:none;">grafik.mx</a></td>
          </tr></table>
          ${unsubscribeUrl ? `<p style="margin:24px 0 0;padding-top:15px;border-top:1px solid #2E2E2E;color:${COLORS.silver};font-family:${bodyFont};font-size:11px;line-height:1.5;"><a href="${escapeHtml(unsubscribeUrl)}" style="color:${COLORS.silver};text-decoration:underline;">No recibir más correos de seguimiento ni promociones</a></p>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject: copy.subject, preheader: copy.preheader, html };
}
