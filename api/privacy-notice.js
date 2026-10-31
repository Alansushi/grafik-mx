import { captureEnabled } from './_lib/capture-config.js';

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (!captureEnabled()) return res.status(503).json({ error: 'NOTICE_NOT_CONFIGURED' });

  const controller = esc(process.env.PRIVACY_CONTROLLER.trim());
  const address = esc(process.env.PRIVACY_ADDRESS.trim());
  const email = esc(process.env.PRIVACY_EMAIL.trim());

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aviso de privacidad integral | GRAFIK</title>
  <link rel="stylesheet" href="/styles.css">
  <style>
    .privacy-page { min-height: 100vh; background: var(--negro); color: var(--blanco); }
    .privacy-shell { width: min(100% - 40px, 760px); margin: 0 auto; padding: 48px 0 80px; }
    .privacy-back { display: inline-block; color: var(--plata); font-size: 14px; text-decoration: underline; text-underline-offset: 4px; }
    .privacy-back:hover, .privacy-page a:not(.privacy-back):hover { color: var(--blanco); }
    .privacy-page a:focus-visible { outline: 2px solid var(--rojo-txt); outline-offset: 4px; }
    .privacy-title { margin: 36px 0 24px; font-family: 'Barlow Condensed', sans-serif; font-size: clamp(40px, 7vw, 64px); font-weight: 900; line-height: 1; text-transform: uppercase; }
    .privacy-title::after { content: ''; display: block; width: 64px; height: 4px; margin-top: 22px; background: var(--rojo); }
    .privacy-card { padding: 28px 32px; background: var(--carbon); border: 1px solid var(--carbon-hi); }
    .privacy-page h2 { margin: 36px 0 12px; font-family: 'Barlow Condensed', sans-serif; font-size: 29px; font-weight: 800; line-height: 1.1; }
    .privacy-page p { max-width: 68ch; margin: 0 0 16px; color: var(--plata-claro); line-height: 1.65; }
    .privacy-page strong { color: var(--blanco); font-weight: 600; }
    .privacy-page a:not(.privacy-back) { color: var(--plata-claro); text-decoration: underline; text-underline-offset: 3px; overflow-wrap: anywhere; }
    .privacy-updated { padding-top: 24px; border-top: 1px solid var(--carbon-hi); font-size: 13px; color: var(--plata); }
    @media (max-width: 640px) { .privacy-shell { width: min(100% - 32px, 760px); padding: 28px 0 56px; } .privacy-card { padding: 22px 20px; } .privacy-title { margin-top: 28px; } }
  </style>
</head>
<body class="privacy-page">
  <main class="privacy-shell">
    <a class="privacy-back" href="/">Volver a GRAFIK</a>
    <h1 class="privacy-title">Aviso de privacidad integral</h1>
    <div class="privacy-card">
      <p><strong>Responsable:</strong> ${controller}.<br><strong>Domicilio:</strong> ${address}.<br><strong>Contacto de privacidad y derechos ARCO:</strong> <a href="mailto:${email}">${email}</a>.</p>
      <h2>Datos y finalidades</h2>
      <p>${controller}, con domicilio en ${address}, tratará tu nombre, correo, teléfono y detalle para preparar y dar seguimiento a la cotización. ${controller} recibe y atiende las solicitudes de GRAFIK.</p>
      <p>Si comienzas y no terminas, podemos enviarte un recordatorio aproximadamente 24 horas después. Si usas el Estudio, también tratamos los datos de tu diseño para preparar la cotización.</p>
      <p>Al pulsar Enviar por WhatsApp se abrirá WhatsApp con el mensaje preparado; debes enviarlo desde esa aplicación para que ${controller} lo reciba. WhatsApp no lo envía automáticamente. El uso de WhatsApp implica que los datos incluidos en el mensaje se transmitan a WhatsApp/Meta conforme a sus propios términos y aviso de privacidad.</p>
      <p>Las promociones requieren tu aceptación separada. Sólo enviaremos promociones por correo si marcas la casilla opcional. Puedes retirar tu consentimiento desde el enlace de baja incluido en los correos.</p>
      <h2>Encargados y conservación</h2>
      <p>Usamos Supabase para almacenar solicitudes y Resend para enviar correos de seguimiento. Conservamos los datos durante el tiempo necesario para atender la solicitud y las obligaciones aplicables. No vendemos estos datos.</p>
      <h2>Tus derechos</h2>
      <p>Para acceder, rectificar, cancelar u oponerte al tratamiento, o revocar tu consentimiento, escribe a <a href="mailto:${email}">${email}</a> e indica tu solicitud y un medio de respuesta. También puedes darte de baja de los correos mediante el enlace incluido en ellos.</p>
      <h2>Cambios</h2>
      <p>Publicaremos aquí los cambios a este aviso.</p>
      <p class="privacy-updated">Última actualización: 30 de octubre de 2026.</p>
    </div>
  </main>
</body>
</html>`);
}
