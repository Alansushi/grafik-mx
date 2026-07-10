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

`Hero → StatsBar → Servicios → PorQueNosotros → Proceso → FAQs → Contacto → CtaFinal → Footer + FloatingWA`

## Catálogo

7 servicios: Lonas · Flyers · Pósters · Boletos · Pendones · Brazaletes · Artículos Promocionales.
Los chips del formulario añaden Stickers (8º, sin tarjeta propia).

Cada servicio vive en **cuatro** lugares que hay que mantener sincronizados: la tarjeta en el componente `Servicios`, la `Offer` del `hasOfferCatalog`, el `<li>` del `.ssr-fallback` y los archivos `llms.txt` / `llms-full.txt`.

## SEO / AEO

- JSON-LD: `Organization`, `LocalBusiness` (PrintingService con `hasOfferCatalog`), `FAQPage`, `WebSite`
- `.ssr-fallback` completo con todo el contenido para crawlers sin JS
- **Las FAQs están triplicadas** — acordeón React, `FAQPage` JSON-LD y `.ssr-fallback`. Google exige que el schema refleje lo visible: al tocar una, tocar las tres.
- `robots.txt` permite explícitamente crawlers IA (ClaudeBot, GPTBot, PerplexityBot, etc.)
- `sitemap.xml` — actualizar `lastmod` después de cambios de contenido

## Pendientes

- [x] Nombre de marca: **GRAFIK** — ya aplicado en `CONFIG.brand`, JSON-LD y SSR fallback
- [x] Dominio resuelto: `grafik.mx` — ya aplicado en todos los archivos
- [x] `og-image.png` (1200×630 px) — ya existe en la raíz
- [ ] Añadir dirección física si se quiere mejorar el schema `LocalBusiness`
- [ ] Íconos propios en `defs.svg` para Flyers, Pósters, Boletos y Pendones — hoy reusan `i-dtf`, `i-vinil`, `i-promo` y `i-lona`

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
