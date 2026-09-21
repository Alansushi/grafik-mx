-- Analítica del sitio — Fase 1 del plan de métricas.
--
-- Guarda eventos de uso (vistas de página, clics en CTA) que llegan por
-- POST /api/track. Sin datos personales: la lista blanca está en
-- api/_lib/events.js y la IP nunca se almacena.
--
-- Frontera de seguridad (igual que 0003): RLS activo, SIN política para anon, y
-- lectura sólo para admin. service_role (api/track.js) salta RLS por definición.

create table public.site_events (
  id            bigint generated always as identity primary key,
  ts            timestamptz not null default now(),
  -- Identificador aleatorio por pestaña (sessionStorage). No es una cookie ni
  -- identifica a una persona: "visitantes únicos" se aproxima con sesiones.
  sid           text not null check (char_length(sid) between 8 and 32),
  event         text not null check (char_length(event) <= 40),
  path          text check (char_length(path) <= 200),
  -- Milisegundos desde que cargó la página: permite medir el tiempo al 1er CTA.
  t_ms          int,
  props         jsonb not null default '{}'::jsonb,
  -- Contexto de sesión, repetido en cada fila a propósito: los reportes por
  -- fuente/dispositivo no dependen de que el page_view de esa sesión haya
  -- llegado (un beacon perdido no debe borrar la atribución de un clic).
  referrer_host text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  device        text check (device in ('mobile','tablet','desktop')),
  vw            int,
  country       text,
  region        text
);

create index site_events_ts       on public.site_events (ts desc);
create index site_events_event_ts on public.site_events (event, ts desc);
create index site_events_sid      on public.site_events (sid);

alter table public.site_events enable row level security;

create policy site_events_admin_read on public.site_events
  for select to authenticated using (public.is_admin());

-- 0003 hizo `revoke all ... from anon` sobre las tablas que EXISTÍAN entonces.
-- Una tabla nueva hereda los default privileges del proyecto (que pueden
-- conceder a anon), así que se cierra explícitamente en vez de suponer.
revoke all on public.site_events from anon, authenticated;
grant select on public.site_events to authenticated;
grant select, insert on public.site_events to service_role;

-- ── Vistas de reporte ──────────────────────────────────────────────────────
-- security_invoker = true: la vista consulta con los permisos de QUIEN la
-- llama. Sin esto correría como su dueño (postgres), saltaría el RLS de arriba
-- y cualquiera con SELECT sobre la vista leería la tabla completa.
-- Las fechas se agrupan en hora de CDMX: un "día" de negocio no es un día UTC.

-- Una fila por sesión que llegó a cargar la página.
create view public.v_sessions with (security_invoker = true) as
select
  sid,
  min(ts)                                             as inicio,
  (min(ts) at time zone 'America/Mexico_City')::date  as dia,
  (array_agg(device        order by ts) filter (where event = 'page_view'))[1] as device,
  (array_agg(referrer_host order by ts) filter (where event = 'page_view'))[1] as referrer_host,
  (array_agg(utm_source    order by ts) filter (where event = 'page_view'))[1] as utm_source,
  (array_agg(utm_medium    order by ts) filter (where event = 'page_view'))[1] as utm_medium,
  (array_agg(utm_campaign  order by ts) filter (where event = 'page_view'))[1] as utm_campaign,
  (array_agg(country       order by ts) filter (where event = 'page_view'))[1] as country,
  count(*)                                            as eventos,
  bool_or(event = 'cta_click')                        as tuvo_cta,
  min(t_ms) filter (where event = 'cta_click')        as ms_primer_cta,
  (array_agg(props->>'cta_id' order by ts) filter (where event = 'cta_click'))[1] as primer_cta
from public.site_events
group by sid
-- Un clic sin su page_view (beacon perdido) no entra: inflaría la tasa sobre 100 %.
having bool_or(event = 'page_view');

-- LA métrica: qué % de las sesiones termina en un clic para cotizar, por día.
create view public.v_intent_daily with (security_invoker = true) as
select
  dia,
  count(*)                                             as sesiones,
  count(*) filter (where tuvo_cta)                     as sesiones_con_cta,
  round(100.0 * count(*) filter (where tuvo_cta) / count(*), 1) as pct_intencion,
  (percentile_cont(0.5) within group (order by ms_primer_cta))::int as mediana_ms_primer_cta
from public.v_sessions
group by dia
order by dia desc;

-- Qué botón se usa: clics, sesiones distintas y su peso sobre el total de clics.
create view public.v_cta_performance with (security_invoker = true) as
select
  props->>'cta_id'                                     as cta_id,
  props->>'kind'                                       as kind,
  count(*)                                             as clics,
  count(distinct sid)                                  as sesiones,
  round(100.0 * count(*) / sum(count(*)) over (), 1)   as pct_de_clics
from public.site_events
where event = 'cta_click'
group by 1, 2
order by clics desc;

-- De dónde vienen las sesiones que terminan cotizando (UTM, si no referrer).
create view public.v_source_intent with (security_invoker = true) as
select
  coalesce(nullif(utm_source, ''), referrer_host, '(directo)') as fuente,
  utm_medium,
  utm_campaign,
  device,
  count(*)                                             as sesiones,
  count(*) filter (where tuvo_cta)                     as sesiones_con_cta,
  round(100.0 * count(*) filter (where tuvo_cta) / count(*), 1) as pct_intencion
from public.v_sessions
group by 1, 2, 3, 4
order by sesiones desc;

-- Las vistas heredan default privileges igual que las tablas.
revoke all on public.v_sessions, public.v_intent_daily,
              public.v_cta_performance, public.v_source_intent from anon, authenticated;
grant select on public.v_sessions, public.v_intent_daily,
                public.v_cta_performance, public.v_source_intent to authenticated;
