-- Agregados históricos para el panel. Las vistas consultan con la identidad del
-- administrador, así que las políticas RLS de las tablas base siguen vigentes.
create view public.v_sales_event_history with (security_invoker = true) as
select event, count(*) as eventos, count(distinct sid) as sesiones,
       min(ts) as primer_evento, max(ts) as ultimo_evento
from public.site_events
group by event;

create view public.v_sales_legacy_whatsapp_clicks with (security_invoker = true) as
select count(*) as clics_sin_folio
from public.site_events
where event = 'cta_click' and props->>'kind' = 'whatsapp'
  and nullif(props->>'folio', '') is null;

create view public.v_sales_email_history with (security_invoker = true) as
select 'estado'::text as tipo, kind as categoria, state as resultado, count(*) as registros
from public.quote_email_log
group by kind, state
union all
select 'evento'::text, event, event, count(*)
from public.quote_email_events
group by event;

revoke all on public.v_sales_event_history, public.v_sales_legacy_whatsapp_clicks,
              public.v_sales_email_history from anon, authenticated;
grant select on public.v_sales_event_history, public.v_sales_legacy_whatsapp_clicks,
                public.v_sales_email_history to authenticated;
