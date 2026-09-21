-- Analítica del sitio — Fase 2: vistas para las interacciones secundarias
-- (section_view, form_start, service_chip, ...). Sólo vistas: no toca datos ni
-- la tabla site_events, así que se revierte con DROP VIEW.
--
-- Igual que en 0010: security_invoker = true (la vista consulta con los permisos
-- de quien la llama y por tanto respeta el RLS de site_events) y los privilegios
-- de una vista nueva se cierran a mano, porque heredan los default privileges.

-- Embudo del formulario de contacto, por día y dispositivo.
-- OJO: cada columna cuenta SESIONES que hicieron ese paso, no un embudo anidado.
-- Alguien puede empezar el formulario sin haber "visto" #contacto (saltó desde
-- el menú en menos de 800 ms), así que `empezaron` puede superar a
-- `vieron_contacto`. Para porcentajes se divide cada paso entre `sesiones`.
create view public.v_form_funnel with (security_invoker = true) as
with por_sesion as (
  select
    sid,
    bool_or(event = 'section_view' and props->>'section' = 'contacto')   as vio_contacto,
    bool_or(event = 'form_start')                                        as empezo,
    -- Seleccionar un servicio; deseleccionarlo (selected = false) no cuenta.
    bool_or(event = 'service_chip' and (props->>'selected')::boolean)    as eligio_servicio,
    bool_or(event = 'cta_click' and props->>'cta_id' = 'contacto-form')  as envio
  from public.site_events
  group by sid
)
select
  s.dia,
  s.device,
  count(*)                                        as sesiones,
  count(*) filter (where p.vio_contacto)          as vieron_contacto,
  count(*) filter (where p.empezo)                as empezaron,
  count(*) filter (where p.eligio_servicio)       as eligieron_servicio,
  count(*) filter (where p.envio)                 as enviaron
from public.v_sessions s
join por_sesion p using (sid)
group by s.dia, s.device
order by s.dia desc, s.device;

-- Hasta dónde llega la gente: % de sesiones que vio cada sección.
create view public.v_section_reach with (security_invoker = true) as
select
  e.props->>'section'                             as seccion,
  count(distinct e.sid)                           as sesiones_que_la_vieron,
  round(100.0 * count(distinct e.sid)
        / nullif((select count(*) from public.v_sessions), 0), 1) as pct_de_sesiones
from public.site_events e
join public.v_sessions s on s.sid = e.sid
where e.event = 'section_view'
group by 1
order by pct_de_sesiones desc;

-- Cuánto rinde cada CTA sobre la gente que PUDO verlo. Un botón al final de la
-- página no debe salir castigado por estar abajo: se mide sobre las sesiones que
-- llegaron a su sección, no sobre todas.
--
-- `mapa` dice dónde vive cada CTA y DEBE mantenerse igual que CTA_IDS en
-- api/_lib/events.js (tests/unit/events.test.js lo cruza). Sin sección (null)
-- = siempre a la vista. `solo_desktop`: el CTA de la barra desaparece por debajo
-- de 960 px, así que sólo se mide sobre sesiones de escritorio.
create view public.v_cta_exposure with (security_invoker = true) as
with mapa(cta_id, seccion, solo_desktop) as (values
  ('nav',              null,        true),
  ('hero',             null,        false),
  ('floating',         null,        false),
  ('servicios-bottom', 'servicios', false),
  ('trabajos-bottom',  'trabajos',  false),
  ('lightbox',         'trabajos',  false),
  ('contacto-card',    'contacto',  false),
  ('contacto-tel',     'contacto',  false),
  ('contacto-form',    'contacto',  false),
  ('cta-final',        'cta-final', false),
  ('footer-tel',       'footer',    false)
),
por_sesion as (
  select
    s.sid,
    s.device,
    coalesce(array_agg(distinct e.props->>'section') filter (where e.event = 'section_view'), '{}') as secciones,
    coalesce(array_agg(distinct e.props->>'cta_id')  filter (where e.event = 'cta_click'),    '{}') as ctas
  from public.v_sessions s
  join public.site_events e on e.sid = s.sid
  group by s.sid, s.device
),
base as (
  select
    m.cta_id,
    m.seccion,
    -- Quien hizo clic estuvo expuesto aunque su section_view no llegara a
    -- registrarse (pasó < 800 ms): sin esto la tasa podría superar el 100 %.
    ((not m.solo_desktop or p.device = 'desktop')
      and (m.seccion is null or m.seccion = any(p.secciones) or m.cta_id = any(p.ctas))) as expuesta,
    (m.cta_id = any(p.ctas)) as hizo_clic
  from mapa m
  cross join por_sesion p
)
select
  cta_id,
  seccion,
  count(*) filter (where expuesta)                as sesiones_expuestas,
  count(*) filter (where expuesta and hizo_clic)  as sesiones_con_clic,
  round(100.0 * count(*) filter (where expuesta and hizo_clic)
        / nullif(count(*) filter (where expuesta), 0), 1) as pct_clic_sobre_expuestas
from base
group by cta_id, seccion
order by pct_clic_sobre_expuestas desc nulls last;

revoke all on public.v_form_funnel, public.v_section_reach, public.v_cta_exposure from anon, authenticated;
grant select on public.v_form_funnel, public.v_section_reach, public.v_cta_exposure to authenticated;
