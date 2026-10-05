# Auditoría SEO / AEO / GEO — www.grafik.mx (landing C+)

**Fecha:** 2026-10-05 · **Modo:** LOCAL (rama `seo/landing-c-plus-www-aeo`) + producción · **Host canónico decidido:** `https://www.grafik.mx`

## Scorecard (antes → después de este PR)

| Dimensión | Antes | Después | Qué lo movió |
|---|---|---|---|
| Crawlability + técnico | 72 | ~92 | host canónico `www` en 69 referencias; sitemap sin fragmentos + image sitemap; `robots.txt` válido; 404 de marca; fuentes autoalojadas |
| Datos estructurados | 70 | ~88 | `ProfessionalService`, `provider` en 11 servicios, `hoursAvailable`, `areaServed` alineado, logo PNG, sin `TollFree`/`priceRange` inventados, FAQ 8/8 |
| Answerability / contenido (GEO) | 72 | ~88 | `.ssr-fallback` con definición de entidad, tabla de variantes, lista de acabados, pasos del Estudio, zona de servicio, fecha visible, FAQ nueva |
| Entidad / E-E-A-T | 48 | ~55 | limitado por datos que solo da el dueño (ver pendientes) |
| Capa IA (llms.txt) | 66 | ~90 | formato llmstxt.org, bloque de entidad, 11 servicios, Trabajos reales, Estudio, FAQ |
| Keyword / gap | — | — | ver oportunidades |

**Lighthouse móvil (local, sin compresión):** SEO 92→**100**, Accesibilidad 91→**100**, CLS 0.44→**0**, Best Practices 96–100 (el único aviso es el 404 local de Vercel Insights, inexistente en Vercel). Rendimiento 72→86 (medido sin compresión/CDN; el LCP sigue limitado por Babel en el cliente).

## Hallazgos y estado

### Aplicados en este PR
1. **Host canónico**: canonical, hreflang, `og:*`, JSON-LD (`@id`/url/logo/images), `sitemap.xml`, `robots.txt`, `llms*.txt` → `https://www.grafik.mx` (antes apuntaban al apex, que redirige 308 a `www`).
2. **Sitemap**: una URL (`/`) + 25 `image:image` con caption; adiós a las entradas `#fragmento` que Google ignora.
3. **robots.txt**: eliminada la línea no estándar `Llms:` (Lighthouse la marcaba como inválida).
4. **Metadatos**: description 153 car. con el catálogo nuevo; `og:image:alt`, `og:site_name`, `twitter:image:alt`; `lang="es-MX"`; **og-image nueva** (1200×630, 174 KB, `?v=2`).
5. **JSON-LD**: tipo `["LocalBusiness","ProfessionalService"]`; `provider`/`areaServed` coherentes; `hoursAvailable`; logo PNG 512; quitado `contactOption: TollFree` (el 55 3901 4600 no es gratuito) y `priceRange` (no respaldado); `dateModified` 2026-10-05; Breadcrumb simplificado (sin fragmentos).
6. **FAQ**: 8ª pregunta "¿Qué productos puedo cotizar?" en React, `FAQPage` y SSR (paridad 8/8/8).
7. **`.ssr-fallback`** (lo que ven los crawlers de IA): definición de entidad, enlace a trabajos, tabla de 11 variantes, lista de acabados, pasos del Estudio, zona de servicio y horario, fecha visible.
8. **llms.txt / llms-full.txt**: reestructurados (entidad, servicios con enlaces, Trabajos reales, Estudio, FAQ, proceso); numeración 1–11; fechas 2026-10-05.
9. **404.html** de marca (`noindex`) con inicio / productos / WhatsApp.
10. **CWV**: fuentes Barlow **autoalojadas** (`assets/fonts`, latin, 144 KB) + `preload` → **CLS 0.44 → 0**; hero sin `loading=lazy`.
11. **Accesibilidad**: `role="list"` inválido en FAQ, contraste de textos pequeños (token `--rojo-txt`, `--plata-dim`, `--ink-45`, texto del botón de WhatsApp, tile "Ver todos"), `aria-label` que no contenían el texto visible, `aria-hidden` en el svg del logo del preview.

### Pendiente — requiere datos del dueño (no se inventan)
- **`sameAs`** (Instagram, Facebook, TikTok, LinkedIn, **Google Business Profile**) — mayor brecha de entidad.
- **Dirección física** (o confirmar negocio sin local → retirar "recogida del pedido") y coordenadas.
- **Fundador/Person**, año de fundación (solo si es verificable).
- **Reseñas verificables** (enlaces y cifras reales) → recién entonces `aggregateRating`.
- **Permiso para nombrar clientes** en texto destacado (Gobierno de Morelos, Toluca, etc.) y política de envíos fuera de CDMX (los trabajos muestran Veracruz, Oaxaca, Hidalgo…).
- **Claims técnicos en `llms-full.txt`** (HP Latex, 720–1440 DPI, materiales como Blue Back/City Light/Oplex, colores sugeridos de brazaletes, perforación): vienen del contenido anterior del sitio y **no están** en la landing actual. Confirmar si son ciertos; si lo son, replicarlos en el HTML; si no, retirarlos.

### Recomendado fuera de este PR
- **Estudio indexable** (decidido): PR aparte (`vercel.json` + `estudio/index.html` + sitemap). Metadatos sugeridos: title "Diseña tu playera o gorra con tu logo en línea | Estudio GRAFIK CDMX", H1 "Diseña tu playera o gorra con tu logo"; `/estudio/pedido/` debe seguir `noindex`.
- **`/index.html` duplicado** (200): redirect 301 a `/` en `vercel.json`.
- **Babel standalone en el cliente** (~3 MB, `unused-javascript` ~200 KB): precompilar el JSX es el cambio de fondo para LCP/INP; es un cambio de arquitectura (hoy no hay build).
- **URL por producto** (patrón de los competidores locales: `/lonas-cdmx`, `/brazaletes-tyvek`, …) — el cambio estructural de mayor retorno SEO; implica páginas nuevas.
- **Acciones off-site** de mayor impacto local y de citación por IA: Google Business Profile verificado (categoría Imprenta, horario, WhatsApp, fotos), reseñas tras cada entrega, perfiles sociales consistentes, directorios (Páginas Amarillas, Bing Places, Apple Business Connect), Search Console y Bing Webmaster con el sitemap de `www`.

## Oportunidades de contenido (keywords)
Competidores locales ganan con una URL por producto. Dentro de la landing: bloques de respuesta directa ya incorporados (entidad, variantes, FAQ de productos). Siguientes: respuestas H2/H3 de 40–60 palabras para *brazaletes Tyvek para eventos CDMX*, *boletos con holograma y folio*, *lonas front/mesh*, *caballetes publicitarios* y *figuras de coroplast* (baja competencia local), y términos "pulseras Tyvek", "volantes", "tickets/entradas" como variantes.

## Mantenimiento documentado
`CLAUDE.md`: sección "Host canónico, sitemap y activos SEO (oct 2026)" (host `www`, sitemap = `/` + imágenes, SSR como fuente para IA, conteos 8 FAQs / 11 productos, og-image versionada, 404, datos que no se inventan) y línea de dominio actualizada.
