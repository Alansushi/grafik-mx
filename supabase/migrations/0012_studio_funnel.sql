-- Analítica del sitio — Fase 3: embudo de /estudio/ (el configurador).
--
-- Sólo vistas: no toca datos ni la tabla site_events, así que se revierte con
-- DROP VIEW (y restaurando v_sessions desde 0010). Igual que en 0010/0011:
-- security_invoker = true (respetan el RLS de site_events) y los privilegios se
-- cierran a mano porque una vista nueva hereda los default privileges.

-- ── Arreglo a v_sessions: SÓLO sesiones del sitio ───────────────────────────
-- Hasta ahora todo page_view era "una visita al sitio". Con /estudio/ midiendo
-- también, sus sesiones entrarían en el denominador de v_intent_daily,
-- v_source_intent, v_form_funnel... y la tasa de intención del SITIO se diluiría
-- con gente que nunca vio un CTA del sitio (el estudio es una ruta escondida a la
-- que se llega por un enlace directo). El estudio se mide en sus propias vistas.
--
-- coalesce(path, ''): el servidor guarda path = NULL si llegó algo raro; un
-- `NULL NOT LIKE ...` es NULL (no verdadero) y esa sesión desaparecería del sitio.
-- Mismas columnas y en el mismo orden que 0010: CREATE OR REPLACE VIEW no admite otra cosa.
create or replace view public.v_sessions with (security_invoker = true) as
select
  sid,
  min(ts)                                             as inicio,
  (min(ts) at time zone 'America/Mexico_City')::date  as dia,
  (array_agg(device        order by ts) filter (where event = 'page_view' and coalesce(path, '') not like '/estudio%'))[1] as device,
  (array_agg(referrer_host order by ts) filter (where event = 'page_view' and coalesce(path, '') not like '/estudio%'))[1] as referrer_host,
  (array_agg(utm_source    order by ts) filter (where event = 'page_view' and coalesce(path, '') not like '/estudio%'))[1] as utm_source,
  (array_agg(utm_medium    order by ts) filter (where event = 'page_view' and coalesce(path, '') not like '/estudio%'))[1] as utm_medium,
  (array_agg(utm_campaign  order by ts) filter (where event = 'page_view' and coalesce(path, '') not like '/estudio%'))[1] as utm_campaign,
  (array_agg(country       order by ts) filter (where event = 'page_view' and coalesce(path, '') not like '/estudio%'))[1] as country,
  count(*)                                            as eventos,
  bool_or(event = 'cta_click')                        as tuvo_cta,
  min(t_ms) filter (where event = 'cta_click')        as ms_primer_cta,
  (array_agg(props->>'cta_id' order by ts) filter (where event = 'cta_click'))[1] as primer_cta
from public.site_events
group by sid
having bool_or(event = 'page_view' and coalesce(path, '') not like '/estudio%');

-- ── Una fila por sesión que abrió el configurador ───────────────────────────
create view public.v_studio_sessions with (security_invoker = true) as
select
  sid,
  (min(ts) at time zone 'America/Mexico_City')::date  as dia,
  (array_agg(device        order by ts) filter (where event = 'page_view'))[1] as device,
  (array_agg(referrer_host order by ts) filter (where event = 'page_view'))[1] as referrer_host,
  (array_agg(utm_source    order by ts) filter (where event = 'page_view'))[1] as utm_source,
  -- t_ms cuenta desde que cargó la página: "hasta poder usarlo" y "hasta enviar".
  min(t_ms) filter (where event = 'studio_ready')     as ms_hasta_listo,
  min(t_ms) filter (where event = 'studio_submit')    as ms_hasta_envio,
  bool_or(event = 'studio_ready')                     as listo,
  bool_or(event = 'studio_garment')                   as cambio_prenda,
  bool_or(event = 'studio_logo')                      as subio_logo,
  bool_or(event = 'studio_placed')                    as coloco_logo,
  bool_or(event = 'studio_sizes')                     as puso_tallas,
  bool_or(event = 'studio_quote')                     as vio_precio,
  bool_or(event = 'studio_submit')                    as envio,
  bool_or(event = 'studio_error')                     as tuvo_error,
  bool_or(event = 'studio_lowres')                    as vio_aviso_resolucion,
  bool_or(event = 'studio_logo_rejected')             as le_rechazaron_archivo,
  bool_or(event = 'studio_fallback')                  as uso_whatsapp_de_respaldo
from public.site_events
group by sid
having bool_or(event = 'page_view' and coalesce(path, '') like '/estudio%');

-- El embudo, por día y dispositivo. Cada columna cuenta SESIONES que llegaron a
-- ese paso alguna vez (no un embudo estrictamente anidado: alguien puede poner
-- tallas antes de subir el logo). Los porcentajes se calculan sobre `sesiones`.
create view public.v_studio_funnel with (security_invoker = true) as
select
  dia,
  device,
  count(*)                                            as sesiones,
  count(*) filter (where listo)                       as listos,
  count(*) filter (where subio_logo)                  as subieron_logo,
  count(*) filter (where coloco_logo)                 as colocaron_logo,
  count(*) filter (where puso_tallas)                 as pusieron_tallas,
  count(*) filter (where vio_precio)                  as vieron_precio,
  count(*) filter (where envio)                       as enviaron,
  (percentile_cont(0.5) within group (order by ms_hasta_listo))::int  as mediana_ms_hasta_listo,
  (percentile_cont(0.5) within group (order by ms_hasta_envio))::int  as mediana_ms_hasta_envio
from public.v_studio_sessions
group by dia, device
order by dia desc, device;

-- Dónde se atora la gente: errores, avisos y archivos rechazados, con su frecuencia.
--   error             donde = catalog|konva|stage|logo|quote|submit; detalle = código
--   respaldo_whatsapp donde = cuál degradación los mandó a escribir por WhatsApp
--   archivo_rechazado donde = type|size; detalle = extensión (¿suben PDF, AI, CDR?)
--   aviso_resolucion  donde = warn|fail
create view public.v_studio_problems with (security_invoker = true) as
select * from (
  select 'error'::text as tipo, props->>'where' as donde, coalesce(props->>'code', '') as detalle,
         count(*) as veces, count(distinct sid) as sesiones
  from public.site_events where event = 'studio_error' group by 1, 2, 3
  union all
  select 'respaldo_whatsapp', props->>'where', '', count(*), count(distinct sid)
  from public.site_events where event = 'studio_fallback' group by 1, 2, 3
  union all
  select 'archivo_rechazado', props->>'reason', coalesce(props->>'ext', ''), count(*), count(distinct sid)
  from public.site_events where event = 'studio_logo_rejected' group by 1, 2, 3
  union all
  select 'aviso_resolucion', props->>'level', '', count(*), count(distinct sid)
  from public.site_events where event = 'studio_lowres' group by 1, 2, 3
) p
order by veces desc, tipo;

-- Cada envío medido, unido a su pedido real por el folio (GK-XXXXXX). Sirve para
-- CUADRAR: un studio_submit sin fila de `orders` (o al revés, ver
-- docs/analytics/queries.sql) es un evento perdido o un pedido que no se midió.
-- El folio es sólo para mostrar, nunca una credencial (spec §7.8); y esta vista
-- necesita permiso de lectura sobre `orders`, que sólo tiene el admin.
create view public.v_studio_orders with (security_invoker = true) as
select
  e.ts,
  e.props->>'short_code'                              as folio,
  (e.props->>'qty')::int                              as piezas_evento,
  o.status                                            as estado_pedido,
  o.total_cents,
  o.priced_with_placeholder                           as precio_placeholder,
  o.created_at                                        as pedido_creado_en
from public.site_events e
left join public.orders o on o.short_code = e.props->>'short_code'
where e.event = 'studio_submit'
order by e.ts desc;

revoke all on public.v_studio_sessions, public.v_studio_funnel,
              public.v_studio_problems, public.v_studio_orders from anon, authenticated;
grant select on public.v_studio_sessions, public.v_studio_funnel,
                public.v_studio_problems, public.v_studio_orders to authenticated;
