-- 0015_orders_sin_precio.sql
--
-- Etapa A sale SIN precios: el pedido llega por WhatsApp y se cotiza a mano.
-- api/submit-quote ya no recotiza, así que las columnas de dinero pasan a ser
-- opcionales (los pedidos viejos conservan sus cifras; los nuevos van en NULL).
-- pricing_rules y su RLS no se tocan: son de la Etapa B.

alter table public.orders
  alter column total_cents drop not null;

alter table public.order_items
  alter column unit_price_cents drop not null,
  alter column subtotal_cents  drop not null,
  alter column pricing_snapshot drop not null;
