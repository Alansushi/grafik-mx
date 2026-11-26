-- Sólo cuenta sesiones que visitaron el configurador. Los pedidos públicos
-- viven en /estudio/pedido/ y no constituyen una entrada al configurador.
create or replace view public.v_studio_sessions with (security_invoker = true) as
select
  sid,
  (min(ts) at time zone 'America/Mexico_City')::date as dia,
  (array_agg(device        order by ts) filter (where event = 'page_view'))[1] as device,
  (array_agg(referrer_host order by ts) filter (where event = 'page_view'))[1] as referrer_host,
  (array_agg(utm_source    order by ts) filter (where event = 'page_view'))[1] as utm_source,
  min(t_ms) filter (where event = 'studio_ready')  as ms_hasta_listo,
  min(t_ms) filter (where event = 'studio_submit') as ms_hasta_envio,
  bool_or(event = 'studio_ready')         as listo,
  bool_or(event = 'studio_garment')       as cambio_prenda,
  bool_or(event = 'studio_logo')          as subio_logo,
  bool_or(event = 'studio_placed')        as coloco_logo,
  bool_or(event = 'studio_sizes')         as puso_tallas,
  bool_or(event = 'studio_price_view')    as vio_precio,
  bool_or(event = 'studio_submit')        as envio,
  bool_or(event = 'studio_error')         as tuvo_error,
  bool_or(event = 'studio_lowres')        as vio_aviso_resolucion,
  bool_or(event = 'studio_logo_rejected') as le_rechazaron_archivo,
  bool_or(event = 'studio_fallback')      as uso_whatsapp_de_respaldo
from public.site_events
where path = '/estudio/'
group by sid
having bool_or(event = 'page_view');
