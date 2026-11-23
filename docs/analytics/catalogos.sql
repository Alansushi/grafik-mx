-- Embudo de catálogos. Las sesiones expuestas son el denominador por ubicación.
-- Una sesión puede aparecer en nav y hero-block si vio ambos enlaces.
-- Clic en WhatsApp es una acción opcional, no confirma una conversación.
select week, placement, catalog, source, campaign, device,
       exposed_sessions, clicked_sessions, opened_sessions, selected_sessions,
       saved_sessions, contacted_sessions, quoted_sessions, won_sessions,
       amount_collected,
       round(100.0 * saved_sessions / nullif(exposed_sessions, 0), 1) as pct_expuesta_a_solicitud
from public.v_catalog_funnel
order by week desc, placement, catalog, exposed_sessions desc;

-- Rendimiento de las solicitudes por SKU, tipo de comprador y origen.
-- El SKU y el tipo de comprador sólo se conocen tras guardar la solicitud;
-- por ello no se asignan sesiones expuestas a un SKU ni a un tipo hipotético.
-- El importe total sólo se atribuye a un SKU cuando éste fue el único artículo
-- de la solicitud. Los pedidos con varios artículos quedan sin importe por SKU
-- hasta que se capture un desglose real, para evitar multiplicar ingresos.
with solicitudes as (
  select i.id, i.items, i.buyer_type,
         date_trunc('week', i.completed_at at time zone 'America/Mexico_City')::date as semana,
         coalesce(nullif(i.utm_source, ''), nullif(i.referrer_host, ''), '(directo)') as fuente,
         i.utm_medium as medio, i.utm_campaign as campana, i.device,
         o.stage, o.amount_collected, o.conversation_confirmed_at,
         jsonb_array_length(i.items) as articulos
  from public.quote_intents i
  left join public.sales_opportunities o on o.quote_intent_id = i.id
  where i.channel = 'catalogos' and i.status = 'completed'
), lineas as (
  select s.*, part->>'catalog' as catalogo, part->>'sku' as sku,
         (part->>'quantity')::integer as cantidad
  from solicitudes s cross join lateral jsonb_array_elements(s.items) part
)
select semana, catalogo, sku, fuente, medio, campana, device, buyer_type,
       count(distinct id) as solicitudes,
       sum(cantidad) as unidades_solicitadas,
       count(distinct id) filter (where stage in ('contactada','cotizada','ganada')) as contactadas,
       count(distinct id) filter (where stage in ('cotizada','ganada')) as cotizadas,
       count(distinct id) filter (where stage = 'ganada') as ganadas,
       count(distinct id) filter (where conversation_confirmed_at is not null) as conversaciones_confirmadas,
       sum(amount_collected) filter (where stage = 'ganada' and articulos = 1) as importe_atribuible,
       count(distinct id) filter (where stage = 'ganada' and articulos > 1) as ganadas_sin_desglose
from lineas
group by semana, catalogo, sku, fuente, medio, campana, device, buyer_type
order by semana desc, solicitudes desc, sku;

-- Alcance y profundidad: busca oportunidades de mejorar el lector.
select props->>'catalog' as catalogo, device,
       count(distinct sid) filter (where event = 'catalog_open') as abrieron,
       count(distinct sid) filter (where event = 'catalog_search') as buscaron,
       count(distinct sid) filter (where event = 'catalog_download') as descargaron,
       round(avg((props->>'depth_pct')::integer) filter (where event = 'catalog_depth'), 1) as profundidad_media_pct
from public.site_events
where event in ('catalog_open','catalog_search','catalog_download','catalog_depth')
group by 1, 2
order by abrieron desc;
