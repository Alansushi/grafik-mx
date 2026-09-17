# Configurador `/estudio/` — plan de continuación (Etapa A: llegar a algo mostrable)

## Context

`grafik.mx` vende hoy por WhatsApp: el cliente manda su logo, el equipo cotiza a mano y muestra fotos de referencia genéricas — no su producto, uno parecido. La apuesta es que **quitar la incertidumbre visual acelera el cierre**: si el cliente ve su logo puesto sobre la prenda exacta, en el color exacto, se compromete con un pedido de 50 o 200 piezas sin ida y vuelta.

La sesión anterior construyó y verificó los incrementos 0–4 (toda la lógica pura). Este plan cubre **lo que falta**, reordenado para que puedas ejecutarlo en sesiones cortas y **tener algo enseñable a clientes reales lo antes posible**, en vez de esperar al sistema completo.

**Cambio de alcance respecto al plan original:** se corta en el incremento 8b. Ahí el configurador ya es un embudo completo que termina en un pedido por WhatsApp con link al preview — suficiente para validar la hipótesis de negocio. El cobro con Mercado Pago, los correos y el panel admin pasan a **Etapa B**, después de validar. Nada de lo construido en Etapa A se tira: Etapa B se monta encima.

---

## Estado actual (verificado, no asumido)

Rama `feat/configurador-estudio`, 5 commits, pusheada. `main` intacta.

| | Estado |
|---|---|
| Incrementos 0–4 | ✅ Completos |
| Tests | **154 verdes** en 6 archivos (`npm test`, ~140 ms) |
| `index.html`, `styles.css`, `assets/` | Intactos — verificado con `git diff` en cada commit |
| Deploy preview | ✅ Validado: `.vercelignore` removió los 12 archivos correctos, build no-op de 70 ms |
| Ruta del proyecto | ⚠️ Cambió a mitad de sesión (iCloud): `/Users/aguerrerogar/Documents/Documentos - MacBook Air de Alan/proyectos desarrollo propio/Grafik` |

**Ya existe y funciona** (`estudio/lib/`, todo lógica pura sin DOM ni red):
`errors` · `format` · `color` · `geometry` · `compose` · `sizes` · `pricing` · `order-draft`

**Falta crear por completo:** `estudio/canvas/`, `estudio/ui/`, `api/`, `supabase/`, `tests/e2e/`, `tests/fixtures/`.

### Defectos ya encontrados y corregidos (para no reintroducirlos)

Tres de ellos eran del **spec**, no de la implementación — vale la pena recordarlo porque el spec sigue siendo el contrato:

1. `totalUnits` concatenaba strings en vez de sumar. Un `<input type="number">` devuelve strings, así que era el camino por defecto: 12 piezas se cotizaban como 57 y cobraban $1,396.50 en vez de $359.88. Ahora lanza `NON_NUMERIC_QTY`.
2. `validateTiers([])` devolvía `valid: true` — el admin habría guardado una regla de precio incobrable.
3. `assertChargeable` dejaba cobrar carrito vacío o total $0.
4. `normalizeFoldMapPixels` usaba desplazamiento aditivo contra la media, que aplanaba los pliegues. Ahora es multiplicativo contra el nivel de tela plana (percentil 0.9).
5. `buildOrderDraft` descartaba `preview_path`, que es `NOT NULL` en el esquema.

---

## Cómo retomar una sesión

Al abrir una sesión nueva, en este orden:

1. `cd "/Users/aguerrerogar/Documents/Documentos - MacBook Air de Alan/proyectos desarrollo propio/Grafik"`
2. `git checkout feat/configurador-estudio && git pull && npm test` → deben salir 154+ verdes.
3. Leer **el encabezado** de `docs/superpowers/specs/2026-09-11-configurador-estudio-design.md` (protocolo TDD, convenciones, prohibiciones) y la sección del incremento que toca.
4. Leer la sección `/estudio/` de `CLAUDE.md` — los 8 guardarraíles.
5. Arrancar el incremento que sigue según la tabla de abajo.

**El spec es el contrato.** Sus tablas numeradas de casos de prueba son lo que se implementa, caso por caso. Si una fila del spec parece equivocada, **decirlo y corregir el spec** — no ajustar el test para que pase.

---

## Etapa A — el configurador mostrable (incrementos 5 → 8b)

Una sesión por fila. Cada una termina en un commit con criterio observable.

| Sesión | Incremento | Qué entrega | Criterio de "hecho" |
|---|---|---|---|
| **1** | **5** — Supabase | Migraciones `0001_schema`, `0002_functions`, `0003_rls`, `0004_storage` + seed del catálogo | `garment_types` con anon key → 2 filas. `pricing_rules` con anon key → `[]`; con service_role → 6 filas `is_placeholder=true` |
| **2** | **6** — API base | `api/_lib/{env,log,http,validation,supabase,storage-paths}.js` + `api/catalog.js` + `api/upload-url.js` + `api/quote.js` | `PUT` del PNG de fixture a la URL firmada → 200. `POST /api/quote` devuelve el total; el catálogo **nunca** expone precios |
| **3** | **7** — Motor de canvas | `estudio/index.html`, `boot.js`, `studio.css`, `canvas/{image-loader,mockup,garment-painter,konva-adapter,snapshot}.js` | Playera gris teñida de rojo Grafik. Píxel muestreado coincide con `blendColorPixel` ±3 por canal, **en Chromium y WebKit** |
| **4** | **8** — UI del configurador | `estudio/ui/*`: subida de logo, Transformer, clamping, tallas, resumen con precio del servidor | Flujo hasta ver precio. Arrastrar 400 px fuera del área → el AABB rotado sigue contenido. Consola limpia. **▸ Puerta de revisión** |
| **5** | **8b** — Cierre del embudo | `api/submit-quote.js`, `estudio/pedido/index.html`, mensaje de WhatsApp con link al preview | **Entregable:** un cliente entra a la liga, sube su logo, lo coloca, elige tallas, ve el precio y te manda el pedido por WhatsApp con un link donde ves su preview |

### Ajustes al spec que hay que hacer en la sesión 1

Cortar en 8b cambia dos cosas del esquema. **Hacerlas en el incremento 5, antes de escribir las migraciones**, no después:

1. **Añadir el estado `quoted` al enum `order_status`**, entre `draft` y `pending_payment`. Es un pedido enviado por WhatsApp que todavía no se paga. Transiciones: `draft → quoted → pending_payment → paid → …`, y `quoted → cancelled|expired`. En Etapa B, el botón de pagar hace `quoted → pending_payment`. Sin esto, Etapa A no tiene dónde guardar un pedido.
2. **`api/quote.js` se mueve del incremento 9 al 6.** El incremento 8 muestra el precio, y el precio *nunca* puede salir con anon key — `pricing_rules` no tiene política RLS para `anon`. Así que el endpoint de cotización tiene que existir antes que la UI que lo consume.

### Cómo cierra el embudo en 8b (la parte que no estaba diseñada)

El problema: `wa.me` no puede llevar una imagen adjunta. La solución reusa maquinaria que Etapa B necesita igual, así que no es trabajo desechable:

1. El cliente termina de configurar → `POST /api/submit-quote` con el draft (sólo *paths*, nunca precios).
2. El servidor **re-cotiza desde la base** ignorando cualquier cifra del cliente, crea `customers` + `orders` (status `quoted`, con `public_token` uuid v4 y `short_code` tipo `GK-4F2A9C`) + `order_items`, y devuelve `{short_code, public_token}`.
3. El navegador abre `wa.me/525539014600?text=…` con el resumen (prenda, color, técnica, desglose de tallas, total y el `short_code`) más la liga `https://grafik.mx/estudio/pedido/?t=<public_token>`.
4. Tú abres esa liga y ves el preview renderizado, el logo original y el desglose. La página lo sirve con una **URL firmada emitida por el servidor** — los buckets `logos` y `previews` siguen siendo privados.

---

## Etapa B — cobro y operación (después de validar con clientes)

No se empieza hasta que Etapa A haya estado frente a clientes reales. Incrementos **9 a 13** del plan original, con `api/quote.js` ya hecho:

**9** MP: `mp-preference`, `mp-client`, `api/checkout.js` (`quoted → pending_payment`) · **10** Idempotencia: `mp-signature`, `order-state`, `settle`, `webhook-mp`, `reconcile` ▸ puerta más estricta · **11** Correos con Resend + snapshot adjunto · **12** Panel admin con Supabase Auth ▸ puerta · **13** Endurecimiento: rate limits, reenvío, reconciliación manual, editor de precios.

El diseño completo de estos cinco —máquina de estados, idempotencia por `UNIQUE (provider, payment_id, payment_status)`, los cinco defectos del proyecto de la Dra. Ana que no se replican— ya está escrito en el spec, secciones §4 y §2.8–2.11. No hay que rediseñarlo.

---

## Puertas de revisión

Decidido: **un subagente por puerta**, `pr-review-toolkit:silent-failure-hunter` — fue el ángulo más valioso en este dominio. Tras el incremento **8** en Etapa A; tras el **10** y el **12** en Etapa B.

Si el subagente muere por límite de sesión, **hacer la revisión directamente** en vez de saltarla. Así se hizo la puerta 1–4 y encontró los tres fallos de cobro: leer el diff, escribir un script de auditoría en el scratchpad que ejecute los caminos sospechosos, y verificar las afirmaciones corriendo código en vez de creerle al reporte.

---

## Setup y bloqueos

**Un paso de setup pendiente:** `npx playwright install webkit`. Hay chromium y firefox, pero falta webkit, y `playwright.config.js` lo necesita para el proyecto `canvas-webkit`. Safari es donde los blend modes se portan distinto — no es opcional. Hacerlo antes de la sesión 3.

| Bloquea | Qué | Estado |
|---|---|---|
| Incremento **5** | OAuth del MCP de Supabase (`mcp__plugin_supabase_supabase__authenticate` → te paso la URL, la abres en el navegador) | ✅ Lo tendrás |
| Incremento **9** (Etapa B) | `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` de prueba | ✅ Lo tendrás |
| Incremento **11** (Etapa B) | Cuenta de Resend (arranca con `onboarding@resend.dev`) | ✅ Lo tendrás |
| **Cobrar de verdad** | Tabla de precios real por técnica y tier + mínimo de pedido | ⏳ Pendiente — el candado mantiene el cobro bloqueado con token `APP_USR-`, así que no hay riesgo de cobrar mal mientras tanto |
| Calidad del preview | Las 2 fotos base en escala de grises (PNG, +2000 px) | ⏳ Pendiente — Etapa A corre con mockup procedural; cambiar es un `UPDATE` a `base_mockup_url`, cero código |

**Decisión pendiente, sólo para Etapa B:** la Deployment Protection de Vercel hace que *todas* las rutas del preview devuelvan 302 al SSO, así que Mercado Pago no podrá entregar el webhook ahí. Recomendación: `vercel dev` + un túnel, apuntando `MP_WEBHOOK_URL`. Las cuatro opciones están en el spec §7.10. **No afecta a Etapa A.**

---

## Verificación

**En cada sesión:**
```bash
npm test                                  # Vitest: lógica pura
npx playwright test --project=canvas      # desde la sesión 3
python3 -m http.server 8080               # el sitio actual sigue igual en /
git diff --stat HEAD -- index.html styles.css   # debe salir VACÍO, siempre
```

**Deploy preview** (la protección impide verificar con `curl`, así que se usa el build log, que es evidencia más fuerte): buscar `Found .vercelignore` seguido de `Removed N ignored files` y confirmar que `tests/`, `supabase/`, `docs/` y los `.md` están en la lista, y que el build sigue siendo un no-op de milisegundos.

**Aceptación de Etapa A — el criterio que importa:** desde un teléfono, entrar a la liga de `/estudio/`, subir un PNG con transparencia, colocarlo sobre la playera, elegir color y técnica, capturar tallas, ver el precio, y enviar el pedido por WhatsApp. Que el mensaje llegue con el resumen correcto y que la liga del preview abra y muestre exactamente lo que el cliente vio. Si eso funciona en un móvil real, Etapa A está lista para enseñarse.

---

## Notas de capacidad (aprendidas la sesión pasada)

- **Sonnet en paralelo funciona bien** cuando los módulos son independientes y escriben archivos disjuntos: los incrementos 2, 3 y 4 salieron en una sola tanda de tres agentes. Darle a cada uno la instrucción de correr **sólo su propio archivo de test**, nunca `npm test` completo, para que no vea fallos ajenos a medio escribir.
- **Tres agentes de revisión en paralelo es lo que reventó el límite.** De ahí la decisión de uno por puerta.
- Los incrementos 7 y 8 (canvas y UI) son los más pesados de Etapa A y no se paralelizan bien — conviene darles una sesión entera a cada uno.
- `vitest` queda fijado en `~4.1.11`: npm 10.8.2 revienta con los peer deps de vitest 5 (`Cannot read properties of null (reading 'edgesOut')`). No "actualizar" eso sin probar.
