# Configurador de playeras y gorras — especificación técnica (Fase 1)

**Fecha:** 2026-09-11
**Ruta:** `/estudio/` (escondida: sin enlazar, `noindex`, fuera de `sitemap.xml`)
**Origen:** `grafik-configurador-analisis-tecnico.md` — este documento es la especificación ejecutable de su Fase 1.

---

## Protocolo de trabajo — LEER ANTES DE ESCRIBIR CÓDIGO

### TDD estricto, sin excepciones

Para cada módulo, en este orden:

1. Escribe **el archivo de test completo**, con **todos** los casos de la tabla de este spec. No un subconjunto.
2. Corre `npm test` y **pega la salida en rojo** en tu respuesta.
3. Escribe la implementación **mínima** que haga pasar los tests.
4. Corre `npm test` y pega la salida en verde.
5. Refactoriza sin tocar los tests.

> **Si el paso 2 pasa en verde, el test está mal escrito. Arréglalo antes de seguir.**
>
> **Nunca ajustes un test para que pase.** Si un test falla y crees que el test está equivocado, detente y repórtalo — no lo edites. Los tests de este spec son el contrato; la implementación se dobla ante ellos, no al revés.

### Convenciones transversales

| Regla | Detalle |
|---|---|
| **Dinero** | Siempre entero en **centavos**. Ninguna función devuelve un float de dinero. `Number.isInteger` en todo total |
| **Errores** | Toda excepción es subclase de `AppError` con `.code` estable. **Los tests assertan el `code`, nunca el mensaje** |
| **Módulos** | ESM en todo (`import`/`export`). `package.json` tiene `"type": "module"` |
| **Pureza** | `estudio/lib/**` y los módulos marcados PURA en `api/_lib/**` no tocan DOM, red, reloj ni `Math.random`. El tiempo entra como parámetro (`nowMs`) para que los tests lo controlen |
| **Idioma** | Código y símbolos en inglés; mensajes de cara al usuario y comentarios en español |

### Prohibiciones estructurales

1. **No crear `public/` en la raíz.** El preset "Other" de Vercel cambiaría el output directory ahí y el sitio devolvería 404 completo.
2. **No modificar `index.html` ni `styles.css`.** El estudio importa `styles.css` sólo por sus tokens `:root`; sus propios estilos viven en `estudio/studio.css` con prefijo `.es-`.
3. **No añadir `dependencies` a `package.json`.** Sólo `devDependencies`. El runtime de producción tiene cero dependencias: Mercado Pago, Resend y Supabase se consumen con `fetch` crudo.
4. **No añadir `Content-Security-Policy`.** `babel-standalone` exige `unsafe-eval`; tocarlo puede romper `index.html`. Deuda anotada, fuera de alcance.
5. **`img.src` sólo recibe `blob:` o `data:`.** Jamás una URL remota. Ver §3.3 (cortafuegos anti-taint).

### Versiones fijas desde CDN (con SRI, `crossorigin="anonymous"`)

| Librería | Versión | URL | SRI |
|---|---|---|---|
| React | 18.2.0 | `cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js` | ya en `index.html`, reusar |
| ReactDOM | 18.2.0 | `.../react-dom/18.2.0/umd/react-dom.production.min.js` | ya en `index.html`, reusar |
| Babel standalone | 7.23.5 | `.../babel-standalone/7.23.5/babel.min.js` | ya en `index.html`, reusar |
| **Konva** | **10.3.3** | `cdnjs.cloudflare.com/ajax/libs/konva/10.3.3/konva.min.js` | `sha384-mx78e7xNAuhEWxGDQZNlR9oNI6vtKvQUNiPZcntBLQhJHcPXNI+AzxLdTSWqoUyX` |
| supabase-js | fijar al instalar | sólo en `/estudio/admin/`. El configurador público **no** lo carga | calcular con `curl -sL <url> \| openssl dgst -sha384 -binary \| openssl base64 -A` |

### Paleta de marca (tokens reales de `styles.css`)

```
--negro #0C0C0C   --carbon #181818   --carbon-mid #222222   --carbon-hi #2E2E2E
--plata-dim #666  --plata #B8B8B8    --plata-claro #E0E0E0
--rojo #D02B34    --rojo-dark #A0202A
--blanco #F0F0EE  --wa #25D366
Fuentes: Barlow Condensed (display, 900) · Barlow (body)
```

Los correos **no pueden usar CSS variables**: `api/_lib/email-templates.js` mantiene un objeto `brand` con estos valores en hex literal, y es un espejo manual de `styles.css`.

### Puertas de revisión

Tras los incrementos **4, 8, 10 y 12** se detiene la construcción y corre una revisión con subagentes (`code-reviewer`, `silent-failure-hunter`, `pr-test-analyzer`) sobre el diff. No se avanza con hallazgos abiertos. La puerta del **10** (idempotencia y pagos) es la más estricta.

---

# Arquitectura: configurador de playeras y gorras (`/estudio/`)

## 0. Hechos de plataforma verificados (condicionan todo lo demás)

| Hecho | Fuente | Consecuencia de diseño |
|---|---|---|
| Preset "Other" ⇒ output dir = `public` si existe, si no `.` (raíz) | [Configuring a Build](https://vercel.com/docs/builds/configure-a-build) | **Prohibido crear un directorio `public/`** en la raíz: rompería el sitio al instante. |
| Vercel Functions aceptan bodies de hasta **100 MB** (Fluid Compute) — el límite NO fuerza el diseño | Vercel changelog | Logo y snapshot igual **nunca** pasan por `api/*`: suben directo a Supabase Storage con URL firmada. Razones reales en §7.2 |
| `"type":"module"` en `package.json` habilita ESM en `api/*.js` | [Node.js Runtime](https://vercel.com/docs/functions/runtimes/node-js) | Un solo formato de módulo para browser, `api/` y Vitest. Cero duplicación. |
| Archivos `api/_*` no se convierten en rutas | [vercel/vercel #4983](https://github.com/vercel/vercel/discussions/4983) | `api/_lib/` es el hogar de la lógica compartida y testeable. |
| `.vercelignore` excluye del *upload*, no sólo del build | [.vercelignore](https://vercel.com/docs/deployments/vercel-ignore) | Único mecanismo para que `tests/`, `supabase/`, configs no se sirvan. |
| `globalCompositeOperation` es un atributo de nodo Konva (shape/group), se aplica **sobre el canvas de su propia Layer** | [Konva Blend Mode](https://konvajs.org/docs/styling/Blend_Mode.html) | Todo lo que mezcla debe vivir en **una sola Layer**. El Transformer va en otra. |
| `toDataURL` falla si el canvas está *tainted* | [Konva Export Image](https://konvajs.org/docs/posts/Canvas_Export_Image.html) | Regla dura: `img.src` sólo recibe `blob:` o `data:`. Nunca una URL remota. |
| Manifest MP: `id:{data.id};request-id:{x-request-id};ts:{ts};` HMAC-SHA256 | [sdk-nodejs #318](https://github.com/mercadopago/sdk-nodejs/discussions/318) | Se porta tal cual, + ventana anti-replay. |

---

## 1. Árbol de archivos

```
Grafik/
├── index.html                      ← INTACTO. No se toca ni una línea.
├── styles.css                      ← INTACTO. El estudio lo importa sólo por los tokens.
├── vercel.json                     ← MODIFICADO (§7.1). Fija build/install/output + headers /estudio.
├── package.json                    ← NUEVO. "type":"module", SOLO devDependencies, SIN script "build".
├── .vercelignore                   ← NUEVO. Lo único que impide servir tests/supabase/config.
├── .gitignore                      ← + node_modules/ test-results/ playwright-report/ .env*
├── vitest.config.js                ← environment:'node', include:['tests/unit/**/*.test.js']
├── playwright.config.js            ← 2 proyectos: "canvas" (local, hermético) y "live" (preview URL)
├── .env.example                    ← nombres de variables, sin valores
│
├── estudio/
│   ├── index.html                  Configurador. <meta robots noindex>. Carga React+Babel+Konva (SRI) + boot.js
│   ├── boot.js                     type="module": importa lib/* y canvas/*, publica window.GK, dispara 'gk:ready'
│   ├── studio.css                  Estilos del estudio. Prefijo .es- para no colisionar con styles.css
│   ├── gracias/index.html          Retorno de MP (success|failure|pending). Llama /api/reconcile
│   ├── pedido/index.html           Consulta de estado por public_token (link del correo)
│   ├── admin/
│   │   ├── index.html              Panel. Login Supabase Auth + listado/detalle. noindex
│   │   └── admin.js                Módulo ESM del panel. supabase-js desde CDN con SRI
│   │
│   ├── lib/                        ══ LÓGICA PURA. Sin DOM, sin red, sin Konva. 100% Vitest ══
│   │   ├── errors.js               Clases de error con .code — contrato de fallos
│   │   ├── format.js               formatCentsMXN, stableStringify, slugify, truncate
│   │   ├── color.js                Hex/RGB/HSL, luminancia WCAG, contraste, legibilidad
│   │   ├── geometry.js             Transform del logo, AABB rotado, clamp al print_area
│   │   ├── compose.js              Mezcla 'color' y 'multiply' de referencia (pixel math)
│   │   ├── sizes.js                Normalización y validación del desglose de tallas
│   │   ├── pricing.js              Motor de precios: tiers, recargos, quote, candado placeholder
│   │   └── order-draft.js          Construcción y validación del borrador de pedido + fingerprint
│   │
│   ├── canvas/                     ══ ADAPTADORES. Tocan DOM/Konva. Se testean con Playwright ══
│   │   ├── image-loader.js         Cortafuegos anti-taint: todo pasa por Blob
│   │   ├── mockup.js               Mockup procedural tee/cap en escala de grises
│   │   ├── garment-painter.js      Canvas 2D offscreen: base gris + tinte 'color' + fold map
│   │   ├── konva-adapter.js        ÚNICO archivo que importa Konva. Expone StudioStage
│   │   └── snapshot.js             Layer → Blob, downscale, assertNotTainted
│   │
│   ├── ui/
│   │   ├── studio-app.js           text/babel. Componente raíz + steps
│   │   ├── panel-prenda.js         Selector tipo/color/técnica
│   │   ├── panel-logo.js           Dropzone + controles de transform
│   │   ├── panel-tallas.js         Grid de tallas
│   │   └── panel-resumen.js        Quote + datos de contacto + botón pagar
│   │
│   └── assets/
│       └── .gitkeep                Aquí van las fotos base reales cuando existan
│
├── api/
│   ├── _lib/
│   │   ├── env.js                  Lectura y validación de env. Falla ruidoso, nunca silencioso
│   │   ├── log.js                  logError() truncado a 500 chars, redacta secretos
│   │   ├── http.js                 json(), readJsonBody(maxBytes), requireMethod, clientIp
│   │   ├── validation.js           isEmail, isMxPhone, isUuid, assertShape (schema mínimo)
│   │   ├── supabase.js             REST crudo. buildPostgrestUrl() es PURA y se testea
│   │   ├── storage-paths.js        PURA. Rutas de objetos, mimes y tamaños permitidos
│   │   ├── mp-preference.js        PURA. Construye el body de /checkout/preferences
│   │   ├── mp-signature.js         PURA (node:crypto). Verificación de firma + anti-replay
│   │   ├── mp-client.js            fetch a MP: crear preferencia, GET /v1/payments/{id}
│   │   ├── order-state.js          PURA. Máquina de estados + efectos secundarios
│   │   ├── settle.js               Orquestador idempotente. Compartido webhook/reconcile
│   │   ├── email-templates.js      PURA. brand, escapeHtml, renderBrandedEmail, plantillas
│   │   ├── email.js                Resend por fetch. isEmailChannelConfigured(), nunca lanza
│   │   ├── ratelimit.js            Postgres (NO Map en memoria)
│   │   └── admin-auth.js           Verifica JWT de Supabase y pertenencia a admin_users
│   │
│   ├── catalog.js                  GET  — tipos, variantes, técnicas, print_area. Cacheable
│   ├── quote.js                    POST — precio autoritativo (el cliente nunca manda precios)
│   ├── upload-url.js               POST — firma subida a Storage (logo | preview)
│   ├── checkout.js                 POST — crea order+items, pide preferencia MP, devuelve init_point
│   ├── webhook-mp.js               POST — firma + idempotencia + settle
│   ├── reconcile.js                POST — camino del navegador. Mismo settle, misma cerradura
│   ├── order-status.js             GET  — por public_token, vista redactada
│   └── admin/
│       ├── orders.js               GET   — listado y detalle
│       ├── order-status.js         PATCH — cambio de estado + correo
│       └── pricing.js              GET/PUT — editar precios y quitar is_placeholder
│
├── supabase/
│   ├── migrations/
│   │   ├── 0001_schema.sql
│   │   ├── 0002_functions.sql      is_admin(), rpc_rate_limit_hit(), rpc_settle_payment()
│   │   ├── 0003_rls.sql
│   │   └── 0004_storage.sql        buckets + políticas
│   └── seed/
│       └── 0001_catalog_placeholder.sql
│
└── tests/
    ├── unit/                       13 archivos, uno por módulo puro
    ├── e2e/
    │   ├── canvas.spec.js          @canvas — python3 http.server + page.route()
    │   ├── studio-flow.spec.js     @canvas
    │   ├── checkout.spec.js        @live   — sólo si existe E2E_BASE_URL
    │   └── admin.spec.js           @live
    ├── fixtures/
    │   ├── logo-transparente.png   200x80, PNG con alfa
    │   ├── logo-opaco.jpg          400x400 sin alfa
    │   ├── base-tee-gray.png       Base gris sintética determinista
    │   ├── catalog.json
    │   └── mp-payment-approved.json
    └── helpers/
        ├── mp-sign.js              Firma webhooks de prueba con el mismo algoritmo
        └── route-stubs.js          page.route() handlers reutilizables
```

### Cómo se evita servir lo que no debe servirse

`.vercelignore` — con `outputDirectory: "."` todo lo subido es servible, así que este archivo es la **única** barrera:

```
node_modules
tests
supabase
.playwright-mcp
test-results
playwright-report
vitest.config.js
playwright.config.js
*.md
.env
.env.*
screenshot-full.png
screenshot-hero.png
navbar-desktop.png
design-system.html
```

`package.json` **sí se sube** (Vercel lo necesita para `"type":"module"` en las functions). No contiene secretos.

**Criterio observable:** tras el deploy, `curl -sI https://<preview>/tests/unit/pricing.test.js` → `404`, `curl -sI https://<preview>/supabase/migrations/0001_schema.sql` → `404`, `curl -sI https://<preview>/` → `200`.

### Ocultamiento de `/estudio/`

1. `vercel.json` header: `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` para `/estudio` y `/estudio/(.*)`.
2. `<meta name="robots" content="noindex, nofollow">` en cada HTML del estudio.
3. Fuera de `sitemap.xml`. Sin enlaces entrantes desde `index.html`.
4. **NO se añade `Disallow: /estudio/` a `robots.txt`.** Razón: publicaría la ruta *y* impediría que el crawler lea el `noindex` (bloqueado el crawl, la URL puede indexarse igual sin snippet). El header es estrictamente mejor.

---

## 2. Módulos de lógica pura — firmas y contratos de prueba

Convención transversal: **todo el dinero es entero en centavos**. Ninguna función devuelve float de dinero. Todo error es una subclase con `.code` estable (el test asserta el `code`, no el mensaje).

### 2.1 `estudio/lib/errors.js`

```js
export class AppError extends Error { constructor(code, message, details = {}) }
export class PricingError extends AppError {}
export class ValidationError extends AppError {}
export class GeometryError extends AppError {}
export class MpConfigError extends AppError {}
export class OrderStateError extends AppError {}
export class TaintedCanvasError extends AppError {}
```

### 2.2 `estudio/lib/color.js`

```js
/** @typedef {{r:number,g:number,b:number}} Rgb */
/** @typedef {{h:number,s:number,l:number}} Hsl */   // h 0..360, s/l 0..1

export function hexToRgb(hex: string): Rgb            // '#D02B34' | 'D02B34' | '#fff'
export function rgbToHex(rgb: Rgb): string            // SIEMPRE '#RRGGBB' mayúsculas
export function srgbToLinear(channel8bit: number): number
export function relativeLuminance(rgb: Rgb): number   // WCAG 2.x, 0..1
export function contrastRatio(hexA: string, hexB: string): number  // 1..21
export function isDarkColor(hex: string): boolean     // relativeLuminance < 0.179
export function rgbToHsl(rgb: Rgb): Hsl
export function hslToRgb(hsl: Hsl): Rgb
export function legibility(garmentHex: string, logoHex: string):
  { ratio: number, level: 'ok'|'warn'|'fail', message: string }
export function suggestLogoVariant(garmentHex: string): 'oscuro'|'claro'
```

**Casos de prueba que definen el contrato** (`tests/unit/color.test.js`):

| # | Entrada | Esperado |
|---|---|---|
| 1 | `hexToRgb('#D02B34')` | `{r:208,g:43,b:52}` |
| 2 | `hexToRgb('D02B34')` | igual que 1 (acepta sin `#`) |
| 3 | `hexToRgb('#fff')` | `{r:255,g:255,b:255}` (shorthand de 3) |
| 4 | `hexToRgb('#GG0000')` | lanza `ValidationError` code `INVALID_HEX` |
| 5 | `hexToRgb('')`, `hexToRgb(null)` | lanza `INVALID_HEX` |
| 6 | `rgbToHex({r:208,g:43,b:52})` | `'#D02B34'` |
| 7 | `rgbToHex(hexToRgb(x)) === x.toUpperCase()` | property test sobre los 8 tokens de marca |
| 8 | `relativeLuminance({0,0,0})` | `0` |
| 9 | `relativeLuminance({255,255,255})` | `1` (±1e-9) |
| 10 | `contrastRatio('#000000','#FFFFFF')` | `21` (±0.01) |
| 11 | `contrastRatio('#FFFFFF','#FFFFFF')` | `1` |
| 12 | `contrastRatio(a,b) === contrastRatio(b,a)` | property, 20 pares |
| 13 | `isDarkColor('#0C0C0C')` / `isDarkColor('#F0F0EE')` | `true` / `false` |
| 14 | `isDarkColor('#D02B34')` | `true` (rojo de marca es oscuro) |
| 15 | `legibility('#0C0C0C','#181818').level` | `'fail'` (ratio < 3) |
| 16 | `legibility('#0C0C0C','#B8B8B8').level` | `'ok'` (ratio ≥ 4.5) |
| 17 | `legibility(x,y).message` | string no vacío, en español, sin `undefined` |
| 18 | `rgbToHsl({255,0,0})` | `{h:0,s:1,l:0.5}` |
| 19 | `hslToRgb(rgbToHsl(c)) ≈ c` | property, 30 colores, ±1 por canal |
| 20 | `rgbToHsl({128,128,128}).s` | `0` (gris = saturación cero) |
| 21 | `suggestLogoVariant('#0C0C0C')` | `'claro'` |

### 2.3 `estudio/lib/geometry.js` — clamp con rotación

**Contrato de coordenadas (documentarlo en el header del archivo, es donde un modelo pequeño se pierde):**
- Todo en el espacio de la prenda, píxeles, origen arriba-izquierda.
- `Transform.x`/`y` = **centro** del logo, no la esquina.
- `rotation` en **grados**, sentido horario.
- `printArea` es un `Rect` no rotado.

```js
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{x:number,y:number,width:number,height:number}} Rect */
/** @typedef {{x:number,y:number,scaleX:number,scaleY:number,rotation:number}} Transform */
/** @typedef {{width:number,height:number}} Size */

export function degToRad(deg: number): number
export function rotatePoint(p: Point, origin: Point, deg: number): Point
export function logoCorners(t: Transform, natural: Size): [Point,Point,Point,Point]
export function aabbOf(points: Point[]): Rect
export function rotatedAabb(t: Transform, natural: Size): Rect
export function rectContains(outer: Rect, inner: Rect, eps?: number): boolean
export function clampScale(t: Transform, natural: Size, area: Rect, minPx?: number): number
export function clampTransformToArea(t: Transform, natural: Size, area: Rect): Transform
export function fitTransformToArea(natural: Size, area: Rect, mode: 'contain'|'cover'): Transform
export function isTransformValid(t, natural, area): { valid: boolean, reasons: string[] }
export function areaCoveragePct(t: Transform, natural: Size, area: Rect): number  // 0..100
export function transformToRenderProps(t: Transform, natural: Size):
  { x:number, y:number, width:number, height:number, rotation:number, offsetX:number, offsetY:number }
export function normalizeRotation(deg: number): number    // → [0,360)
export function snapRotation(deg: number, step?: number, tol?: number): number
```

**Casos de prueba** (`tests/unit/geometry.test.js`). Usar siempre `AREA = {x:0,y:0,width:200,height:200}` y `L100 = {width:100,height:100}`:

| # | Caso | Esperado |
|---|---|---|
| 1 | `rotatePoint({x:1,y:0},{x:0,y:0},90)` | `{x:0,y:1}` ±1e-9 |
| 2 | `rotatePoint(p,o,360)` | `p` ±1e-9 |
| 3 | `rotatePoint(p,p,cualquier)` | `p` |
| 4 | `rotatedAabb({x:100,y:100,scaleX:1,scaleY:1,rotation:0}, L100)` | `{x:50,y:50,width:100,height:100}` |
| 5 | `rotatedAabb(...rotation:45, L100)` | `width`=`height`=`141.4214` ±1e-3, centrado en 100,100 |
| 6 | `rotatedAabb(...rotation:90, {200,100})` | `{width:100,height:200}` |
| 7 | `rotatedAabb(...rotation:180, L100)` | idéntico al de rotación 0 |
| 8 | clamp de `{x:180,y:100,s:1,rot:0}` | `x === 150` |
| 9 | clamp de `{x:-50,y:100,s:1,rot:0}` | `x === 50` |
| 10 | clamp de `{x:180,y:100,s:1,rot:45}` | `x === 200 - 70.7107` ≈ `129.2893` |
| 11 | clamp de `{x:100,y:100,s:1,rot:0}` (ya dentro) | devuelve el mismo objeto por valor, sin cambios |
| 12 | clamp de logo 400×400, `s:1, rot:0` | `scaleX===scaleY===0.5`, `x===100`, `y===100` |
| 13 | clamp de logo 400×400, `s:1, rot:45` | `scale === 200/565.685` ≈ `0.35355` |
| 14 | **idempotencia**: `clamp(clamp(t)) === clamp(t)` | property, 50 transforms aleatorios (x,y ∈ [-500,700], scale ∈ [0.01,10], rot ∈ [0,360)) |
| 15 | **invariante**: `rectContains(AREA, rotatedAabb(clamp(t)))` | property, los mismos 50 → siempre `true` |
| 16 | clamp con `area` desplazada `{x:60,y:80,w:120,h:90}` | el AABB resultante está contenido; `x` se clampa a `[60+w/2, 180-w/2]` |
| 17 | `fitTransformToArea({400,200}, AREA, 'contain')` | `scaleX===scaleY===0.5`, `x===100`, `y===100` |
| 18 | `fitTransformToArea({400,200}, AREA, 'cover')` | `scale===1`, el AABB desborda pero está centrado |
| 19 | `areaCoveragePct(centrado, L100, AREA)` | `25` |
| 20 | `areaCoveragePct` con logo que llena el área | `100` |
| 21 | `isTransformValid` con `scaleX:0` | `{valid:false, reasons:['SCALE_ZERO']}` |
| 22 | `isTransformValid` con `rotation:NaN` | `{valid:false, reasons:['ROTATION_NAN']}` |
| 23 | `normalizeRotation(-90)` / `(450)` | `270` / `90` |
| 24 | `snapRotation(88, 90, 5)` / `snapRotation(80, 90, 5)` | `90` / `80` |
| 25 | `transformToRenderProps` | `offsetX===natural.width*scaleX/2`, `x` = centro (para que Konva rote alrededor del centro) |
| 26 | clamp con logo más grande que el área **y** `minPx` | nunca devuelve scale que produzca AABB > área; prioriza caber sobre respetar `minPx` |

### 2.4 `estudio/lib/compose.js` — matemática de la mezcla (referencia de verdad)

Esta es la implementación de referencia W3C del blend `color`. El canvas real debe coincidir con ella; Playwright compara píxeles contra esto. Es lo que hace que el test visual **no** sea frágil.

```js
export function lum(rgb: Rgb): number                             // 0.3r + 0.59g + 0.11b, 0..255
export function clipColor(rgb: Rgb): Rgb                          // W3C ClipColor
export function setLum(rgb: Rgb, l: number): Rgb                  // W3C SetLum
export function blendColorPixel(backdrop: Rgb, source: Rgb): Rgb  // gco 'color'
export function blendMultiplyPixel(backdrop: Rgb, source: Rgb): Rgb
export function grayscaleStats(data: Uint8ClampedArray):
  { mean:number, min:number, max:number, alphaMean:number, opaqueCount:number }
export function normalizeFoldMapPixels(data: Uint8ClampedArray, targetLevel?: number, referencePercentile?: number): Uint8ClampedArray
export function tintPixels(base: Uint8ClampedArray, hex: string): Uint8ClampedArray
export function dominantColorFromPixels(data: Uint8ClampedArray, opts?: {alphaThreshold?:number, bucketBits?:number}): string
export function pixelsHaveAlpha(data: Uint8ClampedArray, threshold?: number): boolean
export function samplePixel(data: Uint8ClampedArray, width: number, x: number, y: number): {r,g,b,a}
```

**Casos de prueba** (`tests/unit/compose.test.js`). Se construyen `Uint8ClampedArray` a mano, cero DOM:

| # | Caso | Esperado |
|---|---|---|
| 1 | `lum({255,255,255})` | `255` |
| 2 | `lum({0,0,0})` | `0` |
| 3 | **invariante maestra**: `lum(blendColorPixel(cb, cs)) ≈ lum(cb)` | ±1, property con 100 pares aleatorios. *Es el contrato de todo el motor de preview.* |
| 4 | `blendColorPixel(cb, {128,128,128})` (fuente gris) | resultado gris con `lum === lum(cb)` |
| 5 | `blendColorPixel({128,128,128}, {255,0,0})` | rojo con `lum≈128`; `r>g` y `r>b` |
| 6 | `blendColorPixel({0,0,0}, cualquier)` | `{0,0,0}` (negro no se puede teñir) |
| 7 | `blendColorPixel({255,255,255}, cualquier)` | `{255,255,255}` |
| 8 | `blendColorPixel` con cb muy oscuro y cs saturado | ningún canal fuera de `[0,255]` (valida `clipColor`) |
| 9 | `blendMultiplyPixel({200,200,200},{255,255,255})` | `{200,200,200}` |
| 10 | `blendMultiplyPixel(x,{0,0,0})` | `{0,0,0}` |
| 11 | `grayscaleStats` sobre array uniforme de 128 | `{mean:128,min:128,max:128}` |
| 12 | `normalizeFoldMapPixels(mapaReal, 255)[0]` con tela plana a 180 | `255` — la **tela plana** aterriza en 255, donde multiply es factor 1.0. **NO la media**: la media incluye los pliegues, y llevarla a 255 (el techo del rango) obligaría a recortar toda la sombra. La referencia es un percentil alto (`referencePercentile`, 0.9) |
| 12b | razones de atenuación con mapa real (plana 180, pliegue 120, arruga 80) | `out[pliegue]/255 ≈ 120/180` y `out[arruga]/255 ≈ 80/180`. **Normalización MULTIPLICATIVA**, no aditiva: multiply es multiplicativo, así que lo que importa es cuánto atenúa cada pliegue *respecto a la tela plana*. Escalar preserva esas razones; sumar una constante las comprime (aditivo daría 0.843/0.686 en vez de 0.667/0.444 — pliegues casi borrados) |
| 12c | mapa uniforme | queda todo en `targetLevel` — multiply neutro, no hace nada |
| 13 | `normalizeFoldMapPixels` preserva el canal alfa | byte 3 de cada píxel inalterado |
| 14 | `normalizeFoldMapPixels` preserva el **orden** relativo | si `a<b` en la entrada, `a'<=b'` en la salida |
| 15 | `tintPixels(base, '#D02B34')` | cada píxel === `blendColorPixel(basePixel, hexToRgb('#D02B34'))` |
| 16 | `tintPixels` ignora píxeles con `a===0` | alfa 0 → salida alfa 0, RGB intacto |
| 17 | `dominantColorFromPixels` con 90% rojo + 10% transparente | `'#FF0000'` (o el bucket que lo contenga) |
| 18 | `dominantColorFromPixels` con todo `a<alphaThreshold` | lanza `ValidationError` `NO_OPAQUE_PIXELS` |
| 19 | `pixelsHaveAlpha` PNG con alfa parcial / JPG opaco | `true` / `false` |
| 20 | `samplePixel(data, 10, 3, 2)` | lee el offset `(2*10+3)*4` |

### 2.5 `estudio/lib/sizes.js`

```js
export const SIZE_ORDER = ['XS','S','M','L','XL','XXL','XXXL'];
/** @typedef {Record<string, number>} SizeBreakdown */

export function normalizeBreakdown(raw: object): SizeBreakdown
export function totalUnits(b: SizeBreakdown): number
export function validateBreakdown(b: SizeBreakdown, opts: {
  allowedSizes: string[], minTotal: number, maxTotal: number, maxPerSize?: number
}): { valid: boolean, total: number, errors: Array<{code:string, size?:string, min?:number, max?:number, got?:number}> }
export function breakdownToLabel(b: SizeBreakdown): string
export function mergeBreakdowns(a, b): SizeBreakdown
export function sortSizes(keys: string[]): string[]
```

| # | Caso | Esperado |
|---|---|---|
| 1 | `normalizeBreakdown({m:2, L:0, ' s ':1})` | `{S:1, M:2}` (mayúsculas, trim, ceros fuera) |
| 2 | `Object.keys(normalizeBreakdown({XL:1,S:1,M:1}))` | `['S','M','XL']` — orden de `SIZE_ORDER`, no de inserción |
| 3 | `normalizeBreakdown({})` | `{}` |
| 4 | `normalizeBreakdown({M:'3'})` | `{M:3}` (coerción numérica de strings enteros) |
| 5 | `normalizeBreakdown({M:'abc'})` | lanza `ValidationError` `NON_NUMERIC_QTY` |
| 6 | `totalUnits({S:2,M:4,L:6})` | `12` |
| 7 | `validate({M:-1}, {minTotal:1,...})` | error `{code:'NEGATIVE_QTY', size:'M'}` |
| 8 | `validate({M:2.5}, ...)` | error `{code:'NON_INTEGER', size:'M'}` |
| 9 | `validate({XXXXL:1}, {allowedSizes:SIZE_ORDER})` | error `{code:'UNKNOWN_SIZE', size:'XXXXL'}` |
| 10 | `validate({}, {minTotal:12})` | `{valid:false, total:0, errors:[{code:'BELOW_MIN',min:12,got:0}]}` |
| 11 | `validate({M:5}, {minTotal:12})` | `BELOW_MIN` con `got:5` |
| 12 | `validate({M:12}, {minTotal:12,maxTotal:500})` | `{valid:true, total:12, errors:[]}` |
| 13 | `validate({M:501}, {maxTotal:500})` | `ABOVE_MAX` |
| 14 | `validate({M:400,L:400}, {maxPerSize:300})` | **dos** errores `MAX_PER_SIZE` |
| 15 | errores acumulan, no cortocircuitan | `validate({M:-1, XXXXL:2})` → `errors.length === 2` |
| 16 | `breakdownToLabel({S:2,M:4})` | `'6 pzas · S×2 M×4'` |
| 17 | `mergeBreakdowns({S:1},{S:2,M:1})` | `{S:3,M:1}` |

### 2.6 `estudio/lib/pricing.js`

```js
/** @typedef {{min_qty:number, max_qty:number|null, unit_price_cents:number}} Tier */
/** @typedef {{id:string, garment_type_id:string, technique_id:string,
 *             tiers:Tier[], technique_surcharge_cents:number,
 *             size_surcharges_cents:Record<string,number>,
 *             currency:'MXN', is_placeholder:boolean}} PricingRule */
/** @typedef {{rule:PricingRule, breakdown:SizeBreakdown}} QuoteInput */
/** @typedef {{qty:number, tier_applied:Tier, unit_price_cents:number,
 *             subtotal_cents:number, technique_surcharge_cents:number,
 *             size_surcharge_cents:number, total_cents:number,
 *             currency:'MXN', is_placeholder:boolean,
 *             lines:Array<{label:string, qty:number, unit_cents:number, amount_cents:number}>}} Quote */

export function sortTiers(tiers: Tier[]): Tier[]
export function validateTiers(tiers: Tier[]): { valid:boolean, errors:Array<{code:string, at?:number}> }
export function resolveTier(tiers: Tier[], qty: number): Tier
export function unitPriceCents(rule: PricingRule, qty: number): number
export function sizeSurchargeCents(rule: PricingRule, b: SizeBreakdown): number
export function quote(input: QuoteInput): Quote
export function quoteCart(items: QuoteInput[]): { items:Quote[], total_cents:number, is_placeholder:boolean, currency:'MXN' }
export function isTestAccessToken(token: string): boolean
export function assertChargeable(cart, { accessToken: string }): void
```

**Candado de precios placeholder — diseño deliberado.** No hay `ALLOW_PLACEHOLDER=true`. La condición es: precios placeholder **sólo** son cobrables si el access token de MP empieza con `TEST-`. Es auto-aplicable e imposible de encender por accidente en producción.

| # | Caso | Esperado |
|---|---|---|
| 1 | Tiers `[1-11],[12-49],[50-99],[100-null]`, `resolveTier(qty)` para `1,11` | tier 1 |
| 2 | ídem para `12,49` / `50,99` / `100,1000` | tier 2 / tier 3 / tier 4 |
| 3 | `resolveTier(tiers, 0)` | lanza `PricingError` `QTY_ZERO` |
| 4 | `resolveTier(tiers, -5)` | `QTY_NEGATIVE` |
| 5 | `resolveTier([], 10)` | `NO_TIERS` |
| 6 | `resolveTier([{1,10,x}], 50)` | `NO_TIER_FOR_QTY` con `details.qty===50` |
| 7 | `resolveTier` funciona con tiers **desordenados** en la entrada | mismo resultado que ordenados |
| 8 | `validateTiers([{1,10},{12,null}])` | error `{code:'GAP', at:11}` |
| 9 | `validateTiers([{1,20},{10,null}])` | error `{code:'OVERLAP', at:10}` |
| 10 | `validateTiers([{5,null}])` | error `MUST_START_AT_1` |
| 11 | `validateTiers([{1,10}])` | error `MISSING_OPEN_TIER` |
| 12 | `validateTiers([{1,10,-5}])` | error `NEGATIVE_PRICE` |
| 13 | tier válido completo | `{valid:true, errors:[]}` |
| 14 | `unitPriceCents(rule, 12)` | `tier.unit_price_cents + rule.technique_surcharge_cents` |
| 15 | `sizeSurchargeCents` con `{M:10, XXL:2}` y recargo XXL=2000 | `4000` |
| 16 | `sizeSurchargeCents` con talla sin recargo | `0` |
| 17 | `quote` con `{S:2,M:4,L:6}` (12 pzas) | `qty===12`, `tier_applied` = tier 2 |
| 18 | `quote.total_cents === subtotal + size_surcharge` | invariante en 20 casos |
| 19 | **sin drift de float**: unit 3333 × 7 | `23331` exacto. `Number.isInteger(total_cents)` en todos los casos |
| 20 | `quote` con `rule.is_placeholder:true` | `quote.is_placeholder === true` |
| 21 | `quoteCart` con 1 placeholder + 1 real | `is_placeholder === true` (se propaga con OR) |
| 22 | `quoteCart([]).total_cents` | `0` |
| 23 | `quote.lines` suma exactamente `total_cents` | invariante |
| 24 | `isTestAccessToken('TEST-123')` / `('APP_USR-1')` | `true` / `false` |
| 25 | `assertChargeable(cartPlaceholder, {accessToken:'APP_USR-1'})` | lanza `PricingError` `PLACEHOLDER_PRICING_IN_LIVE_MODE` |
| 26 | `assertChargeable(cartPlaceholder, {accessToken:'TEST-1'})` | no lanza |
| 27 | `assertChargeable(cartReal, {accessToken:'APP_USR-1'})` | no lanza |
| 28 | `assertChargeable(cart, {accessToken:''})` | lanza `MpConfigError` `MISSING_ACCESS_TOKEN` |
| 29 | `formatCentsMXN(123400)` / `(0)` / `(-500)` / `(50)` | `'$1,234.00'` / `'$0.00'` / `'-$5.00'` / `'$0.50'` |

### 2.7 `estudio/lib/order-draft.js`

```js
export function buildOrderDraft(state: StudioState): OrderDraft
export function validateOrderDraft(d: OrderDraft): { valid:boolean, errors:Array<{code:string, field:string}> }
export function draftFingerprint(d: OrderDraft): string   // FNV-1a hex, síncrono, sin crypto
export function stableStringify(v: any): string
```

| # | Caso | Esperado |
|---|---|---|
| 1 | `stableStringify({b:2,a:1}) === stableStringify({a:1,b:2})` | `true` |
| 2 | `stableStringify` en arrays | preserva el orden (los arrays sí son ordenados) |
| 3 | `stableStringify({a:undefined})` | omite la clave |
| 4 | `draftFingerprint` mismo draft con claves permutadas | mismo hash |
| 5 | cambiar `qty` de 12 a 13 | hash distinto |
| 6 | `draftFingerprint` | siempre 16 chars hex, `/^[0-9a-f]{16}$/` |
| 7 | `validateOrderDraft` sin `logo_path` | `{code:'REQUIRED', field:'items[0].logo_path'}` |
| 7b | `buildOrderDraft` conserva `preview_path` | la lista blanca **debe** incluirlo: `order_items.preview_object_path` es NOT NULL (§5.1). Sin él el snapshot queda huérfano en Storage y el INSERT del pedido falla |
| 7c | `validateOrderDraft` sin `preview_path` | `{code:'REQUIRED', field:'items[0].preview_path'}` |
| 8 | sin email | `{code:'REQUIRED', field:'customer.email'}` |
| 9 | email inválido | `{code:'INVALID_EMAIL', field:'customer.email'}` |
| 10 | draft completo válido | `{valid:true, errors:[]}` |
| 11 | `buildOrderDraft` **nunca** incluye `price` ni `total` | `expect(draft).not.toHaveProperty('total_cents')` — el precio lo pone el servidor |

### 2.8 `api/_lib/mp-preference.js`

```js
export function centsToMpUnitPrice(cents: number): number
export function sanitizeTitle(s: string, max?: number): string
export function sanitizeStatementDescriptor(s: string): string
export function isHttpsUrl(u: string): boolean
export function buildBackUrls(baseUrl: string, orderToken: string): {success:string, failure:string, pending:string}
export function buildPreferenceBody(input: {
  order: { id:string, public_token:string, items:Array<{title:string, description?:string, quantity:number, unit_price_cents:number}> },
  customer: { name:string, email:string, phone?:string },
  baseUrl: string,
  notificationUrl: string,
  statementDescriptor: string
}): object
```

| # | Caso | Esperado |
|---|---|---|
| 1 | `body.binary_mode` | `=== true` |
| 2 | `body.payment_methods.excluded_payment_types` | deep-equal `[{id:'ticket'},{id:'atm'},{id:'bank_transfer'}]` |
| 3 | `body.payment_methods.installments` | `=== 1` |
| 4 | `body.external_reference` | `=== order.id` |
| 5 | `Object.keys(body.back_urls)` | `['success','failure','pending']`, las 3 absolutas https |
| 6 | back_urls incluyen `?t=<public_token>` | `true` — el retorno identifica el pedido sin exponer el id |
| 7 | `baseUrl='https://grafik.mx'` | `body.auto_return === 'all'` |
| 8 | `baseUrl='http://localhost:3000'` | **`'auto_return' in body === false`** (clave ausente, no `undefined`) |
| 9 | `baseUrl='http://ejemplo.com'` con `requireAutoReturn:true` | lanza `MpConfigError` `BACK_URL_NOT_HTTPS` |
| 10 | `centsToMpUnitPrice(1990)` / `(333)` / `(10)` / `(1)` | `19.9` / `3.33` / `0.1` / `0.01` |
| 11 | `Σ(unit_price*quantity)*100` | `=== total_cents` exacto para 30 combinaciones (sin `0.30000000000000004`) |
| 12 | `sanitizeTitle('a'.repeat(400))` | longitud `256` |
| 13 | `sanitizeTitle('  a   b  ')` | `'a b'` |
| 14 | `sanitizeStatementDescriptor('GRAFIK Imprenta CDMX SA')` | ≤ 22 chars, mayúsculas, sólo `[A-Z0-9 ]` |
| 15 | `body.notification_url` | absoluta https, sin query params sensibles |
| 16 | `body.payer` | `{name, email, phone?}`; si no hay teléfono, la clave `phone` está ausente |
| 17 | `buildPreferenceBody` con `items:[]` | lanza `MpConfigError` `EMPTY_ITEMS` |
| 18 | `unit_price_cents: 0` | lanza `MpConfigError` `ZERO_PRICE` |
| 19 | `JSON.stringify(body)` | no lanza; no contiene `undefined` literal |
| 20 | snapshot del body completo | comparar contra un objeto fijo en el test (regresión total) |

### 2.9 `api/_lib/mp-signature.js`

```js
export function parseSignatureHeader(header: string|undefined|null): { ts:string, v1:string } | null
export function normalizeDataId(id: string): string          // lowercase si contiene letras
export function buildManifest({ dataId:string, requestId?:string, ts:string }): string
export function timingSafeEqualHex(a: string, b: string): boolean
export function verifySignature(opts: {
  header: string|undefined, requestId: string|undefined, dataId: string,
  secret: string|undefined, nowMs: number, toleranceMs?: number
}): { valid: boolean, reason: string|null }
```

**Orden obligatorio de comprobaciones** (documentado y testeado): `SECRET_MISSING` → `MALFORMED_HEADER` → `TIMESTAMP_*` → `MALFORMED_V1` → HMAC. Nunca se calcula el HMAC si el `ts` ya caducó.

| # | Caso | Esperado |
|---|---|---|
| 1 | `parseSignatureHeader('ts=1704908010,v1=abc')` | `{ts:'1704908010', v1:'abc'}` |
| 2 | con espacios `'ts=1, v1=abc'` | mismo resultado |
| 3 | orden invertido `'v1=abc,ts=1'` | mismo resultado |
| 4 | `undefined`, `''`, `'garbage'`, `'ts=1'`, `'v1=abc'` | `null` en los 5 |
| 5 | `buildManifest({dataId:'123', requestId:'req-1', ts:'170'})` | **exactamente** `'id:123;request-id:req-1;ts:170;'` |
| 6 | `buildManifest({dataId:'123', requestId:undefined, ts:'170'})` | **exactamente** `'id:123;ts:170;'` (segmento entero omitido) |
| 7 | `buildManifest({dataId:'', ...})` | lanza `ValidationError` `MISSING_DATA_ID` |
| 8 | `normalizeDataId('ABC123')` / `('123456')` | `'abc123'` / `'123456'` |
| 9 | manifest siempre termina en `';'` | assert `endsWith(';')` |
| 10 | firma correcta (generada por `tests/helpers/mp-sign.js` con el mismo secreto) | `{valid:true, reason:null}` |
| 11 | secreto distinto | `{valid:false, reason:'SIGNATURE_MISMATCH'}` |
| 12 | `dataId` distinto al firmado | `SIGNATURE_MISMATCH` |
| 13 | `requestId` distinto al firmado | `SIGNATURE_MISMATCH` |
| 14 | `ts` de hace 6 min, `toleranceMs` 300000 | `{valid:false, reason:'TIMESTAMP_EXPIRED'}` |
| 15 | `ts` 6 min en el futuro | `'TIMESTAMP_SKEW'` |
| 16 | `ts` de hace 4 min con firma válida | `{valid:true}` |
| 17 | ts caducado **con firma válida** | `TIMESTAMP_EXPIRED` — el HMAC no rescata un replay |
| 18 | `ts='no-es-numero'` | `'TIMESTAMP_INVALID'` |
| 19 | `v1` de 10 chars (longitud ≠ 64) | `{valid:false, reason:'MALFORMED_V1'}` y **no lanza** (`timingSafeEqual` con buffers desiguales lanzaría) |
| 20 | `v1` con caracteres no hex | `'MALFORMED_V1'` |
| 21 | `secret: undefined` o `''` | `{valid:false, reason:'SECRET_MISSING'}` — **jamás** `valid:true` |
| 22 | `header: undefined` | `'MALFORMED_HEADER'` |
| 23 | `timingSafeEqualHex('ab','abcd')` | `false`, sin excepción |
| 24 | fuzz: 200 headers aleatorios | `verifySignature` nunca lanza; siempre devuelve `{valid:false, reason:<string>}` |

### 2.10 `api/_lib/order-state.js`

```js
export const ORDER_STATES = ['draft','pending_payment','paid','payment_failed',
                             'in_production','ready','delivered','cancelled','refunded','expired'];
export const TRANSITIONS: Record<string, string[]>
export const TERMINAL_STATES = ['delivered','cancelled','refunded','expired'];

export function canTransition(from: string, to: string): boolean
export function assertTransition(from: string, to: string): void
export function isTerminal(state: string): boolean
export function nextStateForPayment(mpStatus: string): string
export function allowedFromStatesFor(target: string): string[]
export function sideEffectsFor(from: string, to: string): string[]
export function allowedNextStatesForAdmin(state: string): string[]
export function isValidState(s: string): boolean
```

| # | Caso | Esperado |
|---|---|---|
| 1 | **estructural**: cada estado de `ORDER_STATES` es clave de `TRANSITIONS` | `true` |
| 2 | **estructural**: ningún destino fuera de `ORDER_STATES` | `true` |
| 3 | **estructural**: los terminales tienen `TRANSITIONS[s] === []` salvo `delivered`→`refunded` | según diseño |
| 4 | `canTransition('paid','paid')` | **`false`** — sin auto-bucles. Es lo que hace idempotente el `UPDATE ... WHERE status IN (...)` |
| 5 | `canTransition('delivered','paid')` | `false` |
| 6 | `canTransition('draft','pending_payment')` | `true` |
| 7 | `canTransition('pending_payment','paid')` | `true` |
| 8 | `canTransition('estado_inventado','paid')` | `false`, sin lanzar |
| 9 | `assertTransition('delivered','draft')` | lanza `OrderStateError` `INVALID_TRANSITION` con `details:{from,to}` |
| 10 | `nextStateForPayment('approved')` | `'paid'` |
| 11 | `('rejected')` | `'payment_failed'` |
| 12 | `('pending')` / `('in_process')` / `('authorized')` | `'pending_payment'` los tres |
| 13 | `('refunded')` / `('charged_back')` | `'refunded'` |
| 14 | `('cancelled')` | `'cancelled'` |
| 15 | `('estado_nuevo_de_mp')` | lanza `OrderStateError` `UNKNOWN_MP_STATUS` (**falla ruidoso**, no asume `paid`) |
| 16 | `allowedFromStatesFor('paid')` | `['pending_payment','payment_failed']` |
| 17 | `sideEffectsFor('pending_payment','paid')` | `['email:customer_paid','email:admin_new_order']` |
| 18 | `sideEffectsFor('paid','in_production')` | `['email:customer_in_production']` |
| 19 | `sideEffectsFor('draft','pending_payment')` | `[]` |
| 20 | `sideEffectsFor('pending_payment','payment_failed')` | `['email:customer_payment_failed']` |
| 21 | `sideEffectsFor(x,y)` para transición inválida | `[]` (nunca dispara efectos en transición ilegal) |
| 22 | `allowedNextStatesForAdmin('paid')` | `['in_production','cancelled','refunded']` — sin `'draft'` ni `'pending_payment'` |
| 23 | `allowedNextStatesForAdmin('delivered')` | `['refunded']` |

### 2.11 `api/_lib/email-templates.js`

```js
export const brand = { negro:'#0C0C0C', carbon:'#181818', carbonMid:'#222222',
                       rojo:'#D02B34', rojoDark:'#A0202A', blanco:'#F0F0EE',
                       plata:'#B8B8B8', plataDim:'#666666', wa:'#25D366' };

export function escapeHtml(s: unknown): string
export function renderBrandedEmail(opts: {
  preheader: string, title: string, contentHtml: string,
  cta?: { label:string, url:string }, footerNote?: string
}): string
export function renderTable(rows: Array<[string,string]>): string
export function renderOrderConfirmation(order: OrderView): { subject:string, html:string }
export function renderAdminNewOrder(order: OrderView): { subject:string, html:string }
export function renderStatusUpdate(order: OrderView, newStatus: string): { subject:string, html:string }
export function renderPaymentFailed(order: OrderView): { subject:string, html:string }
```

| # | Caso | Esperado |
|---|---|---|
| 1 | `escapeHtml('<script>&"\'')` | `'&lt;script&gt;&amp;&quot;&#39;'` |
| 2 | `escapeHtml(null)` / `(undefined)` / `(42)` | `''` / `''` / `'42'` — nunca `'null'` en el correo |
| 3 | nombre `'<img src=x onerror=alert(1)>'` | el html **no** contiene `'<img src=x'` |
| 4 | html empieza con `'<!DOCTYPE html'` | `true` |
| 5 | contiene `'<meta name="color-scheme" content="light only">'` | `true` |
| 6 | contiene `'role="presentation"'` | `true` |
| 7 | **no** contiene `'<button'` | `true` (el CTA es tabla) |
| 8 | contiene `'mso-hide:all'` | `true` |
| 9 | contiene `'width="600"'` | `true` |
| 10 | `html.indexOf(preheader) < html.indexOf(title)` | `true` |
| 11 | cada `bgcolor="#XXX"` tiene `background-color:#XXX` en la misma etiqueta | regex sobre todas las etiquetas |
| 12 | `subject` no contiene `\n` ni `\r` | anti header-injection |
| 13 | `subject` contiene los 8 primeros chars del id del pedido | `true` |
| 14 | montos aparecen como `'$1,234.00'` | usa `formatCentsMXN` |
| 15 | `renderOrderConfirmation` incluye una fila por talla | `S×2`, `M×4` presentes |
| 16 | `renderStatusUpdate(order,'in_production')` | subject y cuerpo en español, mencionan el nuevo estado |
| 17 | `renderStatusUpdate(order,'estado_raro')` | lanza `OrderStateError` `NO_TEMPLATE_FOR_STATE` |
| 18 | ninguna plantilla contiene `'undefined'` o `'NaN'` | con un `order` de campos opcionales vacíos |
| 19 | contiene el link `'/estudio/pedido/?t='` | `true` |
| 20 | `cta.url` con `'javascript:alert(1)'` | lanza `ValidationError` `UNSAFE_URL` |

### 2.12 `api/_lib/supabase.js` — sólo la parte pura

```js
export function buildPostgrestUrl(baseUrl: string, table: string, params: {
  select?: string, eq?: Record<string,string>, in?: Record<string,string[]>,
  order?: string, limit?: number, offset?: number
}): string
export function encodeFilterValue(v: string): string
export function sbHeaders(opts: { key:string, jwt?:string, prefer?:string }): Record<string,string>
```

| # | Caso | Esperado |
|---|---|---|
| 1 | `buildPostgrestUrl('https://x.supabase.co','orders',{select:'id,status',eq:{id:'abc'},limit:1})` | `'https://x.supabase.co/rest/v1/orders?select=id%2Cstatus&id=eq.abc&limit=1'` |
| 2 | `eq:{email:'a+b@c.com'}` | `'email=eq.a%2Bb%40c.com'` |
| 3 | `in:{status:['paid','ready']}` | `'status=in.%28paid%2Cready%29'` |
| 4 | valor con `,` → `eq:{note:'a,b'}` | el valor va entre comillas dobles y encodeado |
| 5 | baseUrl con `/` final | no produce `//rest` |
| 6 | `sbHeaders({key:'k'})` | `{apikey:'k', Authorization:'Bearer k', 'Content-Type':'application/json'}` |
| 7 | `sbHeaders({key:'anon', jwt:'user-jwt'})` | `Authorization: 'Bearer user-jwt'`, `apikey:'anon'` |
| 8 | `sbHeaders({key:'k', prefer:'return=representation'})` | incluye `Prefer` |
| 9 | ninguna salida de `sbHeaders` se registra en logs | test sobre `log.js`: `redact(headers)` oculta `apikey` y `Authorization` |

### 2.13 `api/_lib/storage-paths.js` y `validation.js`

```js
// storage-paths.js
export function logoObjectPath(o:{draftId:string, filename:string, nowMs:number, rand:string}): string
export function previewObjectPath(o:{draftId:string, itemIndex:number, nowMs:number, rand:string}): string
export function isAllowedLogoMime(m: string): boolean
export function isAllowedPreviewMime(m: string): boolean
export function isAllowedSize(bytes: number, max: number): boolean
export const MAX_LOGO_BYTES = 8 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;

// validation.js
export function isEmail(s): boolean
export function isMxPhone(s): boolean
export function normalizeMxPhone(s): string
export function isUuid(s): boolean
export function sanitizeFilename(s): string
export function assertShape(obj, schema): { valid:boolean, errors:Array<{path:string,code:string}> }
```

| # | Caso | Esperado |
|---|---|---|
| 1 | `logoObjectPath({draftId:'a1b2', filename:'Mi Logo (final).PNG', nowMs:D, rand:'xk91'})` | `'logos/2026/09/a1b2/mi-logo-final-xk91.png'` |
| 2 | filename `'../../etc/passwd'` | sin `..` ni `/` en el resultado |
| 3 | filename de 300 chars | slug ≤ 60 chars |
| 4 | filename sin extensión | lanza `ValidationError` `NO_EXTENSION` |
| 5 | `isAllowedLogoMime` para `png/jpeg/webp/svg+xml` | `true` |
| 6 | para `image/gif`, `application/pdf`, `text/html` | `false` |
| 7 | `isAllowedPreviewMime('image/png')` / `('image/svg+xml')` | `true` / `false` (el snapshot nunca es SVG) |
| 8 | `isEmail('a@b.co')` / `('a@b')` / `('a b@c.com')` / `('')` | `true`/`false`/`false`/`false` |
| 9 | `normalizeMxPhone('+52 55 3901 4600')` | `'5539014600'` |
| 10 | `normalizeMxPhone('55-3901-4600')` | `'5539014600'` |
| 11 | `isMxPhone('123')` | `false` |
| 12 | `assertShape({a:1},{a:'number',b:'string'})` | `{valid:false, errors:[{path:'b',code:'REQUIRED'}]}` |
| 13 | `assertShape` con campo extra | lo ignora (no falla) |

---

## 3. Motor de canvas

### 3.1 Reparto Konva / canvas 2D crudo

**El hecho que manda:** Konva expone `globalCompositeOperation` como atributo de nodo ([docs](https://konvajs.org/docs/styling/Blend_Mode.html)), y se aplica sobre **el canvas de su propia Layer**. Cada `Konva.Layer` es un `<canvas>` distinto apilado por CSS, y `stage.toDataURL()` los compone con `drawImage` — así que **una gco no cruza fronteras de Layer**, ni en pantalla ni en el snapshot.

Consecuencia: todo lo que se mezcla vive en **una sola Layer**, y el Transformer vive en otra para poder excluirlo del snapshot.

```
Konva.Stage  (#es-canvas)
│
├── Layer "compose"           ← UNA sola layer = un canvas = las mezclas funcionan
│   │
│   ├── Konva.Image  garment           image: HTMLCanvasElement producido por garment-painter
│   │                                  (base gris + tinte ya compuesto offscreen)
│   │
│   ├── Konva.Group  clip = printArea
│   │   └── Konva.Image  logo          draggable: true
│   │
│   ├── Konva.Group  clip = printArea          ← sombra de pliegues SOLO sobre el área imprimible
│   │   └── Konva.Image  foldMap
│   │            globalCompositeOperation: 'multiply'
│   │            opacity: 0.35
│   │            listening: false
│   │
│   └── Konva.Rect   printAreaGuide    dash [6,4], stroke rgba(240,240,238,.35), listening:false
│
└── Layer "ui"                ← FUERA del snapshot
    └── Konva.Transformer     rotateEnabled, keepRatio, anchors
```

**Por qué el tinte va en canvas 2D crudo y no como un `Konva.Rect` con gco `'color'`:**
1. Sólo cambia cuando cambia el color → se memoiza por `colorHex` (`Map<hex, HTMLCanvasElement>`), el drag del logo no recompone nada.
2. Se puede leer con `getImageData` y comparar contra `compose.blendColorPixel()` → test numérico, no screenshot diff.
3. Evita depender del orden de hijos dentro de la Layer, que es exactamente donde un modelo pequeño se equivoca.
4. El `foldMap` normalizado (`normalizeFoldMapPixels`) también se precalcula ahí: multiplicar por el gris crudo oscurecería el logo el doble. Normalizado **multiplicativamente contra el nivel de tela plana** (percentil 0.9 → 255), la tela plana queda neutra y sólo los pliegues restan brillo, conservando sus razones de atenuación reales.

`garment-painter.js`:
```js
export function paintGarment(baseImage: HTMLImageElement|HTMLCanvasElement, colorHex: string,
                             size: {width:number,height:number}): HTMLCanvasElement
export function paintFoldMap(baseImage, size): HTMLCanvasElement
export function clearCache(): void
```
Dentro de `paintGarment`: `drawImage(base)` → `ctx.globalCompositeOperation='color'` → `fillStyle=colorHex` → `fillRect` → `globalCompositeOperation='destination-in'` → `drawImage(base)` (para recuperar la silueta alfa) → `'source-over'`.

### 3.2 Separación transform puro / renderizado

`konva-adapter.js` es el **único** archivo del repo que menciona Konva. Regla: cada handler de Konva **no decide nada**; delega en `geometry.clampTransformToArea` y escribe el resultado.

```js
export function createStudioStage(opts: {
  container: HTMLElement, width: number, height: number, printArea: Rect
}): StudioStage

/** StudioStage:
 *  setGarment({ baseImage, foldImage, colorHex }): void
 *  setLogo({ image: HTMLImageElement|null, naturalSize: Size }): void
 *  getTransform(): Transform
 *  setTransform(t: Transform): void          // pasa siempre por clampTransformToArea
 *  fitLogo(mode: 'contain'|'cover'): void
 *  onTransformChange(cb): () => void
 *  setPrintAreaVisible(b: boolean): void
 *  setFoldShadowOpacity(n: number): void
 *  snapshot(o?: { pixelRatio?, mimeType?, quality? }): Promise<Blob>
 *  destroy(): void
 */
```

```js
// Único punto donde el transform cambia. No hay otro.
function commit(raw) {
  const clamped = clampTransformToArea(raw, naturalSize, printArea);
  const props = transformToRenderProps(clamped, naturalSize);
  logoNode.setAttrs(props);
  logoNode.scaleX(1); logoNode.scaleY(1);   // la escala vive en width/height, no en scale
  current = clamped;
  composeLayer.batchDraw();
  listeners.forEach(f => f(clamped));
}
logoNode.on('dragmove transform', () => commit(readTransformFromNode(logoNode)));
logoNode.on('dragend transformend', () => commit(readTransformFromNode(logoNode)));
```

`snapshot()` usa **`composeLayer.toDataURL()`**, no `stage.toDataURL()` — así los anchors del Transformer nunca entran a la imagen guardada.

### 3.3 El cortafuegos anti-taint

`image-loader.js`. **Regla dura escrita en el archivo y verificada en test: `img.src` sólo recibe `blob:` o `data:`. Jamás una URL remota.**

```js
export async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement>
export async function loadImageFromFile(file: File): Promise<HTMLImageElement>
export async function loadImageFromUrl(url: string): Promise<HTMLImageElement>
  // fetch(url) → .blob() → loadImageFromBlob. El <img> NUNCA ve la URL remota.
export function assertNotTainted(canvas: HTMLCanvasElement): void
  // try { ctx.getImageData(0,0,1,1) } catch { throw new TaintedCanvasError('CANVAS_TAINTED') }
```

Con esto `crossOrigin`, CORS y `Access-Control-Allow-Origin` dejan de importar: un `blob:` es same-origin por construcción y no contamina. Si `fetch` falla por CORS, falla **ahí**, con un error claro, y no 40 pasos después en `toDataURL`.

`snapshot.js` llama `assertNotTainted(layer.getCanvas()._canvas)` **antes** de exportar, para que el fallo sea diagnosticable.

### 3.4 Mockup procedural

```js
// mockup.js
export function renderProceduralBase(kind: 'tee'|'cap', size: Size): HTMLCanvasElement
export function drawTeeSilhouette(ctx, size): void
export function drawCapSilhouette(ctx, size): void
export const PROCEDURAL_PRINT_AREAS = {
  tee: { x: 0.30, y: 0.26, width: 0.40, height: 0.34 },   // fracciones del canvas
  cap: { x: 0.32, y: 0.38, width: 0.36, height: 0.20 }
};
export function resolvePrintArea(fractional: Rect, size: Size): Rect
```

Silueta gris (`#8A8A8A` base) + 3–5 elipses con `radialGradient` suaves como pliegues + un gradiente vertical de iluminación. Determinista (sin `Math.random`), para que Playwright pueda muestrear píxeles fijos.

`garment_types.base_mockup_url` acepta el pseudo-esquema `procedural:tee` / `procedural:cap`. El loader ramifica:
```js
base_mockup_url.startsWith('procedural:')
  ? renderProceduralBase(base_mockup_url.slice(11), size)
  : await loadImageFromUrl(base_mockup_url)
```
Cambiar a foto real = `UPDATE garment_types SET base_mockup_url = 'https://.../tee-gray.png'`. Cero código.

### 3.5 Cómo se testea con Playwright sin ser frágil

Tres reglas:
1. **Cero screenshot diffing.** Nada de `toHaveScreenshot()`.
2. **Todas las aserciones son numéricas** y se comparan contra los mismos módulos puros ejecutados en Node.
3. **Red interceptada** con `page.route()` + fixtures. El proyecto `canvas` no necesita Supabase, ni MP, ni cuentas.

`estudio/index.html` publica `window.__studio` **sólo** si `location.search` incluye `debug=1`.

```js
// tests/e2e/canvas.spec.js
import { clampTransformToArea, rotatedAabb } from '../../estudio/lib/geometry.js';
import { blendColorPixel, hexToRgb } from '../../estudio/lib/compose.js';
```

| # | Test | Aserción |
|---|---|---|
| C1 | Carga `/estudio/?debug=1`, espera `window.__studio` | `stage.width() > 0`, la Layer `compose` tiene 4 hijos |
| C2 | Selecciona color `#D02B34`, muestrea el píxel del centro del pecho vía `getImageData` | `≈ blendColorPixel(pixelBaseGris, hexToRgb('#D02B34'))` ±3 por canal |
| C3 | Cambia a `#F0F0EE` y remuestrea | el píxel cambia; `lum` se mantiene ±4 respecto de C2 (la invariante del blend, medida en el navegador real) |
| C4 | Sube `tests/fixtures/logo-transparente.png` con `setInputFiles` | `__studio.getTransform()` ≠ null, `areaCoveragePct` entre 5 y 100 |
| C5 | `__studio.setTransform({x:9999,y:9999,...})`, lee `getTransform()` | deep-equal a `clampTransformToArea(mismo input)` calculado en Node |
| C6 | Arrastra el logo 400 px a la derecha con `mouse.down/move/up` | `rectContains(printArea, rotatedAabb(getTransform()))` === `true` |
| C7 | Rota a 45° vía `setTransform` y arrastra a la esquina | el AABB rotado sigue dentro. Mismo cálculo que el caso unitario #10 de geometry |
| C8 | `await __studio.snapshot()` | `blob.size > 5000`, `blob.type === 'image/png'` |
| C9 | El snapshot **no** contiene los anchors del Transformer | tras `snapshot()`, decodifica el PNG en un canvas y verifica que los píxeles de las esquinas del área del logo no son del color de anchor `#D02B34` puro sólido |
| C10 | **Anti-taint**: `page.route('**/mockup.png', r => r.fulfill({body, headers:{}}))` sin `Access-Control-Allow-Origin` | `snapshot()` **resuelve** igual (porque pasó por `fetch`→blob) |
| C11 | Anti-taint negativo: inyecta `img.src = 'https://otro-dominio/x.png'` directo al canvas | `assertNotTainted` lanza `TaintedCanvasError` con `.code === 'CANVAS_TAINTED'` |
| C12 | `page.on('console')` durante todo el flujo | cero errores en consola |
| C13 | `snapshot({pixelRatio:2})` | el PNG decodificado mide el doble en ambos ejes |
| C14 | Cambiar color 10 veces seguidas | `performance` — el tiempo de la 10ª es < 2× la 1ª (verifica que la memoización funciona) |

---

## 4. Máquina de estados y flujo de pago

### 4.1 Estados

```
                    ┌──────────────── cancelled ◄──────────┐
                    │                                      │
 draft ──► pending_payment ──► paid ──► in_production ──► ready ──► delivered
   │              │  │  │        │                                     │
   │              │  │  └► expired                                     │
   │              │  └────► payment_failed ──┐                         │
   │              │              ▲           │ (reintento)             │
   │              │              └───────────┘                         │
   └──► cancelled │                                                    │
                  └► paid                        refunded ◄────────────┘
                                                    ▲
                                                    └──── paid
```

`TRANSITIONS`:
```js
draft:            ['pending_payment','cancelled','expired']
pending_payment:  ['paid','payment_failed','expired','cancelled']
payment_failed:   ['pending_payment','paid','cancelled','expired']
paid:             ['in_production','refunded','cancelled']
in_production:    ['ready','cancelled','refunded']
ready:            ['delivered','cancelled','refunded']
delivered:        ['refunded']
cancelled: []   refunded: []   expired: []
```
Sin auto-bucles: `canTransition(x,x) === false` para todo `x`. Ese detalle es lo que convierte el `UPDATE` guardado en una operación naturalmente idempotente.

### 4.2 Diseño de idempotencia

**Una sola cerradura: la constraint `UNIQUE (provider, payment_id, payment_status)` de `payment_events`.** No hay locks aplicativos, ni `Map`, ni advisory locks. La gana quien logre el `INSERT`.

`api/_lib/settle.js`:

```js
export async function settleOrder(opts: {
  order: OrderRow, payment: MpPayment, source: 'webhook'|'reconcile'
}): Promise<{ settled:boolean, reason:string, from:string, to:string, effects:string[] }>
```

```
┌ 1. INSERT INTO payment_events (provider, payment_id, payment_status, order_id, source, raw)
│    VALUES (...) ON CONFLICT (provider, payment_id, payment_status) DO NOTHING
│    RETURNING id
│
│    sin fila ⇒ ESTE (payment_id, status) YA FUE PROCESADO
│              ⇒ return { settled:false, reason:'DUPLICATE' }  →  HTTP 200
│
├ 2. target = nextStateForPayment(payment.status)      // lanza si MP inventa un status
│    allowed = allowedFromStatesFor(target)
│
├ 3. UPDATE orders
│      SET status = $target, mp_payment_id = $pid, mp_payment_status = $s,
│          paid_at = CASE WHEN $target='paid' THEN now() ELSE paid_at END,
│          updated_at = now()
│    WHERE id = $orderId AND status = ANY($allowed)
│    RETURNING id, (SELECT status FROM orders WHERE id=$orderId) AS prev
│
│    sin fila ⇒ el pedido ya no estaba en un estado válido (otra ruta ganó,
│               o el admin lo movió a mano)
│             ⇒ UPDATE payment_events SET processed_at=now(), skip_reason='STATE_NOT_ALLOWED'
│             ⇒ return { settled:false, reason:'STATE_NOT_ALLOWED' }  →  HTTP 200
│
├ 4. effects = sideEffectsFor(prev, target)
│    for (e of effects)  await sendX(...)   // nunca lanza; devuelve boolean; escribe en email_log
│
└ 5. UPDATE payment_events SET processed_at = now() WHERE id = $eventId
     return { settled:true, from:prev, to:target, effects }
```

Notas de diseño derivadas de los errores del proyecto de referencia:

- **Idempotencia real**: el paso 1 es la cerradura. Un reintento de MP con el mismo `(payment_id, status)` cae en `DO NOTHING` → 200 sin efectos. Un cambio legítimo de estado (`pending` → `approved`) sí entra, porque `payment_status` forma parte de la clave.
- **Doble candado**: incluso si dos instancias pasaran el paso 1 simultáneamente (imposible con la UNIQUE, pero por si acaso), el `UPDATE ... WHERE status = ANY(allowed)` sólo devuelve fila a una. Los correos van después del UPDATE ganador.
- **Nada de `MP_TEST_MODE`**: `verifySignature` siempre corre. Si `MP_WEBHOOK_SECRET` falta, `webhook-mp.js` responde **503** y loguea `SECRET_MISSING`. Nunca 200-con-bypass.
- **Anti-replay**: ventana de ±300 s sobre `ts`, evaluada antes de calcular el HMAC.
- **Rate limit en Postgres**, no en memoria (§5, `rpc_rate_limit_hit`).
- **Un solo camino para el efecto**: webhook y reconcile llaman a `settleOrder`. No compiten; comparten cerradura.

### 4.3 Las dos carreras

**Caso A — el webhook llega antes que el navegador** (lo normal):
1. `POST /api/webhook-mp` → firma OK → `GET /v1/payments/{id}` → `settleOrder` gana → `paid`, correos enviados → 200.
2. El navegador aterriza en `/estudio/gracias/?t=<token>&payment_id=...&status=approved`.
3. La página llama `GET /api/order-status?token=...` → ya es `paid` → muestra confirmación. **No llama a `/api/reconcile`.**

**Caso B — el navegador llega antes que el webhook** (MP a veces tarda minutos):
1. `/estudio/gracias/` consulta `order-status` → sigue `pending_payment`.
2. Como la query trae `payment_id`, llama `POST /api/reconcile {token, payment_id}`.
3. `reconcile.js`:
   - Busca el pedido por `public_token` (uuid v4, no enumerable).
   - **Re-consulta `GET https://api.mercadopago.com/v1/payments/{payment_id}` con el Bearer.** Nunca cree al query string.
   - Verifica `payment.external_reference === order.id`. Ésta es la autorización que sustituye a la firma: sin ella, un atacante con un `payment_id` ajeno no puede marcar tu pedido.
   - Llama `settleOrder(..., source:'reconcile')`.
4. Minutos después llega el webhook → paso 1 → `DUPLICATE` → 200, **cero correos duplicados**.

**Caso C — el webhook llega dos veces** (reintento de MP): segundo `DUPLICATE`, 200.

**Caso D — el navegador recarga `/gracias/` 5 veces**: `reconcile` es idempotente por la misma vía; además está rate-limitado por `public_token` (10 req / 5 min).

**Caso E — el webhook nunca llega y el usuario cerró la pestaña**: el pedido queda en `pending_payment`. El panel de admin muestra un botón "Reconciliar con MP" que dispara `reconcile` con el `preference_id`. Y `orders.expires_at = created_at + 24h` permite un barrido manual a `expired`.

**Caso F — la function muere entre el paso 4 (correos) y el 5**: el evento ya existe → los reintentos no repiten. El `email_log` no tiene fila. El panel muestra el pedido con la insignia "correo pendiente" y un botón "Reenviar". Preferido sobre un cron (Hobby limita crons a diarios).

### 4.4 Handlers

```js
// api/webhook-mp.js  — responde SIEMPRE < 3 s
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) { logError('webhook', 'SECRET_MISSING'); return json(res, 503, { error: 'NOT_CONFIGURED' }); }

  const dataId = String(req.body?.data?.id ?? req.query['data.id'] ?? '');
  const v = verifySignature({
    header: req.headers['x-signature'],
    requestId: req.headers['x-request-id'],
    dataId, secret, nowMs: Date.now(), toleranceMs: 300_000
  });
  if (!v.valid) { logError('webhook', v.reason); return json(res, 401, { error: 'INVALID_SIGNATURE' }); }

  const payment = await mpGetPayment(dataId);            // NUNCA se cree el body
  const order = await findOrderByExternalReference(payment.external_reference);
  if (!order) return json(res, 200, { ok: true, reason: 'ORDER_NOT_FOUND' });  // 200: no queremos reintentos

  const r = await settleOrder({ order, payment, source: 'webhook' });
  return json(res, 200, { ok: true, ...r });
}
```

Responder **200 también en `DUPLICATE`, `STATE_NOT_ALLOWED` y `ORDER_NOT_FOUND`**: un 4xx/5xx provoca reintentos de MP que no sirven de nada. Sólo 401 (firma) y 503 (no configurado) son no-200.

---

## 5. Esquema SQL y RLS

### 5.1 Tablas

```sql
-- 0001_schema.sql
create extension if not exists pgcrypto;

create table public.garment_types (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,               -- 'playera-cuello-redondo' | 'gorra-trucker'
  name            text not null,
  base_mockup_url text not null,                      -- 'procedural:tee' o URL pública
  print_area      jsonb not null,                     -- {x,y,width,height} en fracciones 0..1
  canvas_size     jsonb not null default '{"width":900,"height":900}',
  allowed_sizes   text[] not null default '{S,M,L,XL,XXL}',
  min_qty         int  not null default 12,
  max_qty         int  not null default 1000,
  sort_order      int  not null default 0,
  is_active       bool not null default true,
  created_at      timestamptz not null default now()
);

create table public.garment_variants (
  id               uuid primary key default gen_random_uuid(),
  garment_type_id  uuid not null references public.garment_types(id) on delete cascade,
  color_hex        text not null check (color_hex ~ '^#[0-9A-F]{6}$'),
  color_name       text not null,
  sort_order       int  not null default 0,
  is_active        bool not null default true,
  unique (garment_type_id, color_hex)
);

create table public.print_techniques (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,                    -- 'dtf' | 'bordado' | 'sublimacion'
  name       text not null,
  notes      text,
  sort_order int not null default 0,
  is_active  bool not null default true
);

create table public.pricing_rules (                   -- ⚠ NUNCA visible con anon key
  id                        uuid primary key default gen_random_uuid(),
  garment_type_id           uuid not null references public.garment_types(id) on delete cascade,
  technique_id              uuid not null references public.print_techniques(id) on delete cascade,
  tiers                     jsonb not null,           -- [{min_qty,max_qty,unit_price_cents}]
  technique_surcharge_cents int  not null default 0,
  size_surcharges_cents     jsonb not null default '{}',
  currency                  text not null default 'MXN',
  is_placeholder            bool not null default true,   -- ← el candado
  updated_at                timestamptz not null default now(),
  unique (garment_type_id, technique_id)
);

create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  name       text not null,
  phone      text,
  created_at timestamptz not null default now()
);
create unique index customers_email_lower on public.customers (lower(email));

create type public.order_status as enum (
  'draft','pending_payment','paid','payment_failed',
  'in_production','ready','delivered','cancelled','refunded','expired'
);

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  public_token      uuid not null default gen_random_uuid(),
  short_code        text not null,                     -- 'GK-4F2A9C' para humanos
  customer_id       uuid not null references public.customers(id),
  status            public.order_status not null default 'draft',
  currency          text not null default 'MXN',
  total_cents       int  not null,
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
create unique index orders_public_token on public.orders (public_token);
create unique index orders_short_code   on public.orders (short_code);
create index orders_status_created      on public.orders (status, created_at desc);
create unique index orders_mp_payment_id on public.orders (mp_payment_id) where mp_payment_id is not null;

create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  item_index          int  not null,
  garment_type_id     uuid not null references public.garment_types(id),
  garment_variant_id  uuid not null references public.garment_variants(id),
  technique_id        uuid not null references public.print_techniques(id),
  size_breakdown      jsonb not null,                  -- {"S":2,"M":4,"L":6}
  qty                 int  not null,
  logo_object_path    text not null,                   -- 'logos/2026/09/.../x.png'
  preview_object_path text not null,                   -- 'previews/...'
  logo_transform      jsonb not null,                  -- {x,y,scaleX,scaleY,rotation}
  unit_price_cents    int  not null,
  subtotal_cents      int  not null,
  pricing_snapshot    jsonb not null,                  -- el Quote entero, congelado
  created_at          timestamptz not null default now(),
  unique (order_id, item_index)
);

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
  constraint payment_events_idem unique (provider, payment_id, payment_status)   -- ← LA CERRADURA
);

create table public.email_log (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid references public.orders(id) on delete cascade,
  kind       text not null,               -- 'customer_paid' | 'admin_new_order' | ...
  to_email   text not null,
  provider_id text,
  ok         bool not null,
  error_snippet text,                     -- ≤ 500 chars, jamás la API key
  created_at timestamptz not null default now()
);
create unique index email_log_once on public.email_log (order_id, kind) where ok = true;

create table public.admin_users (
  user_id    uuid primary key,            -- = auth.users.id
  email      text not null,
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  bucket     text primary key,            -- 'reconcile:<token>' | 'upload:<ip>'
  hits       int  not null default 0,
  window_start timestamptz not null default now()
);
```

`email_log_once` (índice único parcial donde `ok = true`) es una **segunda red de seguridad** contra correos duplicados, independiente de `payment_events`.

### 5.2 Funciones

```sql
-- 0002_functions.sql
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.rpc_rate_limit_hit(
  p_bucket text, p_window_seconds int, p_max_hits int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_hits int;
begin
  insert into public.rate_limits (bucket, hits, window_start)
  values (p_bucket, 1, now())
  on conflict (bucket) do update set
    hits = case when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                then 1 else public.rate_limits.hits + 1 end,
    window_start = case when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                        then now() else public.rate_limits.window_start end
  returning hits into v_hits;
  return v_hits <= p_max_hits;     -- true = permitido
end $$;
revoke execute on function public.rpc_rate_limit_hit(text,int,int) from anon, authenticated;
```

Atómico y compartido entre instancias — el opuesto exacto del `Map` en memoria.

### 5.3 RLS: qué se lee con anon key y qué no

RLS habilitado en **todas** las tablas. Sin política ⇒ denegado para `anon`/`authenticated`; `service_role` salta RLS por definición.

| Tabla | `anon` (navegador, catálogo) | `authenticated` no-admin | admin (`is_admin()`) | `service_role` (functions) |
|---|---|---|---|---|
| `garment_types` | **SELECT** `WHERE is_active` | igual | ALL | ALL |
| `garment_variants` | **SELECT** `WHERE is_active` | igual | ALL | ALL |
| `print_techniques` | **SELECT** `WHERE is_active` | igual | ALL | ALL |
| `pricing_rules` | ✖ **sin política** | ✖ | SELECT + UPDATE | ALL |
| `customers` | ✖ | ✖ | SELECT | ALL |
| `orders` | ✖ | ✖ | SELECT + UPDATE | ALL |
| `order_items` | ✖ | ✖ | SELECT | ALL |
| `payment_events` | ✖ | ✖ | SELECT | ALL |
| `email_log` | ✖ | ✖ | SELECT | ALL |
| `admin_users` | ✖ | ✖ | SELECT propio | ALL |
| `rate_limits` | ✖ | ✖ | ✖ | ALL |

```sql
-- 0003_rls.sql
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

-- Catálogo: lectura pública de lo activo
create policy catalog_read_types    on public.garment_types
  for select to anon, authenticated using (is_active);
create policy catalog_read_variants on public.garment_variants
  for select to anon, authenticated using (
    is_active and exists (select 1 from public.garment_types g
                          where g.id = garment_type_id and g.is_active));
create policy catalog_read_techs    on public.print_techniques
  for select to anon, authenticated using (is_active);

-- Escritura de catálogo: sólo admin
create policy catalog_write_types on public.garment_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- (ídem variants, techniques)

-- Precios: NINGUNA política para anon. Sólo admin autenticado.
create policy pricing_admin on public.pricing_rules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Pedidos: sólo admin lee/actualiza desde el navegador.
create policy orders_admin_read   on public.orders
  for select to authenticated using (public.is_admin());
create policy orders_admin_update on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy items_admin_read    on public.order_items
  for select to authenticated using (public.is_admin());
create policy events_admin_read   on public.payment_events
  for select to authenticated using (public.is_admin());
create policy emails_admin_read   on public.email_log
  for select to authenticated using (public.is_admin());
create policy customers_admin_read on public.customers
  for select to authenticated using (public.is_admin());
create policy admin_self on public.admin_users
  for select to authenticated using (user_id = auth.uid());
-- rate_limits: sin política. service_role only.
```

**Razonamiento explícito de la frontera:**
- El **catálogo** (formas, colores, técnicas, `print_area`) es público por necesidad: el canvas lo necesita antes de cualquier interacción, y no revela nada sensible.
- Los **precios nunca** salen con anon key. El navegador conoce precios sólo a través de `POST /api/quote`, que los calcula con `service_role`. Esto hace estructuralmente imposible que el cliente manipule el total: `checkout.js` **re-cotiza desde la BD e ignora cualquier cifra del cliente**.
- Los **pedidos** no tienen política anon. El seguimiento del cliente pasa por `GET /api/order-status?token=<public_token>` (service_role, vista redactada: sin `logo_object_path`, sin `mp_payment_id`, sin `pricing_snapshot`).
- El **panel de admin** lee `orders` directo con anon key + el JWT de la sesión del admin, gracias a `is_admin()`. Menos código de API, y la política vive en la BD donde no se puede olvidar.

### 5.4 Storage

```sql
-- 0004_storage.sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('mockups',  'mockups',  true,   5242880, array['image/png','image/jpeg','image/webp']),
  ('logos',    'logos',    false,  8388608, array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('previews', 'previews', false,  4194304, array['image/png','image/jpeg'])
on conflict (id) do nothing;

-- mockups: lectura pública
create policy mockups_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'mockups');
-- logos y previews: ninguna política ⇒ sólo service_role.
-- Subida del cliente: URL firmada emitida por /api/upload-url.
-- Lectura del admin y de los correos: URL firmada emitida por el servidor.
```

---

## 6. Orden de construcción

Cada incremento es un commit. Regla TDD para el modelo ejecutor, escrita al inicio del plan:

> 1. Escribe **el archivo de test completo** con los casos de la tabla del §2, todos. 2. Corre `npm test` y **pega la salida en rojo**. 3. Escribe la implementación mínima. 4. Corre `npm test` y pega la salida en verde. 5. Refactoriza sin tocar los tests. **Si el paso 2 pasa en verde, el test está mal: arréglalo antes de seguir.**

| # | Incremento | Entrega | Criterio de "hecho" observable |
|---|---|---|---|
| **0** | Andamio | `package.json`, `vitest.config.js`, `playwright.config.js`, `.vercelignore`, `.gitignore`, `vercel.json` parcheado, `.env.example` | `npm test` → `No test files found, exiting with code 1`, con `include: tests/unit/**/*.test.js` impreso: confirma que el glob resuelve. **Exit 1 es lo correcto aquí y NO se silencia con `passWithNoTests`** — enmascararía un glob roto más adelante. El primer verde llega en el incremento 1. Deploy preview: `curl -sI <preview>/` → 200 y el html byte-idéntico a producción. `curl -sI <preview>/tests/unit/x.js` → 404. Log de build de Vercel: **sin** paso "Building" |
| **1** | `errors.js`, `format.js`, `color.js` | + `tests/unit/color.test.js` | 21 casos verdes. `npm test` < 3 s |
| **2** | `geometry.js` | + `tests/unit/geometry.test.js` | 26 casos verdes, incluidos los dos property tests de idempotencia e invariante |
| **3** | `compose.js` | + `tests/unit/compose.test.js` | 20 casos verdes, incluida la invariante `lum(blend(cb,cs)) ≈ lum(cb)` con 100 pares |
| **4** | `sizes.js` + `pricing.js` + `order-draft.js` | + 3 test files | 17 + 29 + 11 casos verdes. `assertChargeable` bloquea placeholder en modo live |
| **5** | Migraciones Supabase vía MCP + seed | `supabase/migrations/000{1..4}.sql`, `seed/0001` | `curl "$SB/rest/v1/garment_types?select=*" -H "apikey:$ANON"` → 2 filas. `curl ".../pricing_rules?select=*" -H "apikey:$ANON"` → `[]`. Mismo query con service_role → 6 filas, todas `is_placeholder=true` |
| **6** | `api/_lib/{env,log,http,validation,supabase,storage-paths}.js` + `api/catalog.js` + `api/upload-url.js` | + 3 test files | 9+13+13 casos verdes. `curl <preview>/api/catalog` → JSON con `garment_types[].print_area`. `curl -X POST /api/upload-url -d '{"kind":"logo","filename":"x.png","size":1000,"mime":"image/png"}'` → `{signedUrl, path}`; un `PUT` a ese `signedUrl` con el PNG de fixture → 200 |
| **7** | `estudio/index.html` + `boot.js` + `studio.css` + `canvas/{mockup,image-loader,garment-painter,konva-adapter,snapshot}.js` | + `tests/e2e/canvas.spec.js` | `npx playwright test --project=canvas` → C1..C3, C8, C10..C13 verdes. Visualmente: playera gris teñida de rojo Grafik, sin logo |
| **8** | `ui/*.js`: subida de logo, Transformer, clamping, paneles de tallas y resumen | + `tests/e2e/studio-flow.spec.js`, C4..C7, C9, C14 | Flujo completo hasta "ver precio": sube logo → arrastra → rota → escoge tallas → `/api/quote` devuelve total. Todos los `@canvas` verdes. Consola limpia |
| **9** | `api/_lib/mp-preference.js` + `mp-client.js` + `api/quote.js` + `api/checkout.js` | + `tests/unit/mp-preference.test.js` | 20 casos verdes. `POST /api/checkout` con el draft de fixture → `{init_point}`; abrir ese `init_point` muestra el checkout de MP en modo TEST con el monto correcto. La fila de `orders` queda en `pending_payment` |
| **10** | `mp-signature.js` + `order-state.js` + `settle.js` + `api/webhook-mp.js` + `api/reconcile.js` + `api/order-status.js` | + 2 test files + `tests/helpers/mp-sign.js` | 24 + 23 casos verdes. **Prueba de idempotencia manual**: `curl` el mismo webhook firmado 3 veces → `select count(*) from payment_events` = **1**, `orders.status` = `paid`, primera respuesta `settled:true`, siguientes `reason:'DUPLICATE'`. Webhook con `ts` de hace 10 min → **401**. Con `MP_WEBHOOK_SECRET` borrado → **503** |
| **11** | `email-templates.js` + `email.js` + adjunto del snapshot | + `tests/unit/email-templates.test.js` | 20 casos verdes. Pago TEST real → llegan 2 correos (cliente + admin) con el PNG del preview adjunto. `select count(*) from email_log where ok` = 2. Repetir el webhook → sigue en 2 |
| **12** | `estudio/admin/` + `admin-auth.js` + `api/admin/*` | + `tests/e2e/admin.spec.js` `@live` | Login con el admin → lista de pedidos. Cambiar `paid`→`in_production` → correo al cliente. Login con un usuario **no** en `admin_users` → la tabla sale vacía (RLS, no un `if` en JS) |
| **13** | Endurecimiento | `ratelimit.js` conectado, botón "reenviar correo", botón "reconciliar", `api/admin/pricing.js`, precios reales | `for i in {1..15}; do curl -X POST /api/reconcile ...; done` → los últimos 5 dan **429**. Con `is_placeholder=false` en todas las reglas y token `APP_USR-`, `/api/checkout` funciona; con alguna en `true`, devuelve **409 `PLACEHOLDER_PRICING_IN_LIVE_MODE`** |

Dependencias: 1→2→3 son independientes entre sí salvo que 3 usa `color.js`. 5 se puede hacer en paralelo a 1–4. 7 necesita 2, 3 y 6. 10 necesita 9. 11 necesita 10.

---

## 7. Riesgos concretos y mitigación

### 7.1 Añadir `package.json` y `api/` sin cambiar cómo Vercel despliega el sitio (riesgo ALTO)

**Qué puede salir mal:** hoy el proyecto no tiene `package.json`, así que Vercel salta el build y sirve la raíz. Al añadir uno, el auto-detect puede cambiar de opinión: intentar un build que no existe, instalar `vitest`+`@playwright/test` en cada deploy (el postinstall de Playwright descarga navegadores, ~1–2 min y puede fallar), o —lo peor— si alguien crea un `public/` el output dir salta a `public` y el sitio devuelve 404 entero.

**Mitigación (todo explícito en `vercel.json`, nada delegado al auto-detect):**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": "",
  "installCommand": "npm install --omit=dev --no-audit --no-fund",
  "outputDirectory": ".",
  "functions": { "api/**/*.js": { "maxDuration": 20, "memory": 1024 } },
  ↑ AÑADIR EN EL INCREMENTO 6, NO ANTES. Un patrón de `functions` que no hace
    match con ninguna función puede abortar el deploy, y `api/` no existe hasta
    el incremento 6. En el incremento 0 esta clave se omite.
  "headers": [
    { "source": "/(.*)", "headers": [ ...los 4 actuales, sin tocar... ] },
    { "source": "/estudio", "headers": [
      { "key": "X-Robots-Tag", "value": "noindex, nofollow, noarchive, nosnippet" } ] },
    { "source": "/estudio/(.*)", "headers": [
      { "key": "X-Robots-Tag", "value": "noindex, nofollow, noarchive, nosnippet" },
      { "key": "Cache-Control", "value": "no-store" } ] },
    { "source": "/api/(.*)", "headers": [
      { "key": "Cache-Control", "value": "no-store" },
      { "key": "X-Robots-Tag", "value": "noindex" } ] }
  ]
}
```

- `installCommand` con `--omit=dev` instala **cero** paquetes (no hay `dependencies`) y ni roza a Playwright.
- `buildCommand: ""` salta el build ([Skip Build Step](https://vercel.com/docs/builds/configure-a-build#skip-build-step)).
- `outputDirectory: "."` fija la raíz aunque alguien cree `public/` por error.
- **Regla escrita en el plan: PROHIBIDO crear `public/` en la raíz.**
- `package.json` sin clave `dependencies` en absoluto, `"private": true`, `"type": "module"`, `"engines": {"node": "22.x"}`, y sin script `build` ni `vercel-build`.

**Verificación antes de tocar producción:** desplegar a un **preview** (`git push` a una rama, nunca a `main`), y comprobar en el preview: `/` 200 e idéntico, `/api/catalog` 200, `/estudio/` 200, `/tests/...` 404. Sólo después, merge.

### 7.2 Binarios y tamaño del body (riesgo MEDIO)

**Corrección al hecho de plataforma:** Vercel ya acepta bodies de hasta **100 MB** en Functions (Fluid Compute), no 4.5 MB. Así que el límite **no** es lo que fuerza el diseño. Se mantiene igual por razones mejores:

- **Base64 infla un 33%** — mandar un PNG de 6 MB dentro de un JSON son 8 MB de transferencia por una ruta que además paga CPU activa mientras lo parsea.
- **Doble transferencia**: cliente → function → Storage cuesta el doble de ancho de banda que cliente → Storage.
- **Storage valida mejor**: `file_size_limit` y `allowed_mime_types` del bucket son una defensa que no depende de que nuestro código acierte.
- **Functions rápidas y baratas**: ninguna function se queda ocupada moviendo megabytes.

**Regla: ningún binario cruza `api/*`.**
1. El cliente pide `POST /api/upload-url {kind, filename, size, mime}` (body ~200 bytes). El servidor valida mime y tamaño con `storage-paths.js` y firma con `POST /storage/v1/object/upload/sign/{bucket}/{path}`.
2. El cliente hace `PUT` del binario **directo a Supabase Storage** con el token. Vercel ni se entera.
3. `POST /api/checkout` sólo lleva **paths** (strings). Body típico: < 4 KB.

Defensas adicionales:
- `readJsonBody(req, { maxBytes: 262144 })` en todos los handlers: 256 KB duro, error `PAYLOAD_TOO_LARGE` propio antes de parsear.
- Snapshot en cliente: `pixelRatio` calculado para que el lado mayor no pase de **1400 px**; si el PNG resultante supera 2 MB, reintenta en `image/jpeg` calidad 0.88. Función pura testeable: `pickSnapshotEncoding(estimatedBytes) → {mimeType, quality, pixelRatio}`.
- Logo: rechazo en cliente **y** en servidor con el mismo `MAX_LOGO_BYTES = 8 MB`, más el `file_size_limit` del bucket como tercera red.
- Para el adjunto de Resend: el servidor **descarga** el preview de Storage (no lo recibe). Si supera 3 MB, cae a `<img src="{signedUrl 7d}">` en lugar de adjunto.

### 7.3 Canvas contaminado y `toDataURL` (riesgo ALTO — es el que rompe el snapshot)

**Mitigación**: la regla del §3.3. `img.src` sólo recibe `blob:` o `data:`. Todo lo remoto pasa por `fetch → blob → URL.createObjectURL`. Con eso, CORS deja de poder contaminar el canvas. Reforzado por:
- `assertNotTainted()` antes de exportar, con error tipado y accionable.
- Test C10 en Playwright: una ruta interceptada que **quita** `Access-Control-Allow-Origin` y aun así el snapshot funciona.
- Test C11: el camino prohibido (`img.src = urlRemota`) produce `TaintedCanvasError`, documentando por qué existe la regla.
- Un `eslint`-menos: un test unitario que hace `grep` del directorio `estudio/canvas/` buscando `\.src\s*=` y falla si el valor no proviene de `createObjectURL` o no empieza por `'data:'`. Barato y pilla la regresión.

### 7.4 Konva desde CDN: SRI y disponibilidad (riesgo MEDIO)

- URL exacta, ya verificada (189 906 bytes, HTTP 200): `https://cdnjs.cloudflare.com/ajax/libs/konva/10.3.3/konva.min.js`, mismo host que React/Babel ya usados.
- Hash SRI ya calculado: `sha384-mx78e7xNAuhEWxGDQZNlR9oNI6vtKvQUNiPZcntBLQhJHcPXNI+AzxLdTSWqoUyX`. **Usar esta versión exacta**, nunca un rango. Para recalcular: `curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A`.
- `crossorigin="anonymous"` obligatorio para que SRI funcione en cross-origin. cdnjs envía `Access-Control-Allow-Origin: *`.
- `crossorigin` en el `<script>` **no** tiene relación con el tainting de canvas (eso es de imágenes). No confundir los dos temas.
- Riesgo de caída de cdnjs: `boot.js` verifica `typeof window.Konva === 'undefined'` tras `DOMContentLoaded` y, si falta, pinta un aviso "el configurador no está disponible, escríbenos por WhatsApp" con el link de `CONFIG.whatsapp`. Mejor que un canvas en blanco.
- Riesgo de CSP: el sitio hoy no tiene `Content-Security-Policy`. **No añadir una** en este trabajo: `babel-standalone` exige `unsafe-eval` y sería un cambio de alcance que puede romper `index.html`. Anotarlo como deuda.
- `supabase-js` desde CDN sólo en `/estudio/admin/`, también con SRI y versión fija. El configurador público **no** carga supabase-js: no lo necesita (catálogo vía `/api/catalog`, subidas vía URL firmada).

### 7.5 El blend `color` no se aplica entre Layers de Konva (riesgo MEDIO, silencioso)

Se ve bien en pantalla por accidente en algunos navegadores y sale mal en el snapshot, o al revés. **Mitigación**: el §3.1 — una sola Layer `compose` para todo lo que mezcla, `ui` sólo para el Transformer, snapshot desde `composeLayer.toDataURL()`. El test C2 mide el píxel real y lo compara contra `blendColorPixel`; si alguien mete la gco en otra Layer, C2 se pone rojo de inmediato.

Riesgo gemelo: multiplicar el foldMap sobre **toda** la prenda la oscurece el doble. Mitigado por el `Konva.Group` con `clip = printArea` + `normalizeFoldMapPixels` (multiplicativo contra el percentil 0.9, no la media), ambos con test unitario.

### 7.6 `auto_return` rechazado por MP con back_urls no-HTTPS (riesgo MEDIO)

**Mitigación**: `buildPreferenceBody` **omite la clave `auto_return` por completo** cuando `baseUrl` no es https (test #8), y lanza `MpConfigError` si se pide explícitamente. `baseUrl` se resuelve así:
```js
PUBLIC_BASE_URL || (VERCEL_ENV === 'production' ? 'https://grafik.mx' : `https://${VERCEL_URL}`)
```
`VERCEL_URL` no incluye el esquema, hay que anteponer `https://` a mano — es un error clásico. Test que lo cubre: `resolveBaseUrl({VERCEL_URL:'x.vercel.app'})` → `'https://x.vercel.app'`.

En `vercel dev` local, `PUBLIC_BASE_URL` queda sin definir → `http://localhost:3000` → sin `auto_return`, el checkout de MP funciona igual (el usuario vuelve haciendo clic).

### 7.7 Correos duplicados o perdidos (riesgo MEDIO)

Tres capas independientes: `payment_events` UNIQUE, el `UPDATE` guardado por estado, y el índice parcial `email_log_once`. `sendXEmail()` **nunca lanza** y devuelve boolean; un fallo de Resend deja `email_log.ok=false` y no toca el estado del pedido. El panel muestra "correo pendiente" con botón de reenvío manual — sin dependencia de crons (Hobby los limita a diarios).

Incógnita real: **`attachments` de Resend con base64 no está verificado**. Se prueba en el incremento 11 con un envío real. Si falla, el fallback (URL firmada a 7 días embebida como `<img>`) ya está escrito y se activa con `EMAIL_ATTACH_PREVIEW=0`. El incremento no se marca hecho hasta que uno de los dos caminos entregue el preview.

### 7.8 Secretos y superficie de ataque (riesgo MEDIO)

- `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `RESEND_API_KEY` **sólo** en Vercel env, scope Production+Preview, nunca en `.env` versionado. `.env*` en `.gitignore` y en `.vercelignore`.
- `log.js` redacta: cualquier valor que coincida con `/^(TEST-|APP_USR-|re_|eyJ|sb[ps]_)/` se sustituye por `'[REDACTED]'` antes de imprimir. Test unitario que lo verifica con las 5 formas de clave.
- `api/admin/*` verifica el JWT contra `GET /auth/v1/user` con el anon key y comprueba `admin_users`. Doble control: RLS en la BD **y** chequeo en la function.
- Enumeración: `public_token` es uuid v4 (122 bits). `short_code` es sólo para mostrar, nunca sirve como credencial.
- `/api/upload-url` es el endpoint abierto más expuesto → rate limit por IP (30 / 10 min) vía `rpc_rate_limit_hit`, más el `file_size_limit` y `allowed_mime_types` del bucket.

### 7.10 Deployment Protection bloquea el webhook de Mercado Pago en previews (riesgo ALTO, descubierto en el incremento 0)

**Hecho verificado**, no teórico. El proyecto `publicidad` tiene Vercel Deployment Protection activa: en el preview de la rama `feat/configurador-estudio`, **todas** las rutas —incluida `/`— devuelven `302` a `https://vercel.com/sso-api`. Comprobado con `curl` y con la herramienta autenticada del MCP de Vercel; ambos rebotan.

Consecuencia en el incremento 10: **los servidores de Mercado Pago no pueden entregar el webhook a una URL de preview.** Recibirían el 302 al SSO, nunca llegarían a `/api/webhook-mp`, y el pedido se quedaría en `pending_payment` para siempre. Es exactamente el fallo que ya se documentó en el proyecto Lial, donde los `walletUrl` de los correos apuntaban a un preview y rebotaban al SSO de Vercel.

Aplica igual a cualquier callback entrante: el webhook de MP y las `back_urls` si el cliente aterriza en un preview.

**Hay que decidir antes del incremento 10.** Opciones, de menos a más invasiva:

| Opción | Qué implica |
|---|---|
| **Probar el webhook en local con `vercel dev` + un túnel** (ngrok/cloudflared) y apuntar `MP_WEBHOOK_URL` ahí | Cero cambios de configuración en Vercel. Es el camino recomendado para el desarrollo del incremento 10: la variable `MP_WEBHOOK_URL` existe precisamente para esto (§5 de env vars) |
| **Desactivar la protección sólo para previews** (Project → Deployment Protection → Vercel Authentication → Standard/Disabled para preview) | Simple, pero expone todos los previews del sitio a cualquiera con la URL |
| **Protection Bypass for Automation** (header `x-vercel-protection-bypass`) | No sirve para MP: no vamos a poder hacer que Mercado Pago mande un header propietario |
| **Probar sólo contra producción** tras hacer merge, con `/estudio/` ya oculta por `noindex` | Funciona, pero significa depurar pagos en producción — mala idea antes de tener la idempotencia probada |

**Nota para el incremento 0:** esta protección es también la razón por la que el criterio de "`/tests/...` → 404" **no** se puede verificar con `curl` anónimo. Se verifica con el **build log**, que es evidencia más fuerte: busca la línea `Found .vercelignore` seguida de `Removed N ignored files` y la lista. En el deploy `dpl_JCBjvTp7T32acCWG7qMh1ZC1QRLA` removió los 12 esperados (spec, `CLAUDE.md`, ambos configs de test, `.env.example`, `tests/unit/color.test.js`, `.md` y capturas), y `Build Completed in /vercel/output [70ms]` confirma que no corrió build ni instaló devDependencies.

### 7.9 Riesgos menores anotados

| Riesgo | Mitigación |
|---|---|
| SVG como logo = vector de XSS al renderizarlo en `<img>` | Los SVG se rasterizan en el canvas (un `<img>` con SVG no ejecuta scripts) y **nunca** se inyectan como markup. En el correo del admin sólo va el PNG del preview, jamás el SVG original |
| `styles.css` crece y el sitio principal se ralentiza | `studio.css` es un archivo aparte. `styles.css` **no se modifica**; `/estudio/` lo importa sólo por los tokens `:root` |
| Babel-standalone compila el JSX del estudio en runtime (lento en móvil) | Aceptado: el estudio es una ruta escondida, no compite por Core Web Vitals. Se muestra un skeleton mientras compila |
| Reloj desfasado en serverless rompe la ventana anti-replay | 300 s de tolerancia (5 min) absorbe cualquier skew real. `nowMs` se inyecta como parámetro, así que el test lo controla |
| MP inventa un `status` nuevo | `nextStateForPayment` lanza `UNKNOWN_MP_STATUS`; el handler responde 200 y loguea. El pedido no cambia. Ruidoso en logs, seguro en datos |
| Un modelo pequeño "arregla" un test en rojo cambiando el test | Instrucción explícita en el plan + los tests estructurales (§2.10 casos 1–3) y las property tests hacen difícil trampear sin que se note |

---

## Archivos críticos para la implementación

- `/Users/aguerrerogar/Documents/proyectos desarrollo propio/Grafik/vercel.json` — el único archivo existente que hay que modificar; de él depende que el sitio actual siga sirviéndose igual al añadir `package.json` y `api/`
- `/Users/aguerrerogar/Documents/proyectos desarrollo propio/Grafik/estudio/lib/geometry.js` — el clamp con rotación es la pieza con más casos límite y de la que dependen el canvas, el snapshot y la validez del pedido
- `/Users/aguerrerogar/Documents/proyectos desarrollo propio/Grafik/estudio/canvas/konva-adapter.js` — único punto de contacto con Konva; define la topología de una sola Layer que hace funcionar el blend y el snapshot
- `/Users/aguerrerogar/Documents/proyectos desarrollo propio/Grafik/api/_lib/settle.js` — concentra toda la idempotencia; webhook y reconcile no tienen lógica propia
- `/Users/aguerrerogar/Documents/proyectos desarrollo propio/Grafik/supabase/migrations/0003_rls.sql` — la frontera de seguridad real: qué ve el navegador y qué no
- `/Users/aguerrerogar/Documents/proyectos desarrollo propio/Grafik/CLAUDE.md` — hay que añadirle una sección `/estudio/` para que futuras sesiones no rompan las reglas anti-taint y de Layer única