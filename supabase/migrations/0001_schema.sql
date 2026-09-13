-- Configurador /estudio/ — esquema base
-- Spec: docs/superpowers/specs/2026-09-11-configurador-estudio-design.md §5.1
--
-- Convención transversal: TODO el dinero es un entero de centavos (columnas
-- *_cents). Ninguna columna de dinero es numeric ni float — el motor de precios
-- (estudio/lib/pricing.js) sólo suma y multiplica enteros, y la base refleja esa
-- misma garantía.

create extension if not exists pgcrypto;

-- ── Catálogo ────────────────────────────────────────────────────────────────
-- Es lo único que el navegador lee con la anon key. No contiene precios.

create table public.garment_types (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  -- 'procedural:tee' / 'procedural:cap' mientras no existan las fotos reales.
  -- Cambiar a la foto definitiva es un UPDATE aquí, cero código (spec §3.4).
  base_mockup_url text not null,
  -- Área imprimible en FRACCIONES del canvas (0..1), no en píxeles: así sigue
  -- siendo válida cuando se reemplace el mockup procedural por una foto de
  -- otra resolución.
  print_area      jsonb not null,
  canvas_size     jsonb not null default '{"width":900,"height":900}'::jsonb,
  allowed_sizes   text[] not null default '{S,M,L,XL,XXL}',
  min_qty         int  not null default 12 check (min_qty > 0),
  max_qty         int  not null default 1000 check (max_qty >= min_qty),
  sort_order      int  not null default 0,
  is_active       bool not null default true,
  created_at      timestamptz not null default now()
);

comment on column public.garment_types.print_area is
  'Fracciones del canvas 0..1: {"x":0.30,"y":0.26,"width":0.40,"height":0.34}';

create table public.garment_variants (
  id              uuid primary key default gen_random_uuid(),
  garment_type_id uuid not null references public.garment_types(id) on delete cascade,
  -- Mayúsculas obligatorias: estudio/lib/color.js rgbToHex() siempre emite
  -- '#RRGGBB' en mayúsculas, y el check evita que entren dos formas del mismo
  -- color que el unique de abajo no detectaría.
  color_hex       text not null check (color_hex ~ '^#[0-9A-F]{6}$'),
  color_name      text not null,
  sort_order      int  not null default 0,
  is_active       bool not null default true,
  unique (garment_type_id, color_hex)
);

create table public.print_techniques (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  notes      text,
  sort_order int  not null default 0,
  is_active  bool not null default true
);

-- ── Precios ─────────────────────────────────────────────────────────────────
-- NUNCA visible con la anon key (ver 0003_rls.sql). El navegador conoce precios
-- sólo a través de POST /api/quote, que calcula con service_role.

create table public.pricing_rules (
  id                        uuid primary key default gen_random_uuid(),
  garment_type_id           uuid not null references public.garment_types(id) on delete cascade,
  technique_id              uuid not null references public.print_techniques(id) on delete cascade,
  -- [{min_qty, max_qty|null, unit_price_cents}] — validado por
  -- estudio/lib/pricing.js validateTiers(): sin huecos, sin solapes, empieza
  -- en 1 y termina en un tramo abierto.
  tiers                     jsonb not null,
  technique_surcharge_cents int  not null default 0 check (technique_surcharge_cents >= 0),
  size_surcharges_cents     jsonb not null default '{}'::jsonb,
  currency                  text not null default 'MXN',
  -- El candado: con is_placeholder=true, assertChargeable() sólo deja cobrar si
  -- el access token de Mercado Pago empieza con 'TEST-'. No existe ningún flag
  -- que lo desactive (spec §2.6).
  is_placeholder            bool not null default true,
  updated_at                timestamptz not null default now(),
  unique (garment_type_id, technique_id)
);

-- ── Clientes y pedidos ──────────────────────────────────────────────────────

create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  name       text not null,
  phone      text,
  created_at timestamptz not null default now()
);

-- Guest checkout: el correo identifica al cliente, sin cuenta ni contraseña.
create unique index customers_email_lower on public.customers (lower(email));

-- 'quoted' es Etapa A: pedido enviado por WhatsApp que todavía no se paga.
-- En Etapa B, el botón de pagar hace quoted → pending_payment.
create type public.order_status as enum (
  'draft','quoted','pending_payment','paid','payment_failed',
  'in_production','ready','delivered','cancelled','refunded','expired'
);

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  -- uuid v4 (122 bits): la credencial con la que el cliente consulta su pedido
  -- en /estudio/pedido/?t=... sin necesitar cuenta. No enumerable.
  public_token      uuid not null default gen_random_uuid(),
  -- El default se asigna abajo, después de crear gen_short_code(): la función
  -- consulta esta misma tabla, así que no puede definirse antes que ella.
  short_code        text not null,
  customer_id       uuid not null references public.customers(id),
  status            public.order_status not null default 'draft',
  currency          text not null default 'MXN',
  total_cents       int  not null check (total_cents >= 0),
  -- Se congela al crear el pedido: deja rastro de si se cotizó con precios
  -- placeholder, aunque después se corrijan las pricing_rules.
  priced_with_placeholder bool not null default false,
  mp_preference_id  text,
  mp_payment_id     text,
  mp_payment_status text,
  notes             text,
  paid_at           timestamptz,
  expires_at        timestamptz not null default (now() + interval '24 hours'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index orders_public_token   on public.orders (public_token);
create unique index orders_short_code     on public.orders (short_code);
create index        orders_status_created on public.orders (status, created_at desc);
-- Parcial: un pago de Mercado Pago no puede quedar asociado a dos pedidos.
create unique index orders_mp_payment_id  on public.orders (mp_payment_id)
  where mp_payment_id is not null;

-- Código legible para humanos ('GK-4F2A9C'). Reintenta ante colisión en vez de
-- dejar que el unique reviente un pedido real: el espacio es de 16M y una
-- colisión es improbable, pero improbable no es imposible y manejarla aquí
-- cuesta tres líneas.
--
-- Va DESPUÉS de la tabla porque la consulta, y el default se asigna con ALTER.
create or replace function public.gen_short_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  v_code text;
begin
  loop
    v_code := 'GK-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.orders where short_code = v_code);
  end loop;
  return v_code;
end $$;

alter table public.orders alter column short_code set default public.gen_short_code();

create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  item_index          int  not null,
  garment_type_id     uuid not null references public.garment_types(id),
  garment_variant_id  uuid not null references public.garment_variants(id),
  technique_id        uuid not null references public.print_techniques(id),
  size_breakdown      jsonb not null,
  qty                 int  not null check (qty > 0),
  -- El archivo que se manda a producción es este, el original del cliente.
  logo_object_path    text not null,
  -- El render del canvas que el cliente aprobó. Es referencia visual, no
  -- insumo de impresión (spec §7).
  preview_object_path text not null,
  logo_transform      jsonb not null,
  unit_price_cents    int  not null check (unit_price_cents >= 0),
  subtotal_cents      int  not null check (subtotal_cents >= 0),
  -- El Quote entero congelado: si mañana cambian las pricing_rules, este
  -- pedido conserva con qué precio se cerró.
  pricing_snapshot    jsonb not null,
  created_at          timestamptz not null default now(),
  unique (order_id, item_index)
);

-- ── Operación ───────────────────────────────────────────────────────────────

create table public.payment_events (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null default 'mercadopago',
  payment_id     text not null,
  payment_status text not null,
  order_id       uuid references public.orders(id) on delete set null,
  source         text not null check (source in ('webhook','reconcile','admin')),
  raw            jsonb not null,
  skip_reason    text,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz,
  -- LA CERRADURA de idempotencia (spec §4.2). El webhook y la página de
  -- retorno compiten por este INSERT; gana uno y el otro sale por DUPLICATE.
  -- payment_status forma parte de la clave a propósito: un cambio legítimo
  -- (pending → approved) SÍ debe procesarse, un reintento del mismo estado no.
  constraint payment_events_idem unique (provider, payment_id, payment_status)
);

create table public.email_log (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid references public.orders(id) on delete cascade,
  kind          text not null,
  to_email      text not null,
  provider_id   text,
  ok            bool not null,
  -- Truncado a 500 chars por el llamador, y jamás la API key (spec §7.8).
  error_snippet text,
  created_at    timestamptz not null default now()
);

-- Segunda red contra correos duplicados, independiente de payment_events:
-- un envío EXITOSO de cada tipo por pedido. Los fallidos sí pueden repetirse,
-- que es justo lo que permite reintentar desde el panel.
create unique index email_log_once on public.email_log (order_id, kind) where ok = true;

create table public.admin_users (
  user_id    uuid primary key,  -- = auth.users.id
  email      text not null,
  created_at timestamptz not null default now()
);

-- Rate limiting en Postgres, NO en memoria: en serverless cada instancia
-- tendría su propio Map y el límite real sería N veces el configurado.
create table public.rate_limits (
  bucket       text primary key,
  hits         int  not null default 0,
  window_start timestamptz not null default now()
);

-- updated_at automático en orders
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();
