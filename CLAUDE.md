# CLAUDE.md

Sitio standalone de una sola página para servicios de **imprenta y publicidad en CDMX**. Sin build step, sin npm — React 18 + Babel desde CDN, CSS compartido en `styles.css`.

## Correr localmente

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

## Arquitectura

Una sola página (`index.html`) con React 18 + Babel-standalone desde CDN (con hashes SRI). Todo el CSS en `styles.css`. Íconos en sprite SVG (`defs.svg`). Solo español — sin objeto TRANSLATIONS ni toggle de idioma.

**CONFIG** (top del babel script):
- `brand`, `tagline`, `whatsapp` (`525539014600`), `tel`, `waMsg`
- Cualquier cambio de número o marca empieza aquí.

**Formulario de contacto**: No usa email ni Formspree. Al enviar, construye un mensaje con los datos del formulario y abre `wa.me/525539014600?text=...` en WhatsApp.

## Secciones

`Hero → StatsBar → Servicios → PorQueNosotros → Proceso → FAQs → Trabajos → Contacto → CtaFinal → Footer + FloatingWA`

**Trabajos**: marquee auto-desplazable de fotos reales. Los datos viven en el array `works` del babel script; al hacer clic abren un `Lightbox` (Esc/flechas/backdrop, con CTA a WhatsApp). Se pausa en hover y respeta `prefers-reduced-motion`.

### Pipeline de imágenes (dos tamaños)

Cada foto vive en dos resoluciones, ambas generadas con `sips`:

| Archivo | Uso | Receta |
|---|---|---|
| `assets/trabajos/<slug>.jpg` | Lightbox y crawlers (JSON-LD + SSR) | `sips -Z 1100 -s format jpeg -s formatOptions 70` |
| `assets/trabajos/thumb/<slug>.avif` | Lo que carga el marquee | `sips --resampleHeight 720 -s format avif -s formatOptions 50` |
| `assets/trabajos/thumb/<slug>.jpg` | Fallback del `<picture>` | `sips --resampleHeight 720 -s format jpeg -s formatOptions 68` |

Los thumbs se generan **por altura** (`--resampleHeight`), no por lado mayor: el marquee restringe la altura (`.work-card`, `clamp(280px, 40vh, 360px)`) y 720 px la cubre a 2× DPR. **Nunca ampliar** — si la altura del origen ya es ≤ 720 px (caso `chamarra-4ases`, `vasos-luis`), sólo re-encodear sin `--resampleHeight`.

Cuidados al tocar esta sección:

- El marquee usa `<picture>` (`source` AVIF + `img` JPEG). El `img` **debe** llevar `width`/`height` de `tw`/`th`: con `height:100%; width:auto`, sin ellos la tarjeta mide 0 px de ancho hasta que carga y el track salta mientras la animación corre.
- `w`/`h` y `tw`/`th` en `works` deben ser las dimensiones **reales** de los archivos — leerlas de `sips -g pixelWidth -g pixelHeight`, no calcularlas.
- `marquee-scroll` en `styles.css` se recalibra con el número de tarjetas: ~6.5 s por foto (14 fotos → 92 s). Si no, añadir fotos acelera el desplazamiento.
- Las fuentes suelen llegar como exports de WhatsApp (1280–1600 px). **Revisar cada foto antes de integrarla**: descartar capturas de pantalla de chats (llevan barra de estado y teléfonos de clientes).

## Catálogo

7 servicios: Lonas · Flyers · Pósters · Boletos · Pendones · Brazaletes · Artículos Promocionales.
Los chips del formulario añaden Stickers (8º, sin tarjeta propia).

Cada servicio vive en **cuatro** lugares que hay que mantener sincronizados: la tarjeta en el componente `Servicios`, la `Offer` del `hasOfferCatalog`, el `<li>` del `.ssr-fallback` y los archivos `llms.txt` / `llms-full.txt`.

## SEO / AEO

- JSON-LD: `Organization`, `LocalBusiness` (PrintingService con `hasOfferCatalog`), `FAQPage`, `WebSite`, `BreadcrumbList`, `ImageGallery`
- `.ssr-fallback` completo con todo el contenido para crawlers sin JS
- **Las FAQs están triplicadas** — acordeón React, `FAQPage` JSON-LD y `.ssr-fallback`. Google exige que el schema refleje lo visible: al tocar una, tocar las tres.
- **La galería de Trabajos está triplicada** — array `works` (React), `ImageGallery` JSON-LD y las `<figure>` del `.ssr-fallback`. Al añadir/quitar una foto, tocar las tres.
- `robots.txt` permite explícitamente crawlers IA (ClaudeBot, GPTBot, PerplexityBot, etc.)
- `sitemap.xml` — actualizar `lastmod` después de cambios de contenido

## Pendientes

- [x] Nombre de marca: **GRAFIK** — ya aplicado en `CONFIG.brand`, JSON-LD y SSR fallback
- [x] Dominio resuelto: `grafik.mx` — ya aplicado en todos los archivos
- [x] `og-image.png` (1200×630 px) — ya existe en la raíz
- [ ] Añadir dirección física si se quiere mejorar el schema `LocalBusiness`
- [ ] Íconos propios en `defs.svg` para Flyers, Pósters, Boletos y Pendones — hoy reusan `i-dtf`, `i-vinil`, `i-promo` y `i-lona`

## `/estudio/` — configurador de playeras y gorras (en construcción)

Ruta **escondida** (sin enlazar, `noindex`, fuera de `sitemap.xml`) con un configurador
self-service: preview del logo sobre la prenda, precio, cobro por Mercado Pago y panel
de administración. Es un subsistema aparte del sitio de una página.

**La especificación completa —contratos, tablas de casos de prueba, esquema SQL— vive en
`docs/superpowers/specs/2026-09-11-configurador-estudio-design.md`. Léela antes de tocar
`estudio/`, `api/` o `supabase/`.**

Reglas que NO se pueden romper (cada una protege algo que ya se rompió o se rompería):

1. **No crear `public/` en la raíz.** Vercel cambiaría el output directory ahí y el sitio
   entero devolvería 404. `vercel.json` lo fija con `outputDirectory: "."`.
2. **No tocar `index.html` ni `styles.css`.** El estudio importa `styles.css` sólo por sus
   tokens `:root`; sus estilos propios van en `estudio/studio.css` con prefijo `.es-`.
3. **Cero dependencias de runtime.** `package.json` sólo tiene `devDependencies` (Vitest,
   Playwright) y **ningún** script `build`. Mercado Pago, Resend y Supabase se consumen con
   `fetch` crudo contra sus REST APIs desde `api/*.js` en JS plano.
4. **`.vercelignore` es la única barrera** que impide servir `tests/`, `supabase/`, `docs/`
   y `*.md` como estáticos, porque el sitio se sirve desde la raíz. Al añadir una carpeta
   que no deba ser pública, añadirla ahí.
5. **`img.src` sólo recibe `blob:` o `data:`, nunca una URL remota.** Una imagen remota
   contamina el canvas y `toDataURL()` falla — ahí muere el snapshot del pedido. Todo lo
   remoto pasa por `fetch → blob → createObjectURL` (`estudio/canvas/image-loader.js`).
6. **Todo lo que se mezcla vive en una sola `Konva.Layer`.** Cada Layer es un `<canvas>`
   distinto y `globalCompositeOperation` no cruza esa frontera. El `Transformer` va en su
   propia Layer y el snapshot sale de `composeLayer.toDataURL()`, no de `stage.toDataURL()`.
7. **El precio lo calcula el servidor, siempre.** `/api/checkout` re-cotiza desde la base e
   ignora cualquier cifra del cliente. `pricing_rules` no tiene política RLS para `anon`.
8. **Dinero en centavos enteros.** Ninguna función devuelve un float de dinero.

### Mockups de prenda

`garment_types.base_mockup_url` acepta dos formas y `estudio/ui/studio-app.js` ramifica sola:
`procedural:tee` / `procedural:cap` (silueta calculada en `estudio/canvas/mockup.js`) o una
URL real, que pasa por `loadImageFromUrl`. Hoy la **playera usa foto real** (bucket público
`mockups`) y la **gorra sigue procedural** — no hay fotos utilizables de gorras lisas en
stock libre; la mejor fuente sería una foto de inventario propio.

La foto base es un **mapa de sombreado**, no una imagen de color: `paintGarment` la normaliza
contra el nivel de tela plana (percentil 0.9) y la **multiplica** por el color elegido. De ahí
dos requisitos duros:

- **Alfa recortando la silueta.** Sin él la prenda sale dentro de un rectángulo de color.
- **Escala de grises EXACTA (`r === g === b`).** `paintGarment` lee sólo el canal rojo como
  valor de sombreado. Un canal desviado sesga el teñido sin lanzar ningún error.

Por eso el recorte y el paso a grises van en `tools/mockup-cutout.swift` (Vision, el mismo
motor que "Eliminar fondo" de Vista Previa), y **el redimensionado va dentro de esa misma
herramienta, nunca con `sips` después**: el remuestreo de `sips` interpola cada canal por
separado y dejó 24 173 píxeles con `r != g != b` en la primera prueba.

Al cambiar una foto hay que tocar **tres** columnas, no una:

| Columna | Por qué |
|---|---|
| `base_mockup_url` | Nombre **versionado** (`-v2`): el bucket sirve `Cache-Control: immutable` |
| `canvas_size` | `paintGarment` hace `drawImage` estirando al canvas. Si la proporción no coincide con la foto, la prenda sale deformada |
| `print_area` | Va en fracciones (0..1) y está calibrada a la silueta anterior. El pecho de otra foto no cae en el mismo sitio |
| `print_area_width_cm` | Ancho REAL del área en centímetros. Es lo único que traduce píxeles a mundo físico, y de ahí sale el aviso de resolución (`estudio/lib/print-quality.js`). Es dato de la prenda, no constante: una gorra imprime a ~11 cm y una playera a ~31.6. Sin medirlo, la migración lo bloquea con `NOT NULL` en vez de inventar un valor |

El coste de teñir es `O(n log n)` sobre `canvas_size` y se paga **en cada clic de color**:
medido, 51 ms a 955×900 contra 129 ms a 1595×1504. Por eso `canvas_size` se mantiene en el
presupuesto de ~0.86 MP aunque la foto tenga más resolución.

Verificar siempre **mirando el render**, no sólo los números: así se encontró que la guía
punteada del área imprimible (`konva-adapter.js`) era de un trazo fijo casi blanco y
desaparecía sobre una playera blanca.

## Sistema de diseño

Ver `design-system.html` (guía visual) y `design-system.md` (referencia de tokens).

```
Paleta:
  --negro: #0C0C0C  --carbon: #181818  --carbon-hi: #2E2E2E
  --rojo: #D02B34   --rojo-dark: #A0202A
  --blanco: #F0F0EE  --plata: #B8B8B8  --wa: #25D366

Fuentes: Barlow Condensed (display/logo, peso 900) · Barlow (body/UI)

Logo: anillos concéntricos SVG con punto rojo central (#D02B34)
Símbolo: defs.svg#mark · Favicon: favicon.svg
```

## Responsive

- `960px`: nav links ocultos, hamburger visible; grids → 2 col
- `640px`: grids → 1 col; CTAs se apilan; padding 80px → 56px; logo 68→44px

`--nav-h` debe coincidir con el alto real del navbar (símbolo + 32px de padding + 1px de borde). Alimenta el `min-height` del hero y el `scroll-padding-top` que evita que la barra sticky tape los anclajes.
