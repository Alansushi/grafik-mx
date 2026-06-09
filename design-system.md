# GRAFIK — Sistema de Diseño

Referencia de tokens, tipografía y componentes de marca. Ver `design-system.html` para la guía visual interactiva.

## Paleta de Color

| Token CSS       | Hex       | Uso                           |
|-----------------|-----------|-------------------------------|
| `--negro`       | `#0C0C0C` | Fondo primario                |
| `--carbon`      | `#181818` | Superficies, secciones        |
| `--carbon-mid`  | `#222222` | Tarjetas, fondos de cards     |
| `--carbon-hi`   | `#2E2E2E` | Tarjetas elevadas, hover      |
| `--plata-dim`   | `#666666` | Texto muted, labels secundarios |
| `--plata`       | `#B8B8B8` | Iconos, texto secundario      |
| `--plata-claro` | `#E0E0E0` | Plata claro, highlights       |
| `--rojo`        | `#D02B34` | Acento principal de marca     |
| `--rojo-dark`   | `#A0202A` | Hover del acento, variante    |
| `--blanco`      | `#F0F0EE` | Títulos, texto principal      |
| `--wa`          | `#25D366` | WhatsApp (no cambiar)         |

### Combinaciones de uso
- **Principal**: negro + blanco + rojo como acento
- **Superficies**: carbon/carbon-mid sobre negro
- **Acento**: rojo para CTAs, kickers, highlights

## Tipografía

### Fuentes
- **Display / Headlines / Logo**: `Barlow Condensed` — pesos 300, 400, 600, 700, 800, **900**
- **Cuerpo / UI**: `Barlow` — pesos 300, 400, 500, 600

Google Fonts:
```
https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,300;0,400;0,600;0,700;0,800;0,900;1,700&family=Barlow:wght@300;400;500;600&display=swap
```

### Escala tipográfica

| Nivel   | Familia           | Peso | Tamaño | Uso                          |
|---------|-------------------|------|--------|------------------------------|
| Display | Barlow Condensed  | 900  | 80px   | Logo, hero principal         |
| H1      | Barlow Condensed  | 800  | 56px   | Títulos de sección hero      |
| H2      | Barlow Condensed  | 700  | 40px   | Subtítulos principales       |
| H3      | Barlow            | 600  | 26px   | Títulos de tarjeta           |
| Body    | Barlow            | 400  | 16px   | Texto de cuerpo              |
| Label   | Barlow            | 500  | 12px   | Labels, badges, uppercase    |

### Reglas de uso
- Barlow Condensed: siempre `text-transform: uppercase` en display/títulos
- letter-spacing para el wordmark/logo: `0.18em`
- letter-spacing para labels/kickers: `0.12–0.18em`
- Barlow para body: sin uppercase, line-height 1.5–1.65

## Símbolo de Marca

### Logo mark (anillos concéntricos)
```svg
<!-- Versión fondo oscuro (principal) -->
<svg viewBox="0 0 100 100" fill="none">
  <circle cx="50" cy="50" r="47" stroke="#444" stroke-width="1.2"/>
  <circle cx="50" cy="50" r="38" stroke="#777" stroke-width="1.8"/>
  <circle cx="50" cy="50" r="28" stroke="#B8B8B8" stroke-width="2.5"/>
  <circle cx="50" cy="50" r="18" stroke="#D8D8D8" stroke-width="3.5"/>
  <circle cx="50" cy="50" r="10" fill="#D02B34"/>
  <circle cx="50" cy="50" r="3.2" fill="#0C0C0C"/>
</svg>

<!-- Versión fondo claro -->
<svg viewBox="0 0 100 100" fill="none">
  <circle cx="50" cy="50" r="47" stroke="#CCC" stroke-width="1.2"/>
  <circle cx="50" cy="50" r="38" stroke="#999" stroke-width="1.8"/>
  <circle cx="50" cy="50" r="28" stroke="#444" stroke-width="2.5"/>
  <circle cx="50" cy="50" r="18" stroke="#222" stroke-width="3.5"/>
  <circle cx="50" cy="50" r="10" fill="#D02B34"/>
  <circle cx="50" cy="50" r="3.2" fill="#E8E8E6"/>
</svg>

<!-- Versión fondo rojo -->
<svg viewBox="0 0 100 100" fill="none">
  <circle cx="50" cy="50" r="47" stroke="rgba(255,255,255,.25)" stroke-width="1.5"/>
  <circle cx="50" cy="50" r="38" stroke="rgba(255,255,255,.45)" stroke-width="2"/>
  <circle cx="50" cy="50" r="28" stroke="rgba(255,255,255,.7)"  stroke-width="2.5"/>
  <circle cx="50" cy="50" r="18" stroke="#FFF"                  stroke-width="3.5"/>
  <circle cx="50" cy="50" r="10" fill="#A0202A"/>
  <circle cx="50" cy="50" r="3.2" fill="#FFF"/>
</svg>
```

### Lockup horizontal (logo + wordmark)
```html
<div style="display:flex; align-items:center; gap:12px;">
  <!-- mark SVG arriba -->
  <span style="font-family:'Barlow Condensed'; font-weight:900; font-size:20px; letter-spacing:0.18em; text-transform:uppercase; color:#F0F0EE;">GRAFIK</span>
</div>
```

### Zona de protección
- Espacio libre mínimo: equivalente al radio del anillo exterior (x)
- Tamaño mínimo digital: 24×24 px (solo símbolo) · 120 px ancho (lockup horizontal)
- Tamaño mínimo impresión: 8 mm (símbolo) · 30 mm (lockup)

## Aplicaciones de Marca

### Favicon (SVG)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#0C0C0C"/>
  <circle cx="50" cy="50" r="46" stroke="#444" stroke-width="3" fill="none"/>
  <circle cx="50" cy="50" r="36" stroke="#777" stroke-width="5" fill="none"/>
  <circle cx="50" cy="50" r="25" stroke="#B8B8B8" stroke-width="7" fill="none"/>
  <circle cx="50" cy="50" r="13" stroke="#D8D8D8" stroke-width="9" fill="none"/>
  <circle cx="50" cy="50" r="5" fill="#D02B34"/>
</svg>
```

### Footer de correo
- Ancho: 600 px
- Línea superior: 3px sólida `#D02B34`
- Fondo: `#0C0C0C`
- Logo horizontal + datos de contacto alineados a la derecha

### Foto de perfil (redes)
- Fondo `#0C0C0C`, símbolo + wordmark centrados
- Circular (400×400 px) para WhatsApp / Instagram
- Cuadrado (400×400 px) para Facebook / LinkedIn

### Post redes sociales
- Post cuadrado: 1080×1080 px
- Story: 1080×1920 px
- Halftone dots sutil: `radial-gradient(circle, rgba(184,184,184,.05) 1px, transparent 1px) / 10px 10px`
- Círculo decorativo esquina: `border: 18–30px solid rgba(208,43,52,0.1)`

### Tarjeta de presentación
- Tamaño: 90×50 mm
- Frente: negro, logo horizontal, nombre y rol
- Reverso: carbon, borde izquierdo 3px rojo, datos de contacto

## Variables CSS del sitio web

Las variables del sitio tienen aliases para compatibilidad:
```css
--paper   → var(--negro)     /* bg primario */
--paper-2 → var(--carbon)    /* superficie */
--paper-3 → var(--carbon-hi) /* superficie elevada */
--ink     → var(--blanco)    /* texto primario */
--green   → var(--rojo)      /* acento */
--green-deep → var(--rojo-dark) /* acento hover */
--serif   → 'Barlow Condensed'
--sans    → 'Barlow'
--mono    → 'Barlow'
```
