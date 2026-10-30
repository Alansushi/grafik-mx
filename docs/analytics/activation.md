# Activación del seguimiento de cotizaciones

La captura quedó activa el 28 de octubre de 2026 mediante el despliegue Git de Production `dpl_Cc7VpBuPPzvqZxhvyUBeN2vVP6fd`. Se verificó que `GET https://www.grafik.mx/api/quote-intent` devuelve `enabled: true`. El responsable configurado es **Orkestalo S.A.S. de C.V.**, que recibe y atiende las solicitudes dirigidas a GRAFIK; domicilio: **Norte 13 núm. 282, colonia Moctezuma 2.ª Sección, alcaldía Venustiano Carranza, C.P. 15530, Ciudad de México**; correo de privacidad/ARCO: **info@orkestalo.com**. Estos valores están guardados en Vercel Production.

1. El aviso integral, el texto junto al formulario y la pantalla de acceso al Estudio explican que Enviar abre WhatsApp con el mensaje preparado, que la persona debe enviarlo desde esa aplicación y que Orkestalo atiende las solicitudes. El sistema sólo puede registrar el intento y los datos guardados; no puede comprobar que el mensaje de WhatsApp efectivamente se envió.
2. La migración `supabase/migrations/20261027193344_quote_intents.sql` está aplicada en producción. Se verificó RLS activo en las tres tablas, sin `SELECT` para `anon`; las políticas de lectura de `authenticated` exigen `is_admin()`. `v_quote_funnel` usa `security_invoker=true`.
3. `RESEND_API_KEY` y `EMAIL_FROM=GRAFIK <info@orkestalo.com>` están configurados en Vercel Production. El nombre visible del remitente y el contenido de los correos de cotización usan GRAFIK; Orkestalo sólo aparece en la dirección de envío. Resend reporta `orkestalo.com` como Verified y los tres registros (DKIM, `rsend`, `send`) como Verified. No se modificaron los registros MX, SPF ni DKIM actuales de Private Email.
4. El endpoint `https://www.grafik.mx/api/resend-webhook` quedó registrado y Enabled en Resend con `email.delivered`, `email.bounced`, `email.clicked` y `contact.updated`. Su secreto de firma quedó guardado como Secret de Production `RESEND_WEBHOOK_SECRET` en Vercel.
5. `QUOTE_CRON_SECRET` está guardado como Secret de Production en Vercel y, junto con `grafik_quote_cron_url`, en Supabase Vault. `pg_cron` y `pg_net` están instalados. El job `grafik-quote-reminders` quedó programado cada 15 minutos en Supabase Cron.
6. `QUOTE_CAPTURE_ENABLED=1` está configurado y la ruta devuelve `enabled: true` en Production. La función usa identificadores de envío y una fila única por tipo; Resend retiene la idempotencia 24 h, así que la app no reintenta resultados ambiguos después de 23 h. El sistema registra los eventos que llegan, pero WhatsApp no permite confirmar desde GRAFIK que la persona envió el mensaje.
7. Crear el segmento/lista de campañas en Resend exclusivamente con la consulta de `campaign-seasonal.md` y contrastar el total antes de enviar. El primer Broadcast requiere el catálogo de temporada revisado; el borrador actual no se envía.

Cuando se solicite llevar cambios a producción, seguir el flujo del proyecto: commit, push, PR a `main`, integración y despliegue automático de Vercel. No usar despliegue directo por CLI.

## Pruebas reales de correo, 30 de octubre de 2026

El [PR #26](https://github.com/Alansushi/grafik-mx/pull/26) se integró en `main` como `51b5387`. La integración Git de Vercel creó Production `dpl_FxdNWVhrWj3TPJ1aYoBU8PkU3d52`, estado `Ready`, con alias `www.grafik.mx` y `grafik.mx`. La ruta de captura respondió `enabled: true`. Antes del PR pasaron 21 archivos y 491 pruebas; se revisaron por HTTP las tres vistas previas de correo.

Se enviaron dos solicitudes de prueba con `info@orkestalo.com`, sin abrir WhatsApp:

| Tipo | ID de solicitud | Estado observado | ID de Resend | Evento de entrega | Resultado pendiente |
|---|---|---|---|---|---|
| Completada, Contacto | `ed05ebe7-4298-4d1b-872c-2171f49587a7` | `completed`; una fila `confirmation`, `delivered` | `01a18e57-c1c8-7c4f-b7be-90e4e61a57f5` | 1 `delivered`, 0 `bounced` | La persona responsable confirmó que recibió el correo en `info@orkestalo.com` el 30 de octubre. |
| Iniciada, Contacto | `d9cac76e-1faa-4a6b-b4d5-793b5182dd3c` | `started`; sin correo prematuro | Pendiente | Pendiente | Verificar tras las 19:44 UTC del 31 de octubre de 2026 y la siguiente ejecución del cron de 15 minutos. |

Ambos IDs están excluidos del reporte agregado en `queries.sql`. Cuando llegue el recordatorio, comprobar que haya una sola fila `reminder` con ID de Resend y un evento `delivered`, sin rebote. Abrir su enlace y contrastar `returned_at` antes y después de abrirlo dos veces: sólo debe pasar de `NULL` a una marca de tiempo. La visita no confirma una cotización completada ni un mensaje de WhatsApp enviado.

**Clics de Resend:** el webhook está habilitado para `email.clicked`, pero aún no se ha verificado la configuración de seguimiento del dominio. En el reporte, `tracking_habilitado=false` deja clics y tasa de clic como `NULL` hasta confirmar esa configuración. Si permanece deshabilitada, usar `returned_at` como medida de regreso para los recordatorios.
