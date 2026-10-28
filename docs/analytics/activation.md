# Activación del seguimiento de cotizaciones

Código preparado el 27 de octubre de 2026. La captura permanece apagada sin `QUOTE_CAPTURE_ENABLED=1`. El formulario continúa abriendo WhatsApp.

El responsable confirmado es **Orkestalo S.A.S. de C.V.**; domicilio: **Norte 13 núm. 282, colonia Moctezuma 2.ª Sección, alcaldía Venustiano Carranza, C.P. 15530, Ciudad de México**; correo de privacidad/ARCO: **info@orkestalo.com**. Los tres valores y `PUBLIC_BASE_URL=https://www.grafik.mx` ya están guardados como variables de configuración de **Production** en Vercel. No se ha activado la captura ni se ha publicado el código en `main`.

1. Revisar el texto de `/api/privacy-notice` y confirmar quién recibe las solicitudes después de Orkestalo para describir correctamente cualquier transferencia. La versión simplificada se muestra junto a los formularios antes de guardar datos.
2. Aplicar `supabase/migrations/20261027193344_quote_intents.sql` y verificar grants, RLS y la vista `v_quote_funnel` con consultas reales. Esta migración no se ha aplicado en producción.
3. Conectar **la cuenta existente** de Resend: configurar `RESEND_API_KEY` en Vercel, verificar el dominio remitente `grafik.mx` y definir `EMAIL_FROM`. La instalación de Resend desde Vercel Marketplace crea una cuenta nueva, por lo que no se ha usado.
4. Crear en Resend un webhook hacia `https://www.grafik.mx/api/resend-webhook` para `email.delivered`, `email.bounced`, `email.clicked` y `contact.updated`; poner su secreto en `RESEND_WEBHOOK_SECRET` de Vercel. Probar firma válida, firma inválida y reintento.
5. Crear un valor aleatorio para `QUOTE_CRON_SECRET` en Vercel y guardarlo también en Supabase Vault como `grafik_quote_cron_secret`. Guardar la URL del endpoint como `grafik_quote_cron_url`. Ejecutar `docs/analytics/activate-reminders.sql` para la cadencia de 15 minutos.
6. Activar `QUOTE_CAPTURE_ENABLED=1` en Vercel una vez que el aviso, Resend, webhook y cron estén verificados. Confirmar en móvil y escritorio: inicio, solicitud guardada, confirmación, recordatorio tras ~24 h, regreso, pedido y baja. La función de recordatorios usa identificadores de envío y una fila única por tipo; Resend retiene la idempotencia 24 h, por lo que la app no reintenta resultados ambiguos después de 23 h.
7. Crear el segmento/lista de campañas en Resend exclusivamente con la consulta de `campaign-seasonal.md` y contrastar el total antes de enviar. El primer Broadcast requiere el catálogo de temporada revisado; el borrador actual no se envía.

Cuando se solicite llevar estos cambios a producción, seguir el flujo del proyecto: commit, push, PR a `main`, integración y despliegue automático de Vercel. No usar despliegue directo por CLI.
