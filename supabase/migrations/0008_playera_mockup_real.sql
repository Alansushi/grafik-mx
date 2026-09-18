-- La playera deja el mockup procedural y pasa a una foto real.
--
-- Va como migración y no como UPDATE suelto porque el catálogo es dato de
-- arranque: sin esto, reconstruir el proyecto desde cero dejaría la playera en
-- 'procedural:tee' aunque la foto siga publicada en el bucket `mockups`, y la
-- diferencia entre entornos sólo se notaría mirando el render.
--
-- Las tres columnas se mueven JUNTAS a propósito:
--
--   base_mockup_url  Nombre versionado (-v2). El bucket sirve
--                    Cache-Control: immutable, así que reusar el nombre
--                    anterior habría seguido entregando la imagen vieja.
--
--   canvas_size      paintGarment hace drawImage estirando al canvas. La foto
--                    es 1401x1320 (proporción 1.061); con el 900x900 por
--                    omisión la playera saldría aplastada. No se usa la
--                    resolución nativa porque teñir es O(n log n) sobre
--                    canvas_size y se paga en CADA clic de color: medido, 51 ms
--                    a 955x900 contra 129 ms a 1401x1320.
--
--   print_area       Estaba calibrada a la silueta procedural, donde el pecho
--                    cae en otro sitio. Con la foto real, el valor heredado
--                    dejaba el logo a la altura del ESTÓMAGO.
--
-- Cómo se obtuvo print_area (fracciones 0..1 del canvas), midiendo sobre la
-- silueta en vez de a ojo:
--
--   · Escala: el torso mide 0.5332 de ancho y una playera M de adulto mide
--     ~51 cm plana → 1 fracción de alto = 90.1 cm.
--   · Cuello (borde inferior del escote): v = 0.105.
--   · Borde superior de la estampa = 7.2 cm bajo el cuello → v = 0.185, que es
--     la regla habitual de "3 pulgadas bajo el cuello".
--   · Área resultante: 31.6 cm de ancho x 27.9 cm de alto, centrada en el eje
--     del torso (u = 0.509), no en el centro del lienzo.
--
-- Idempotente: se puede correr varias veces.

update public.garment_types
   set base_mockup_url = 'https://xnqejebfqradgudewyhc.supabase.co/storage/v1/object/public/mockups/playera-base-v2.png',
       canvas_size     = '{"width":955,"height":900}'::jsonb,
       print_area      = '{"x":0.344,"y":0.185,"width":0.330,"height":0.310}'::jsonb
 where slug = 'playera';

-- La gorra se queda en 'procedural:cap': en stock libre no hay gorras lisas
-- sobre fondo plano (la búsqueda devuelve tapas de botella, gorras con logo
-- ajeno o gente usándolas). Para cambiarla, la mejor fuente es una foto de
-- inventario propio pasada por tools/mockup-cutout.swift.
