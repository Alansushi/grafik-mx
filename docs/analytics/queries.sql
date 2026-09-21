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
