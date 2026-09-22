-- Playera y gorra pasan a fotos reales de varios ángulos: gorra front+left+
-- right (nunca tuvo foto — venía en 'procedural:cap'), playera front+back
-- (reemplaza la foto única de la migración 0008). Sólo "front" es imprimible
-- (tiene print_area/logo/Transformer y entra a order_items); left/right/back
-- son de presentación — no tocan order_items, pricing ni checkout.
--
-- Origen de las fotos: dos sheets generados por IA (gorra trucker negra en 6
-- ángulos, playera blanca frente+espalda), recortados en paneles individuales
-- con tools/crop-mockup-sheet.py y procesados uno a uno con
-- tools/mockup-cutout.swift (recorte con Vision + escala de grises exacta
-- r=g=b). De la gorra se usaron sólo 3 de los 6 paneles (front/left/right);
-- atrás/superior/inferior se descartaron sin procesar.
--
-- Las columnas de garment_types se mueven JUNTAS, mismo razonamiento que
-- 0008: base_mockup_url versionado (el bucket sirve Cache-Control:
-- immutable), canvas_size en la proporción de LA FOTO NUEVA (drawImage
-- estira, así que una proporción vieja deja la prenda aplastada o estirada),
-- print_area recalibrado SOBRE LA SILUETA NUEVA — la calibración de la gorra
-- procedural (0001/0009) NO aplica a una foto real, y la calibración de
-- playera-base-v2 (0008) tampoco aplica a esta foto nueva aunque sea la misma
-- prenda física: es un encuadre distinto.
--
-- Cómo se midió (mismo método que 0008/0009 — sobre la silueta, no a ojo):
--
--   · playera: se perfiló el ancho de la silueta por fila (alpha>umbral) en
--     el PNG final. El torso (ya sin manga) se estabiliza en ~0.578-0.593 del
--     ancho del canvas a partir de ~46% de alto; con una playera M ~51 cm
--     plana, 1 fracción de ancho ≈ 51/0.578 ≈ 88.2 cm — mismo razonamiento de
--     0008. El borde superior del área usa la regla de "3 pulgadas (7.62 cm)
--     bajo el cuello", con el cuello estimado en y≈0.10 del canvas.
--
--   · gorra: sin una costura de referencia tan nítida como el cuello de una
--     playera, se perfiló el ancho de la silueta por fila para ubicar el
--     panel frontal (más ancho, liso) frente a la visera (discontinuidad de
--     ancho ~68-70%) y se centró un parche a la convención habitual de
--     bordado de gorra: centrado, por encima de la costura de la visera.
--
-- ⚠️  El print_area de la gorra es una estimación geométrica razonada, no una
--     medición tan directa como la de la playera (no hay una costura de
--     "cuello" equivalente en la foto para anclarla). CONFIRMAR visualmente
--     en el navegador (guía punteada sobre el panel frontal, ni tocando la
--     costura de la visera ni saliéndose hacia la malla) antes de dar por
--     bueno — ver CLAUDE.md § "Mockups de prenda" y la sección de
--     verificación end-to-end del incremento que añadió esta migración.
--
-- print_area_width_cm se conserva igual a antes (11.0 gorra, 31.6 playera):
-- es el ancho FÍSICO real del área imprimible sobre la prenda, propiedad del
-- producto, no de la foto — no depende del encuadre.
--
-- Idempotente: se puede correr varias veces.

update public.garment_types
   set base_mockup_url = 'https://xnqejebfqradgudewyhc.supabase.co/storage/v1/object/public/mockups/gorra-front-v1.png',
       canvas_size      = '{"width":1246,"height":700}'::jsonb,
       print_area       = '{"x":0.388,"y":0.37,"width":0.22,"height":0.16}'::jsonb,
       print_area_width_cm = 11.0
 where slug = 'gorra';

update public.garment_types
   set base_mockup_url = 'https://xnqejebfqradgudewyhc.supabase.co/storage/v1/object/public/mockups/playera-front-v3.png',
       canvas_size      = '{"width":964,"height":900}'::jsonb,
       print_area       = '{"x":0.321,"y":0.19,"width":0.358,"height":0.30}'::jsonb,
       print_area_width_cm = 31.6
 where slug = 'playera';

-- Vistas de presentación: MISMO canvas_size que la fila front de arriba, a
-- propósito (ver comentario de 0013_garment_type_views.sql) — así
-- konva-adapter.setView() nunca recrea el stage al cambiar de vista, sólo
-- repinta la imagen.

insert into public.garment_type_views (garment_type_id, slug, name, base_mockup_url, canvas_size, sort_order)
select id, v.slug, v.name,
       'https://xnqejebfqradgudewyhc.supabase.co/storage/v1/object/public/mockups/' || v.file,
       '{"width":1246,"height":700}'::jsonb,
       v.sort_order
  from public.garment_types g
  cross join (values
    ('left',  'Lado izquierdo', 'gorra-left-v1.png',  1),
    ('right', 'Lado derecho',   'gorra-right-v1.png', 2)
  ) as v(slug, name, file, sort_order)
 where g.slug = 'gorra'
on conflict (garment_type_id, slug) do update
   set base_mockup_url = excluded.base_mockup_url,
       canvas_size     = excluded.canvas_size,
       name            = excluded.name,
       sort_order      = excluded.sort_order;

insert into public.garment_type_views (garment_type_id, slug, name, base_mockup_url, canvas_size, sort_order)
select id, 'back', 'Espalda',
       'https://xnqejebfqradgudewyhc.supabase.co/storage/v1/object/public/mockups/playera-back-v1.png',
       '{"width":964,"height":900}'::jsonb,
       1
  from public.garment_types g
 where g.slug = 'playera'
on conflict (garment_type_id, slug) do update
   set base_mockup_url = excluded.base_mockup_url,
       canvas_size     = excluded.canvas_size,
       name            = excluded.name,
       sort_order      = excluded.sort_order;
