-- Configurador /estudio/ — Row Level Security
-- Spec §5.3. Éste es el archivo donde vive la frontera de seguridad real.
--
-- Regla de lectura: RLS habilitado + SIN política = denegado para anon y
-- authenticated. service_role salta RLS por definición (atributo BYPASSRLS), así
-- que las Vercel Functions ven todo y no necesitan políticas propias.
--
-- La frontera:
--   anon (navegador)  →  SÓLO el catálogo activo. Sin precios, sin pedidos.
--   admin autenticado →  lectura de la operación + edición de precios y estados.
--   service_role      →  todo, sólo desde api/*.js.

alter table public.garment_types    enable row level security;
alter table public.garment_variants enable row level security;
alter table public.print_techniques enable row level security;
alter table public.pricing_rules    enable row level security;
alter table public.customers        enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.payment_events   enable row level security;
alter table public.email_log        enable row level security;
alter table public.admin_users      enable row level security;
alter table public.rate_limits      enable row level security;

-- ── Catálogo: lectura pública de lo activo ─────────────────────────────────
-- El canvas necesita formas, colores, técnicas y print_area ANTES de cualquier
-- interacción, y nada de eso es sensible.

create policy catalog_read_types on public.garment_types
  for select to anon, authenticated using (is_active);

-- La variante también comprueba su prenda: desactivar una prenda debe ocultar
-- sus colores, no dejarlos colgando.
create policy catalog_read_variants on public.garment_variants
  for select to anon, authenticated using (
    is_active and exists (
      select 1 from public.garment_types g
      where g.id = garment_type_id and g.is_active
    )
  );

create policy catalog_read_techs on public.print_techniques
  for select to anon, authenticated using (is_active);

-- Escritura del catálogo: sólo admin.
create policy catalog_write_types on public.garment_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy catalog_write_variants on public.garment_variants
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy catalog_write_techs on public.print_techniques
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── Precios: NINGUNA política para anon ────────────────────────────────────
-- Que el navegador no pueda leer pricing_rules es lo que hace estructuralmente
-- imposible manipular el total: el cliente nunca conoce la tabla de precios, y
-- /api/checkout re-cotiza desde aquí ignorando cualquier cifra que reciba.

create policy pricing_admin on public.pricing_rules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── Operación: sólo admin lee desde el navegador ───────────────────────────
-- El seguimiento del cliente NO pasa por aquí: va por GET /api/order-status
-- con su public_token, que responde con service_role y una vista redactada
-- (sin logo_object_path, sin mp_payment_id, sin pricing_snapshot).

create policy orders_admin_read on public.orders
  for select to authenticated using (public.is_admin());
create policy orders_admin_update on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy items_admin_read on public.order_items
  for select to authenticated using (public.is_admin());
create policy customers_admin_read on public.customers
  for select to authenticated using (public.is_admin());
create policy events_admin_read on public.payment_events
  for select to authenticated using (public.is_admin());
create policy emails_admin_read on public.email_log
  for select to authenticated using (public.is_admin());

-- Un admin sólo ve su propia fila: admin_users no es un directorio.
create policy admin_self on public.admin_users
  for select to authenticated using (user_id = auth.uid());

-- rate_limits: sin política a propósito. Sólo service_role, vía
-- rpc_rate_limit_hit(). Nadie debe poder leer ni resetear cuotas ajenas.
