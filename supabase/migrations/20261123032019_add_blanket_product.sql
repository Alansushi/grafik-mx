-- Frazadas de impresión completa. Una variante de tela, tres medidas por pedido.
alter table public.garment_types
  drop constraint garment_types_render_type_check;
alter table public.garment_types
  add constraint garment_types_render_type_check
  check (render_type in ('garment', 'bracelet', 'blanket'));

alter table public.garment_types
  drop constraint garment_types_print_area_width_cm_check;
alter table public.garment_types
  add constraint garment_types_print_area_width_cm_check
  check ((render_type = 'garment' and print_area_width_cm > 0)
    or (render_type in ('bracelet', 'blanket') and print_area_width_cm is null));

insert into public.garment_types
  (slug, name, base_mockup_url, print_area, canvas_size, print_area_width_cm,
   allowed_sizes, min_qty, max_qty, sort_order, render_type, is_active)
values
  ('frazada', 'Frazada personalizada', '/assets/estudio/frazada-personal.png',
   '{"x":0,"y":0,"width":1,"height":1}'::jsonb,
   '{"width":600,"height":900}'::jsonb, null,
   '{P,I,M}', 1, 1000, 4, 'blanket', true)
on conflict (slug) do update set
  name = excluded.name, base_mockup_url = excluded.base_mockup_url,
  print_area = excluded.print_area, canvas_size = excluded.canvas_size,
  print_area_width_cm = excluded.print_area_width_cm,
  allowed_sizes = excluded.allowed_sizes, min_qty = excluded.min_qty,
  max_qty = excluded.max_qty, sort_order = excluded.sort_order,
  render_type = excluded.render_type, is_active = true;

insert into public.garment_variants (garment_type_id, color_hex, color_name, sort_order)
select id, '#D6D5D1', 'Felpa gris claro', 1
from public.garment_types where slug = 'frazada'
on conflict (garment_type_id, color_hex) do nothing;
