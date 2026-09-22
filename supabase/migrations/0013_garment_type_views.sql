-- Vistas NO-front de una prenda (perfil izquierdo/derecho de la gorra, espalda
-- de la playera): presentación/rotación, NUNCA imprimibles.
--
-- Por qué tabla aparte y no columnas en garment_types: garment_types.print_area
-- / print_area_width_cm / base_mockup_url YA representan la vista "front"
-- (spec §3.4, migraciones 0008/0009) y esa fila es la que entra a order_items
-- vía garment_type_id — cero ambigüedad de "¿cuál área se imprime?". Una vista
-- no-front es 0..N por prenda (la gorra trae left+right, la playera sólo
-- back, una prenda futura podría no traer ninguna), así que es una relación
-- 1:N, igual que garment_variants cuelga de garment_types (0001_schema.sql).
--
-- Sin print_area ni print_area_width_cm A PROPÓSITO: estas vistas no tienen
-- Transformer, no tienen logo, no entran a order_items. Si algún día una
-- vista lateral se vuelve imprimible, la migración que lo permita debe AÑADIR
-- esas columnas explícitamente (con el mismo candado NOT NULL de 0009), no
-- heredarlas vacías de aquí.
--
-- RLS/GRANT calcados de garment_variants (0001_schema.sql + 0003_rls.sql):
-- lectura pública sólo si la vista Y su prenda dueña están activas, escritura
-- sólo admin. anon no alcanza la tabla en absoluto sin el GRANT explícito
-- (revoke all on all tables... de 0003_rls.sql ya dejó a anon en cero).
--
-- Idempotente: create table if not exists + policies con drop previo.

create table if not exists public.garment_type_views (
  id              uuid primary key default gen_random_uuid(),
  garment_type_id uuid not null references public.garment_types(id) on delete cascade,
  -- 'left' | 'right' | 'back'. No es un enum: una prenda futura podría traer
  -- '3-4-izquierdo' o lo que sea, y un check constraint cerrado se volvería a
  -- tocar en cada prenda nueva. El slug sólo necesita ser único por prenda.
  slug            text not null,
  name            text not null,
  base_mockup_url text not null,
  -- Debe compartir proporción (idealmente el MISMO valor) que el
  -- canvas_size de garment_types de la misma prenda:
  -- estudio/canvas/konva-adapter.js#setView() nunca redimensiona el Stage al
  -- cambiar de vista, sólo reemplaza la imagen de la prenda — si la
  -- proporción no coincide, la silueta sale deformada al cambiar de vista.
  -- Ver CLAUDE.md § "Mockups de prenda".
  canvas_size     jsonb not null default '{"width":900,"height":900}'::jsonb,
  sort_order      int  not null default 0,
  is_active       bool not null default true,
  created_at      timestamptz not null default now(),
  unique (garment_type_id, slug)
);

comment on table public.garment_type_views is
  'Vistas de presentación (no imprimibles) de una prenda: left/right de la gorra, back de la playera. La vista "front" vive en garment_types, no aquí.';
comment on column public.garment_type_views.canvas_size is
  'Debe compartir proporción (idealmente el mismo valor) que garment_types.canvas_size de la misma prenda: evita que la prenda salte de tamaño al cambiar de vista.';

alter table public.garment_type_views enable row level security;

drop policy if exists catalog_read_views  on public.garment_type_views;
drop policy if exists catalog_write_views on public.garment_type_views;

-- Misma comprobación que catalog_read_variants: si la prenda dueña se
-- desactiva, sus vistas quedan ocultas con ella, no colgando.
create policy catalog_read_views on public.garment_type_views
  for select to anon, authenticated using (
    is_active and exists (
      select 1 from public.garment_types g
      where g.id = garment_type_id and g.is_active
    )
  );

create policy catalog_write_views on public.garment_type_views
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.garment_type_views to anon, authenticated;
grant insert, update, delete on public.garment_type_views to authenticated;
