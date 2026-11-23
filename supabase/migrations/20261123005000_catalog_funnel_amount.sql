-- Suma todos los pedidos ganados de la sesión cuando pertenecen a un solo catálogo.
create or replace view public.v_catalog_funnel with (security_invoker = true) as
with exposures as (
  select distinct on (sid, props->>'placement')
    sid, props->>'placement' as placement,
    date_trunc('week', ts at time zone 'America/Mexico_City')::date as week,
    coalesce(nullif(utm_source, ''), nullif(referrer_host, ''), '(directo)') as source,
    utm_campaign as campaign, device
  from public.site_events
  where event = 'catalog_promo_exposure'
  order by sid, props->>'placement', ts
), catalogs as (
  select unnest(array['navidad-2026','agendas-2027']) as catalog
)
select e.week, e.placement, c.catalog, e.source, e.campaign, e.device,
  count(*) as exposed_sessions,
  count(*) filter (where exists (select 1 from public.site_events s
    where s.sid=e.sid and s.event='catalog_promo_click' and s.props->>'placement'=e.placement)) as clicked_sessions,
  count(*) filter (where exists (select 1 from public.site_events s
    where s.sid=e.sid and s.event='catalog_open' and s.props->>'catalog'=c.catalog)) as opened_sessions,
  count(*) filter (where exists (select 1 from public.site_events s
    where s.sid=e.sid and s.event='catalog_item' and s.props->>'catalog'=c.catalog and s.props->>'action'='add')) as selected_sessions,
  count(*) filter (where exists (select 1 from public.quote_intents i
    where i.analytics_sid=e.sid and i.status='completed' and i.channel='catalogos'
      and i.items @> jsonb_build_array(jsonb_build_object('catalog', c.catalog)))) as saved_sessions,
  count(*) filter (where exists (select 1 from public.quote_intents i
    join public.sales_opportunities o on o.quote_intent_id=i.id
    where i.analytics_sid=e.sid and i.status='completed' and i.channel='catalogos'
      and i.items @> jsonb_build_array(jsonb_build_object('catalog', c.catalog))
      and o.stage in ('contactada','cotizada','ganada'))) as contacted_sessions,
  count(*) filter (where exists (select 1 from public.quote_intents i
    join public.sales_opportunities o on o.quote_intent_id=i.id
    where i.analytics_sid=e.sid and i.status='completed' and i.channel='catalogos'
      and i.items @> jsonb_build_array(jsonb_build_object('catalog', c.catalog))
      and o.stage in ('cotizada','ganada'))) as quoted_sessions,
  count(*) filter (where exists (select 1 from public.quote_intents i
    join public.sales_opportunities o on o.quote_intent_id=i.id
    where i.analytics_sid=e.sid and i.status='completed' and i.channel='catalogos'
      and i.items @> jsonb_build_array(jsonb_build_object('catalog', c.catalog))
      and o.stage='ganada')) as won_sessions,
  coalesce(sum((select sum(o.amount_collected) from public.quote_intents i
    join public.sales_opportunities o on o.quote_intent_id=i.id
    where i.analytics_sid=e.sid and i.status='completed' and i.channel='catalogos'
      and i.items @> jsonb_build_array(jsonb_build_object('catalog', c.catalog))
      and o.stage='ganada'
      -- Una solicitud mixta no tiene importe asignado por catálogo.
      and (select count(distinct part->>'catalog') from jsonb_array_elements(i.items) part) = 1)),0) as amount_collected
from exposures e cross join catalogs c
group by e.week,e.placement,c.catalog,e.source,e.campaign,e.device;
