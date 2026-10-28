-- Ejecutar en SQL Editor de Supabase sólo después de configurar en Vercel
-- QUOTE_CAPTURE_ENABLED=1, QUOTE_CRON_SECRET, RESEND_API_KEY, EMAIL_FROM,
-- PUBLIC_BASE_URL y de verificar el aviso de privacidad y el dominio remitente.
-- Guardar antes en Supabase Vault dos secretos:
--   grafik_quote_cron_url = https://www.grafik.mx/api/send-reminders
--   grafik_quote_cron_secret = mismo valor que QUOTE_CRON_SECRET de Vercel
-- No poner el secreto literal en este archivo ni en el historial SQL.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule('grafik-quote-reminders', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'grafik_quote_cron_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-grafik-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'grafik_quote_cron_secret')
    ),
    body := '{}'::jsonb
  );
$$);
