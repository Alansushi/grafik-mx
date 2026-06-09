# Reporte AEO — grafik.mx
Fecha: 2026-06-09 · Modo: LOCAL · Idiomas: es-MX · Motores objetivo: ChatGPT/SearchGPT, Claude, Perplexity, Google AI Overviews, Bing Copilot

Keywords/consultas objetivo:
1. "imprenta en CDMX"
2. "publicidad y rotulación CDMX"
3. "artículos promocionales CDMX"
4. "brazaletes para eventos CDMX"

---

## Resumen ejecutivo

- Grado global: **D** (score **58/100**) — el sitio es crawleable y tiene buen contenido, pero dos brechas críticas bloquean activamente la citación: sin `og-image.png` y sin `llms.txt`.
- El SSR fallback cubre ~95% del contenido sin JS — los crawlers ven casi todo. La base técnica es sólida.
- El schema está bien construido (Organization, LocalBusiness, FAQPage, WebSite) pero **sin `sameAs`** ni dirección física completa; la entidad no puede desambiguarse en el knowledge graph.
- Tres de las cuatro keywords objetivo están **ausentes del `<title>` e `<h1>`** ("rotulación", "artículos promocionales", "brazaletes") — el contenido existe pero el motor IA no sabe que es la respuesta relevante.
- **Ganancia rápida:** 4 acciones (og-image, llms.txt, dirección en schema, Google My Business) subirían el score de 58 → ~72 (+14 pts) sin tocar el contenido.

---

## Scorecard

| Dimensión | Peso | Score | Grado |
|-----------|-----:|------:|:-----:|
| Crawlability & técnico | 20% | 72 | C |
| Datos estructurados (schema.org) | 20% | 68 | C |
| Answerability & contenido (GEO) | 25% | 65 | C |
| Entidad & autoridad (E-E-A-T) | 15% | 52 | D |
| Capa llms.txt | 10% | 15 | F |
| Keyword & gap competitivo | 10% | 48 | D |
| **GLOBAL** | 100% | **58** | **D** |

> Score ponderado: (72×.20)+(68×.20)+(65×.25)+(52×.15)+(15×.10)+(48×.10) = 58.35

---

## Hallazgos por dimensión

### 1. Crawlability & técnico (72/100)

- **[Crítico]** `og-image.png` no existe — evidencia: `index.html:24` referencia `https://grafik.mx/og-image.png` pero el archivo no está en el repo. Los previews de citación/social fallan.
  - **Fix:** Crear `og-image.png` 1200×630px — fondo negro `#0C0C0C`, logo GRAFIK centrado, acento rojo. Ver kit: `assets/grafik-logo-dark.svg` como base.

- **[Crítico]** `llms.txt` ausente — evidencia: no existe en raíz ni referenciado en `robots.txt`.
  - **Fix:** Crear `/llms.txt` y `/llms-full.txt` (ver Plan P0 ítem 2).

- **[Alto]** Sin `hreflang` — `index.html`: sin marcado de idioma/región.
  - **Fix:** Añadir en `<head>`: `<link rel="alternate" hreflang="es-MX" href="https://grafik.mx/" />` + `<link rel="alternate" hreflang="x-default" href="https://grafik.mx/" />`

- **[Medio]** `sitemap.xml` solo tiene URL raíz — evidencia: `sitemap.xml:4–10`.
  - **Fix:** Añadir entradas para `/#servicios`, `/#materiales`, `/#proceso`, `/#faqs`, `/#contacto`.

- **[Medio]** FAQPage schema vs. SSR fallback con textos ligeramente distintos — `index.html:116` vs. SSR fallback `~línea 250`.
  - **Fix:** Sincronizar el texto de `<dd>` en el SSR fallback con el `acceptedAnswer.text` del schema.

- **[Bajo]** Sin BreadcrumbList schema.
  - **Fix:** Añadir JSON-LD con 4 ítems: Inicio, Servicios, FAQs, Contacto.

### 2. Datos estructurados (68/100)

- **[Alto]** Sin `sameAs` en Organization y LocalBusiness — evidencia: `index.html:35–103`, campo ausente.
  - **Fix:** Añadir `"sameAs": ["https://www.instagram.com/grafik.mx/", "https://www.facebook.com/grafikmx/", "https://www.linkedin.com/company/grafik-mx/", "<URL Google Maps>"]` a Organization.

- **[Alto]** LocalBusiness no enlazado a Organization en el grafo — evidencia: `index.html:66–103`, `@id: "#business"` pero sin `"organization": {"@id": "#org"}`.
  - **Fix:** Añadir `"organization": { "@id": "https://grafik.mx/#org" }` a LocalBusiness.

- **[Medio]** Inconsistencia de nombre: Organization `"name": "GRAFIK"` vs. LocalBusiness `"name": "GRAFIK — Imprenta y Publicidad"`.
  - **Fix:** Unificar ambos a `"name": "GRAFIK"` y usar `"alternateName": "Imprenta y Publicidad CDMX"`.

- **[Medio]** Organization sin `logo` en schema.
  - **Fix:** Añadir `"logo": { "@type": "ImageObject", "url": "https://grafik.mx/assets/grafik-simbolo.svg", "width": 512, "height": 512 }`.

- **[Medio]** LocalBusiness sin `areaServed`.
  - **Fix:** Replicar el array `areaServed` de Organization en LocalBusiness.

- **[Bajo]** WebSite sin `potentialAction` (SearchAction).

### 3. Answerability & contenido (65/100)

- **[Crítico]** Sin tablas comparativas — evidencia: todas las secciones usan `<ul>` sin tablas. Formato con mayor tasa de citación en motores IA.
  - **Fix:** Añadir tabla "Materiales: uso ideal" en sección Materiales; tabla "Vinil interior vs exterior vs vehicular"; tabla "Tipos de brazaletes: VIP / General / Staff / 21+".

- **[Crítico]** Sin definiciones canónicas "X es…" — evidencia: ninguna sección comienza con "La rotulación es…" / "Un artículo promocional es…".
  - **Fix:** Añadir bajo cada servicio un párrafo de definición: `<p><strong>La rotulación en vinil es</strong> el proceso de aplicar películas adhesivas en superficies como fachadas, vehículos y pisos para señalización visual duradera.</p>`.

- **[Crítico]** Sin FAQ específica de "brazaletes para eventos" — evidencia: `index.html:106–169`, 7 Q&A pero ninguna cubre "diferencia entre tipos de brazaletes" ni "precio Tyvek".
  - **Fix:** Añadir al FAQPage schema y sección visible: "¿Cuáles son los tipos de brazaletes para eventos?" + "¿Cuánto cuesta un brazalete Tyvek personalizado?".

- **[Alto]** H2s en forma declarativa, no pregunta — evidencia: "Nuestros Servicios", "Preguntas Frecuentes".
  - **Fix:** Cambiar a: "¿Cuáles son nuestros servicios de impresión y publicidad?", "¿Tienes dudas sobre tu proyecto?".

- **[Alto]** Sin anchor text descriptivo en enlazado interno.
  - **Fix:** Añadir en FAQ y cuerpo: `<a href="#servicios">impresión de lonas</a>`, `<a href="#materiales">20+ materiales disponibles</a>`.

- **[Medio]** Frescura no visible — sin `<time datetime="2026-06-09">` ni "Actualizado:" en contenido.
  - **Fix:** Añadir en footer: `<time datetime="2026-06-09">Actualizado: junio 2026</time>`.

### 4. Entidad & autoridad (52/100)

- **[Crítico]** `sameAs` vacío — entidad no verificable en knowledge graph (ver también D2).
- **[Crítico]** Sin dirección física completa (streetAddress, postalCode) — `index.html:52–57, 76–81`.
  - **Fix:** Añadir `"streetAddress": "[CALLE Y NÚMERO]"` + `"postalCode": "[CP]"` en ambos schemas.
- **[Crítico]** Sin página "Quiénes somos / About".
  - **Fix:** Crear sección en `index.html` entre `#ventajas` y `#proceso` con: fundación, especialización, equipo.
- **[Alto]** Sin `Person` schema para founder/director.
  - **Fix:** Añadir schema `Person` con `name`, `jobTitle`, `worksFor: @id org`, `sameAs: [LinkedIn]`.
- **[Alto]** Sin testimonios ni casos reales.
  - **Fix:** Añadir sección "Clientes" con 3–5 logos y 2–3 citas textuales.
- **[Medio]** Sin `dateModified` en WebSite schema.
  - **Fix:** Añadir `"dateModified": "2026-06-09"` en WebSite schema (`index.html:179`).

### 5. Capa llms.txt (15/100)

- **[Crítico]** `/llms.txt` no existe — evidencia: archivo ausente, sin referencia en `robots.txt` ni `<head>`.
  - **Fix:** Crear los dos archivos (ver Plan P0 ítem 2 — drafts completos incluidos).
- **[Crítico]** `robots.txt` no referencia `llms.txt`.
  - **Fix:** Añadir al final de `robots.txt`: `# Capa IA` + `Llms: https://grafik.mx/llms.txt`.
- **[Alto]** Sin `<link rel="llms.txt">` en `<head>`.
  - **Fix:** Añadir en `index.html:8–9`: `<link rel="llms.txt" href="/llms.txt" type="text/plain">`.

### 6. Keyword & gap competitivo (48/100)

- **[Crítico]** "artículos promocionales CDMX" y "brazaletes para eventos CDMX" ausentes de `<title>` y `<h1>`.
  - **Fix:** El sitio es una sola página — enriquecer H2s con las keywords específicas y crear llms.txt por sección.
- **[Crítico]** Sin Google My Business — competidores (RH Impresores, Condesa Artes Gráficas, etc.) aparecen en Maps; GRAFIK no.
  - **Fix (externo):** Crear perfil GMB con dirección, teléfono, categorías (Printing Service + Sign Shop), fotos de trabajos.
- **[Alto]** Schema `address` sin streetAddress ni postalCode — bloquea Local SEO.
- **[Alto]** Sin `sameAs` ni perfiles verificados.
- **[Alto]** Sin presencia en directorios locales (Páginas Amarillas, Rankeando.com).
  - **Fix (externo):** Registrar en: paginasamarillas.com.mx, rankeando.com, COPARMEX, directorios de imprentas CDMX.

---

## Plan priorizado

### P0 — Desbloqueo (alto impacto, esfuerzo bajo-medio)

**1. Crear `og-image.png` (1200×630 px)**
- **Por qué:** Referencia rota en `index.html:24`; sin imagen los previews de cita social fallan.
- **Archivo:** raíz del proyecto `/og-image.png`
- **Cambio:** Diseñar con fondo `#0C0C0C`, logo horizontal centrado (`assets/grafik-logo-horizontal.svg`), franja roja inferior. Guardar como PNG 1200×630.
- **Impacto esperado:** D1 +8 pts; thumbnails funcionales en todas las plataformas.

**2. Crear `/llms.txt` y `/llms-full.txt`**
- **Por qué:** Capa AEO directa para LLMs; sin ella la citación es aleatoria.
- **Archivos:** `/llms.txt` (resumen) + `/llms-full.txt` (completo markdown)
- **Draft `llms.txt`:**

```
# GRAFIK — Imprenta y Publicidad en CDMX
# https://grafik.mx | Actualizado: 2026-06-09

About: GRAFIK es una imprenta y agencia de publicidad en Ciudad de México. Servicios: impresión gran formato (lonas), vinil y rotulación, artículos promocionales, brazaletes para eventos, sublimación personalizada, grabado láser. Más de 20 materiales. Entrega 1–3 días hábiles. Servicio express disponible. WhatsApp: +52 55 3901 4600.

## Pages

### Home
URL: https://grafik.mx/
Description: Presentación completa de servicios, materiales, proceso de cotización, FAQs y contacto.

### Servicios de Impresión y Publicidad
Anchor: https://grafik.mx/#servicios
Services: Impresión Gran Formato (lonas), Vinil y Rotulación, Artículos Promocionales en CDMX, Brazaletes para Eventos CDMX, Sublimación Personalizada, Grabado Láser y Técnicas Especiales

### Catálogo de Materiales (20+)
Anchor: https://grafik.mx/#materiales
Lonas: Front 360DPI, Mate, Mesh, Back Light, 18oz Oplex, Canvas
Vinil: Blanco brillante, mate, transparente, estático, microperforado, laminado, Floor Graphic, imantado, Arlon automotriz
Papel: Blue Back, City Light, Couche, Photo Glossy, Película Back Light

### Proceso de Cotización
Anchor: https://grafik.mx/#proceso
Steps: (1) Comparte tu idea por WhatsApp, (2) Cotización en minutos, (3) Aprobación del arte, (4) Producción y entrega

### Preguntas Frecuentes
Anchor: https://grafik.mx/#faqs
Topics: Tiempos de producción, formatos de archivo, servicio de diseño, mínimos por artículo, entregas a domicilio, cómo cotizar, vinil automotriz Arlon

### Contacto
Anchor: https://grafik.mx/#contacto
WhatsApp: https://wa.me/525539014600 | Tel: +52 55 3901 4600
Email: contacto@grafik.mx | Horarios: Lun–Sáb 9am–7pm CDMX

## Keywords objetivo
imprenta en CDMX, publicidad CDMX, rotulación vinil CDMX, artículos promocionales personalizados CDMX, brazaletes para eventos CDMX, sublimación personalizada, grabado láser CDMX, impresión lonas gran formato, vinil Arlon automotriz

## Contacto
WhatsApp: +52 55 3901 4600 | Email: contacto@grafik.mx | grafik.mx
```

- **También:** Añadir al final de `robots.txt`: `Llms: https://grafik.mx/llms.txt`
- **También:** Añadir en `index.html` en `<head>`: `<link rel="llms.txt" href="/llms.txt" type="text/plain">`
- **Impacto esperado:** D5 de 15 → 85 pts (+70 pts en esa dimensión; +7 pts al global).

**3. Completar dirección postal en schema**
- **Por qué:** Sin `streetAddress` + `postalCode`, el NAP está incompleto y bloquea Local SEO.
- **Archivo:** `index.html:52–57` (Organization) y `index.html:76–81` (LocalBusiness)
- **Cambio:** Añadir en ambos bloques:
  ```json
  "streetAddress": "[CALLE Y NÚMERO]",
  "postalCode": "[CP]",
  ```
- **Impacto esperado:** D4 +5 pts; D6 +5 pts; desbloquea Local SEO.
- **Requiere:** Datos reales del usuario (ver sección Inputs).

**4. Registrar Google My Business**
- **Por qué:** Competidores aparecen en Maps; GRAFIK invisible en búsquedas locales.
- **Acción (externa):** business.google.com → crear perfil: nombre "GRAFIK — Imprenta y Publicidad", dirección completa, teléfono, categorías "Printing Service" + "Sign Shop", fotos de trabajos.
- **Impacto esperado:** D6 +8 pts; citación en local queries.

---

### P1 — Alto impacto, esfuerzo medio

**5. Agregar `sameAs` a Organization y LocalBusiness**
- **Archivo:** `index.html:35–62` (Organization)
- **Cambio:** Añadir después de `areaServed`:
  ```json
  "sameAs": [
    "https://www.instagram.com/grafik.mx/",
    "https://www.facebook.com/grafikmx/",
    "https://www.linkedin.com/company/grafik-mx/",
    "https://maps.google.com/?cid=<CID_DE_GMB>"
  ]
  ```
- **Requiere:** URLs reales de perfiles (ver Inputs).
- **Impacto esperado:** D2 +5 pts; D4 +8 pts.

**6. Enlazar LocalBusiness a Organization en el grafo**
- **Archivo:** `index.html:66` (LocalBusiness)
- **Cambio:** Añadir `"organization": { "@id": "https://grafik.mx/#org" }` y unificar `"name": "GRAFIK"`.
- **Impacto esperado:** D2 +4 pts.

**7. Tablas comparativas en sección Materiales**
- **Archivo:** `index.html` — sección Materiales (componente React `Materiales`)
- **Cambio:** Añadir una tabla en SSR fallback y en el componente JSX:
  | Material | Durabilidad | Costo | Uso ideal |
  |---|---|---|---|
  | Vinil blanco brillante | 3 años | $ | Interior/señalización |
  | Vinil Arlon | 7+ años | $$$ | Rotulación automotriz |
  | Lona Front 360 DPI | 3 años | $$ | Exterior/espectaculares |
  | Lona Back Light | 2 años | $$$ | Luminosos/caja de luz |
- **Impacto esperado:** D3 +8 pts (tablas = formato más citado en GEO).

**8. Definiciones canónicas "X es…" por servicio**
- **Archivo:** `index.html` — bajo cada `<h3>` de servicio en SSR fallback y componente JSX
- **Cambio:** Añadir un párrafo inicial en cada servicio principal:
  - "**La impresión en gran formato** es el proceso de reproducir imágenes o texto a gran escala sobre materiales como lona, vinil o canvas para publicidad exterior e interior."
  - "**La rotulación en vinil** es la aplicación de películas adhesivas en fachadas, vehículos o pisos para crear señalización visual duradera."
  - "**Los artículos promocionales** son productos personalizados con la marca de una empresa — plumas, tazas, USB, playeras — usados para difusión y fidelización."
  - "**Los brazaletes para eventos** son pulseras Tyvek personalizadas que identifican y controlan el acceso de asistentes en festivales, conferencias y eventos corporativos."
- **Impacto esperado:** D3 +6 pts.

**9. Agregar `Person` schema para founder/director**
- **Archivo:** `index.html` — nuevo bloque JSON-LD en `<head>`
- **Cambio:**
  ```json
  {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": "https://grafik.mx/#founder",
    "name": "[NOMBRE]",
    "jobTitle": "Fundador / Director",
    "worksFor": { "@id": "https://grafik.mx/#org" },
    "sameAs": ["https://www.linkedin.com/in/[perfil]"]
  }
  ```
  Y en Organization añadir: `"founder": { "@id": "https://grafik.mx/#founder" }`.
- **Requiere:** Datos reales del usuario.
- **Impacto esperado:** D4 +6 pts.

**10. H2s en forma de pregunta**
- **Archivo:** `index.html` — componentes React `Servicios`, `FAQs`
- **Cambio:** Renombrar:
  - "Nuestros Servicios" → "¿Qué servicios de impresión y publicidad ofrecemos?"
  - "Preguntas Frecuentes" → "¿Tienes dudas sobre tu proyecto?"
  - "Nuestros Materiales" → "¿En qué materiales imprimimos?"
- **Impacto esperado:** D3 +4 pts.

**11. Listar en directorios externos**
- **Acciones externas:**
  - paginasamarillas.com.mx
  - rankeando.com
  - Yelp México
  - Directorios de imprentas CDMX
- **Impacto esperado:** D6 +6 pts; D4 +4 pts (corroboración externa).

**12. Añadir FAQs específicas para keywords de nicho**
- **Archivo:** `index.html` — FAQPage schema (línea 106–169) y sección FAQ visible
- **Cambio:** Añadir al menos 2 Q&As:
  - "¿Cuáles son los tipos de brazaletes Tyvek para eventos?" → "VIP, General, Staff, 21+ y Acceso. Todos personalizables en full color o 1 tinta."
  - "¿Qué artículos promocionales tienen menor cantidad mínima?" → "Grabado láser: desde 1 pieza. Serigrafía y tampografía: 12–50 piezas."
- **Impacto esperado:** D3 +3 pts; D6 +3 pts.

**13. Frescura visible**
- **Archivo:** `index.html` — footer (línea ~844)
- **Cambio:** Añadir antes del copyright: `<time datetime="2026-06-09" style="font-size:10px;color:var(--plata-dim)">Actualizado: junio 2026</time>` y `"dateModified": "2026-06-09"` en WebSite schema (`index.html:179`).
- **Impacto esperado:** D3 +2 pts; D4 +2 pts.

---

### P2 — Pulido

**14. BreadcrumbList schema**
- **Archivo:** `index.html` — nuevo bloque JSON-LD
- **Cambio:** Añadir 4 ítems: Inicio, Servicios, FAQs, Contacto con `@type: BreadcrumbList`.

**15. Sincronizar FAQPage schema con SSR fallback**
- **Archivo:** `index.html` — sección `.ssr-fallback` `<dl>`
- **Cambio:** Copiar el texto exacto de `acceptedAnswer.text` del schema a cada `<dd>`.

**16. Anchor text descriptivo en cuerpo**
- **Archivo:** `index.html` — sección FAQs y textos de servicios
- **Cambio:** Añadir 4–5 `<a href="#servicio">texto descriptivo</a>` dentro del flujo de texto.

**17. Página / sección "Sobre nosotros"**
- **Archivo:** `index.html` — nueva sección entre `#ventajas` y `#proceso`
- **Cambio:** 3–4 párrafos: fundación, especialización, equipo (sin datos inventados; solo hechos reales).

**18. Testimonios y casos reales**
- **Archivo:** `index.html` — sección nueva después de `#ventajas`
- **Cambio:** 3–5 testimonios con nombre + empresa + texto real. Schema `Review`.
- **Requiere:** Datos reales de clientes.

---

## Inputs requeridos del usuario

Antes de aplicar los ítems marcados, necesito estos datos reales:

| # | Input | Para | P |
|---|-------|------|---|
| A | **Dirección física** (calle, número, colonia, CP) de GRAFIK | Schema `streetAddress` + `postalCode`; Google My Business | P0 |
| B | **URLs de perfiles oficiales** (Instagram, Facebook, LinkedIn, TikTok, Google Maps una vez creado) | `sameAs` en schema | P1 |
| C | **Nombre del founder / director** | `Person` schema | P1 |
| D | **LinkedIn del founder** | `Person` schema `sameAs` | P1 |
| E | **3–5 testimonios reales** (nombre + empresa + texto) | Sección de testimonios | P2 |
| F | **¿Hay certificaciones o membresías?** (ISO, cámaras, distribuidores) | E-E-A-T | P2 |

---

## Verificación (post-aplicación)

Una vez aplicados los fixes, validar:

1. `og-image.png` → Abrir `https://grafik.mx/og-image.png`; verificar 1200×630 px PNG.
2. `llms.txt` → Abrir `https://grafik.mx/llms.txt`; verificar Content-Type text/plain y secciones por keyword.
3. JSON-LD → Pegar bloques actualizados en https://validator.schema.org/ → sin errores; verificar `sameAs` presente.
4. Tablas → Cargar sitio sin JS (`curl -s https://grafik.mx | grep -i "<table"`); verificar HTML crudo.
5. H2s con pregunta → `grep -i "<h2" index.html`; confirmar formato pregunta.
6. `robots.txt` → Verificar línea `Llms:` al final.
7. `<time>` de frescura → Inspeccionar footer.

### Delta de score esperado (post-P0+P1)

| Dimensión | Actual | Post-P0+P1 | Delta |
|-----------|-------:|-----------:|------:|
| Crawlability & técnico | 72 | 82 | +10 |
| Datos estructurados | 68 | 80 | +12 |
| Answerability & contenido | 65 | 76 | +11 |
| Entidad & autoridad | 52 | 68 | +16 |
| Capa llms.txt | 15 | 85 | +70 |
| Keyword & gap | 48 | 62 | +14 |
| **GLOBAL** | **58** | **~75** | **+17** |

> Implementar todos los P0+P1 llevaría el sitio de **D (58) → B (75)** — de "rara vez citado" a "citado con espacio para liderar".
