import { captureEnabled } from './_lib/capture-config.js';

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (!captureEnabled()) return res.status(503).json({ error: 'NOTICE_NOT_CONFIGURED' });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).send(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Aviso de privacidad | GRAFIK</title><body style="font:18px Barlow,Arial,sans-serif;max-width:48rem;margin:3rem auto;padding:1rem;line-height:1.6"><h1>Aviso de privacidad de GRAFIK</h1><p><strong>Responsable:</strong> ${esc(process.env.PRIVACY_CONTROLLER)}.<br><strong>Domicilio:</strong> ${esc(process.env.PRIVACY_ADDRESS)}.<br><strong>Contacto de privacidad y derechos ARCO:</strong> <a href="mailto:${esc(process.env.PRIVACY_EMAIL)}">${esc(process.env.PRIVACY_EMAIL)}</a>.</p><h2>Datos y finalidades</h2><p>Tratamos el nombre, correo electrónico, teléfono y detalles que nos compartas para preparar, atender y dar seguimiento a tu solicitud de cotización. Orkestalo recibe y atiende las solicitudes dirigidas a GRAFIK. Si comienzas y no terminas, podemos enviarte un recordatorio aproximadamente 24 horas después. Si usas el Estudio, también tratamos los datos de tu diseño para preparar la cotización.</p><p>Al pulsar Enviar por WhatsApp, se abrirá una conversación con un mensaje preparado con los datos que llenaste. WhatsApp no lo envía automáticamente: debes revisar y enviar el mensaje desde esa aplicación para que Orkestalo lo reciba. El uso de WhatsApp implica que los datos incluidos en el mensaje se transmitan a WhatsApp/Meta conforme a sus propios términos y aviso de privacidad.</p><p>Las promociones por correo son una finalidad opcional y separada. Sólo las enviaremos si marcas la casilla de consentimiento. Puedes retirarlo desde el enlace de baja incluido en los correos.</p><h2>Encargados y conservación</h2><p>Usamos Supabase para almacenar solicitudes y Resend para enviar correos de seguimiento. Conservamos los datos durante el tiempo necesario para atender la solicitud y las obligaciones aplicables. No vendemos estos datos.</p><h2>Tus derechos</h2><p>Para acceder, rectificar, cancelar u oponerte al tratamiento, o revocar tu consentimiento, escribe a <a href="mailto:${esc(process.env.PRIVACY_EMAIL)}">${esc(process.env.PRIVACY_EMAIL)}</a> e indica tu solicitud y un medio de respuesta. También puedes darte de baja de los correos mediante el enlace incluido en ellos.</p><h2>Cambios</h2><p>Publicaremos aquí los cambios a este aviso.</p><p>Última actualización: 28 de octubre de 2026.</p><p><a href="/">Volver a GRAFIK</a></p></body></html>`);
}
