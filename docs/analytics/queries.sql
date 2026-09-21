-- Consultas de analítica del sitio. Se corren en el SQL editor de Supabase
-- (proyecto grafik-estudio) o pidiéndoselas a Claude. Todas leen las vistas de
-- supabase/migrations/0010_site_events.sql; fechas en hora de CDMX.
--
-- Recordatorio de lo que SÍ y NO mide: un clic en un botón de WhatsApp es
-- INTENCIÓN de cotizar, no un mensaje enviado (eso ocurre dentro de WhatsApp).
-- Y "sesión" es una pestaña, no una persona: sin cookies no hay visitantes únicos.

-- 1. LA métrica: % de sesiones que terminan en un clic para cotizar, por día.
select * from v_intent_daily limit 30;

-- 2. ¿Qué botón se usa? (clics, sesiones distintas, peso sobre el total)
select * from v_cta_performance;

-- 3. ¿De dónde vienen las sesiones que cotizan? (UTM; si no, referrer; si no, directo)
select * from v_source_intent limit 20;

-- 4. Móvil vs escritorio.
select device,
       count(*)                                   as sesiones,
       count(*) filter (where tuvo_cta)           as con_cta,
       round(100.0 * count(*) filter (where tuvo_cta) / count(*), 1) as pct_intencion
from v_sessions
group by device
order by sesiones desc;

-- 5. ¿Qué botón fue el PRIMERO en cada sesión que cotizó?
select primer_cta, count(*) as sesiones
from v_sessions
where tuvo_cta
group by primer_cta
order by sesiones desc;

-- 6. Categoría de trabajo que la gente cotiza después de verla en el lightbox.
select props->>'work_cat' as categoria, count(*) as clics
from site_events
where event = 'cta_click' and props->>'cta_id' = 'lightbox'
group by 1
order by clics desc;

-- 7. Servicio elegido en el formulario al enviarlo.
select coalesce(props->>'servicio', '(sin elegir)') as servicio, count(*) as envios
from site_events
where event = 'cta_click' and props->>'cta_id' = 'contacto-form'
group by 1
order by envios desc;

-- 8. Salud del pipeline: eventos por día y tipo. Si un día sale en cero con
--    tráfico en Vercel Analytics, algo está fallando (adblock, /api/track caído).
select (ts at time zone 'America/Mexico_City')::date as dia, event, count(*) as n
from site_events
group by 1, 2
order by 1 desc, 3 desc
limit 30;

-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 2 — interacciones secundarias (migración 0011)
-- ═══════════════════════════════════════════════════════════════════════════

-- 9. ¿Hasta dónde llega la gente? % de sesiones que vio cada sección.
--    Una sección cuenta tras 800 ms con >= 160 px a la vista (o la mitad, si es más chica).
select * from v_section_reach;

-- 10. Embudo del formulario, en porcentajes sobre las sesiones de cada día/dispositivo.
--     No es un embudo anidado: `empezaron` puede superar a `vieron_contacto`.
select dia, device, sesiones,
       round(100.0 * vieron_contacto    / sesiones, 1) as pct_vio_contacto,
       round(100.0 * empezaron          / sesiones, 1) as pct_empezo_form,
       round(100.0 * eligieron_servicio / sesiones, 1) as pct_eligio_servicio,
       round(100.0 * enviaron           / sesiones, 1) as pct_envio
from v_form_funnel
order by dia desc, device;

-- 11. Rendimiento de cada CTA sobre la gente que PUDO verlo (no sobre todas las sesiones).
--     El de la barra sólo se mide en escritorio: en móvil está oculto.
select * from v_cta_exposure;

-- 12. Preguntas frecuentes más abiertas.
select props->>'q' as pregunta, count(distinct sid) as sesiones
from site_events
where event = 'faq_open'
group by 1
order by sesiones desc;

-- 13. ¿Qué dudas se abren en las sesiones que cotizan y en las que no?
--     Ojo: no se exige que la pregunta fuera ANTES del clic, sólo la misma sesión.
select e.props->>'q' as pregunta,
       count(distinct e.sid) filter (where s.tuvo_cta)     as en_sesiones_que_cotizaron,
       count(distinct e.sid) filter (where not s.tuvo_cta) as en_sesiones_que_no
from site_events e
join v_sessions s on s.sid = e.sid
where e.event = 'faq_open'
group by 1
order by en_sesiones_que_cotizaron desc;

-- 14. Trabajos que más se abren y a qué categoría pertenecen.
select props->>'slug' as trabajo, props->>'cat' as categoria, count(*) as aperturas, count(distinct sid) as sesiones
from site_events
where event = 'work_open'
group by 1, 2
order by aperturas desc;

-- 15. Servicios que la gente SELECCIONA en el formulario (los "deseleccionar" no cuentan).
select props->>'servicio' as servicio, count(*) as selecciones
from site_events
where event = 'service_chip' and (props->>'selected')::boolean
group by 1
order by selecciones desc;

-- 16. Uso de la navegación: barra vs botones de la página, y a dónde van.
select props->>'from' as desde, props->>'target' as destino, count(*) as clics
from site_events
where event = 'nav_click'
group by 1, 2
order by clics desc;
