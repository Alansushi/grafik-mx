-- Pulsera usa un render propio. La técnica se acuerda al cotizarla.
alter table public.garment_types
  add column render_type text not null default 'garment'
  check (render_type in ('garment', 'bracelet'));

-- El ancho físico de la pulsera depende del material que se confirme al cotizar.
-- Conservar el dato obligatorio y positivo para las prendas con medida conocida.
alter table public.garment_types
  alter column print_area_width_cm drop not null;
alter table public.garment_types
  drop constraint garment_types_print_area_width_cm_check;
alter table public.garment_types
  add constraint garment_types_print_area_width_cm_check
  check ((render_type = 'garment' and print_area_width_cm > 0)
    or (render_type = 'bracelet' and print_area_width_cm is null));

alter table public.order_items
  alter column technique_id drop not null;

-- La validación cruzada con garment_types ocurre en /api/submit-quote.

insert into public.garment_types
  (slug, name, base_mockup_url, print_area, canvas_size, allowed_sizes,
   min_qty, max_qty, sort_order, render_type, is_active)
values
  ('pulsera', 'Pulsera', 'procedural:bracelet',
   '{"x":0.12,"y":0.20,"width":0.76,"height":0.17}'::jsonb,
   '{"width":1000,"height":720}'::jsonb, '{U}', 100, 100000, 3,
   'bracelet', true)
on conflict (slug) do update set
  name = excluded.name, base_mockup_url = excluded.base_mockup_url,
  print_area = excluded.print_area, canvas_size = excluded.canvas_size,
  allowed_sizes = excluded.allowed_sizes, min_qty = excluded.min_qty, render_type = excluded.render_type,
  is_active = true;

insert into public.garment_variants (garment_type_id, color_hex, color_name, sort_order)
select g.id, v.color_hex, v.color_name, v.sort_order
from public.garment_types g
cross join (values
  ('#D72E50', 'Rojo', 1), ('#ED762C', 'Naranja', 2),
  ('#F2D325', 'Amarillo', 3), ('#2675D0', 'Azul', 4),
  ('#8EDD62', 'Verde lima', 5), ('#D64AAD', 'Rosa', 6),
  ('#4D9871', 'Verde oscuro', 7)
) as v(color_hex, color_name, sort_order)
where g.slug = 'pulsera'
on conflict (garment_type_id, color_hex) do nothing;
