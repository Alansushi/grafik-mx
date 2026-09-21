# Línea base del estudio (Fase 0d)

Consulta de sólo lectura, agregada (sin nombres, correos ni teléfonos), el **2026-09-21**
sobre el proyecto Supabase `grafik-estudio` (`xnqejebfqradgudewyhc`, us-east-1).

| Tabla | Filas | Primera | Última | Nota |
|---|---|---|---|---|
| `orders` (todas `quoted`) | 3 | 2026-09-17 16:15 UTC | 2026-09-18 23:59 UTC | Suma `total_cents` = 594 000 (**$5 940.00 MXN**) |
| `customers` | 2 | 2026-09-17 16:15 UTC | 2026-09-18 02:19 UTC | |
| `order_items` | 3 | 2026-09-17 16:15 UTC | 2026-09-18 23:59 UTC | |

## Cómo leerla

- Los 3 pedidos se cotizaron con **precios placeholder** (`priced_with_placeholder = true` en los 3),
  así que los $5 940 **no son un monto real**, sólo un piso técnico.
- No se puede saber desde la base si esos pedidos fueron pruebas propias o de clientes. La primera fila
  (2026-09-17 16:15:33) coincide al segundo con el primer registro de `/api/order-status` en los logs de
  Vercel, lo que sugiere pruebas del flujo. **Tratar la línea base como "cero uso real" salvo que se confirme lo contrario.**
- Ningún pedido pasó de `quoted`: no hay `pending_payment`, `paid` ni posteriores (Etapa B aún no existe).

## Migraciones aplicadas en la base (0001–0009)

La base tiene `0005_seed_catalog_placeholder`; en el repo ese seed vive en `supabase/seed/` y por eso el
repo no tiene `0005` en `supabase/migrations/`. El siguiente número libre en ambos lados es **0010**.
