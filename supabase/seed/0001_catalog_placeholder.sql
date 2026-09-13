-- Configurador /estudio/ — catálogo inicial
--
-- ⚠️  TODOS LOS PRECIOS DE ESTE ARCHIVO SON PLACEHOLDER. No salieron de la
--     operación real de Grafik: son cifras plausibles para poder construir y
--     probar el motor de precios. Por eso cada pricing_rule entra con
--     is_placeholder = true, y assertChargeable() (estudio/lib/pricing.js)
--     BLOQUEA el cobro mientras el access token de Mercado Pago sea de
--     producción. Reemplazarlos es un UPDATE, sin tocar código:
--
--       update public.pricing_rules
--          set tiers = '[...]'::jsonb,
--              technique_surcharge_cents = ...,
--              is_placeholder = false,
--              updated_at = now()
--        where garment_type_id = (select id from public.garment_types where slug = 'playera')
--          and technique_id    = (select id from public.print_techniques where slug = 'dtf');
--
-- Idempotente: se puede correr varias veces sin duplicar.

-- ── Prendas ────────────────────────────────────────────────────────────────
-- base_mockup_url usa el pseudo-esquema 'procedural:' mientras no existan las
-- fotos reales en escala de grises. Cambiar a la foto definitiva es un UPDATE
-- de esta columna (spec §3.4), cero código.
--
-- print_area va en FRACCIONES del canvas (0..1), así que sigue siendo válida
-- cuando el mockup procedural se reemplace por una foto de otra resolución.

insert into public.garment_types
  (slug, name, base_mockup_url, print_area, allowed_sizes, min_qty, max_qty, sort_order)
values
  ('playera', 'Playera cuello redondo', 'procedural:tee',
   '{"x":0.30,"y":0.26,"width":0.40,"height":0.34}'::jsonb,
   '{S,M,L,XL,XXL}', 12, 1000, 1),
  ('gorra', 'Gorra', 'procedural:cap',
   '{"x":0.32,"y":0.38,"width":0.36,"height":0.20}'::jsonb,
   -- La gorra es talla única ajustable: no tiene desglose real, pero el motor
   -- de tallas necesita al menos una talla válida.
   '{U}', 12, 1000, 2)
on conflict (slug) do nothing;

-- ── Colores ────────────────────────────────────────────────────────────────
-- Hex en MAYÚSCULAS: lo exige el check de garment_variants, para que no entren
-- dos formas del mismo color que el unique no detectaría.
-- Son colores de prenda en blanco, NO la paleta de marca de Grafik.

insert into public.garment_variants (garment_type_id, color_hex, color_name, sort_order)
select g.id, v.color_hex, v.color_name, v.sort_order
from public.garment_types g
cross join (values
  ('#FFFFFF', 'Blanco',        1),
  ('#0C0C0C', 'Negro',         2),
  ('#9A9A9A', 'Gris Oxford',   3),
  ('#C1272D', 'Rojo',          4),
  ('#1B2A4A', 'Azul Marino',   5),
  ('#1F4FA3', 'Azul Rey',      6),
  ('#1E6B3A', 'Verde Bandera', 7),
  ('#F2C200', 'Amarillo',      8)
) as v(color_hex, color_name, sort_order)
where g.slug = 'playera'
on conflict (garment_type_id, color_hex) do nothing;

insert into public.garment_variants (garment_type_id, color_hex, color_name, sort_order)
select g.id, v.color_hex, v.color_name, v.sort_order
from public.garment_types g
cross join (values
  ('#0C0C0C', 'Negro',       1),
  ('#FFFFFF', 'Blanco',      2),
  ('#1B2A4A', 'Azul Marino', 3),
  ('#C1272D', 'Rojo',        4),
  ('#9A9A9A', 'Gris Oxford', 5),
  ('#C3B091', 'Caqui',       6)
) as v(color_hex, color_name, sort_order)
where g.slug = 'gorra'
on conflict (garment_type_id, color_hex) do nothing;

-- ── Técnicas ───────────────────────────────────────────────────────────────

insert into public.print_techniques (slug, name, notes, sort_order)
values
  ('dtf', 'DTF',
   'Transferencia directa de película. Full color, buen detalle, sin mínimo de tintas.', 1),
  ('bordado', 'Bordado',
   'Acabado en hilo. La vista previa es referencial — la textura real del bordado no se puede replicar en una imagen plana.', 2),
  ('sublimacion', 'Sublimación',
   'Sólo sobre tela clara con alto contenido de poliéster. El color de la prenda condiciona el resultado.', 3)
on conflict (slug) do nothing;

-- ── Precios PLACEHOLDER ────────────────────────────────────────────────────
-- Tramos: 1-11 · 12-49 · 50-99 · 100+. Cumplen validateTiers(): empiezan en 1,
-- sin huecos, sin solapes, y el último abierto (max_qty null).

insert into public.pricing_rules
  (garment_type_id, technique_id, tiers, technique_surcharge_cents, size_surcharges_cents, is_placeholder)
select
  g.id,
  t.id,
  p.tiers::jsonb,
  p.surcharge,
  p.size_surcharges::jsonb,
  true
from public.garment_types g
join public.print_techniques t on true
join (values
  -- prenda     técnica         tramos (unit_price_cents)                                                                                  recargo  recargo por talla
  ('playera',   'dtf',          '[{"min_qty":1,"max_qty":11,"unit_price_cents":18000},{"min_qty":12,"max_qty":49,"unit_price_cents":15000},{"min_qty":50,"max_qty":99,"unit_price_cents":13000},{"min_qty":100,"max_qty":null,"unit_price_cents":11500}]',    0, '{"XXL":1500}'),
  ('playera',   'bordado',      '[{"min_qty":1,"max_qty":11,"unit_price_cents":22000},{"min_qty":12,"max_qty":49,"unit_price_cents":19000},{"min_qty":50,"max_qty":99,"unit_price_cents":17000},{"min_qty":100,"max_qty":null,"unit_price_cents":15500}]', 3000, '{"XXL":1500}'),
  ('playera',   'sublimacion',  '[{"min_qty":1,"max_qty":11,"unit_price_cents":20000},{"min_qty":12,"max_qty":49,"unit_price_cents":17000},{"min_qty":50,"max_qty":99,"unit_price_cents":15000},{"min_qty":100,"max_qty":null,"unit_price_cents":13500}]', 1500, '{"XXL":1500}'),
  ('gorra',     'dtf',          '[{"min_qty":1,"max_qty":11,"unit_price_cents":16000},{"min_qty":12,"max_qty":49,"unit_price_cents":14000},{"min_qty":50,"max_qty":99,"unit_price_cents":12500},{"min_qty":100,"max_qty":null,"unit_price_cents":11000}]',    0, '{}'),
  ('gorra',     'bordado',      '[{"min_qty":1,"max_qty":11,"unit_price_cents":21000},{"min_qty":12,"max_qty":49,"unit_price_cents":18500},{"min_qty":50,"max_qty":99,"unit_price_cents":16500},{"min_qty":100,"max_qty":null,"unit_price_cents":15000}]', 3500, '{}'),
  ('gorra',     'sublimacion',  '[{"min_qty":1,"max_qty":11,"unit_price_cents":19000},{"min_qty":12,"max_qty":49,"unit_price_cents":16500},{"min_qty":50,"max_qty":99,"unit_price_cents":14500},{"min_qty":100,"max_qty":null,"unit_price_cents":13000}]', 1500, '{}')
) as p(garment_slug, technique_slug, tiers, surcharge, size_surcharges)
  on p.garment_slug = g.slug and p.technique_slug = t.slug
on conflict (garment_type_id, technique_id) do nothing;
