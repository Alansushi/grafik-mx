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

`Hero → StatsBar → Servicios → Materiales → PorQueNosotros → Proceso → FAQs → Contacto → CtaFinal → Footer + FloatingWA`

## SEO / AEO

- JSON-LD: `Organization`, `LocalBusiness` (PrintingService con `hasOfferCatalog`), `FAQPage`, `WebSite`
- `.ssr-fallback` completo con todo el contenido para crawlers sin JS
- `robots.txt` permite explícitamente crawlers IA (ClaudeBot, GPTBot, PerplexityBot, etc.)
- `sitemap.xml` — actualizar `lastmod` después de cambios de contenido

## Pendientes

- [ ] Confirmar nombre del negocio (placeholder: "GraficaMX") — reemplazar en `CONFIG.brand`, `<title>`, JSON-LD y `sitemap.xml`
- [x] Dominio resuelto: `grafik.mx` — ya aplicado en todos los archivos
- [ ] Crear `og-image.png` (1200×630 px) para Open Graph
- [ ] Añadir dirección física si se quiere mejorar el schema `LocalBusiness`

## Tokens de diseño

```
--paper: #ECE6D7  --ink: #1A1712  --green: #1F5A3A
Fuentes: Archivo (sans) · Newsreader (serif display) · IBM Plex Mono (mono)
```

## Responsive

- `960px`: nav links ocultos, hamburger visible; grids → 2 col
- `640px`: grids → 1 col; CTAs se apilan; padding 80px → 56px
