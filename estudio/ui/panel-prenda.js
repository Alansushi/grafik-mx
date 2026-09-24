// estudio/ui/panel-prenda.js — prenda, color y técnica.
//
// Componente controlado: no guarda nada de negocio, sólo pinta lo que recibe y
// avisa hacia arriba. El estado vive en studio-app.js.

import { h, cx } from './react.js';

/**
 * @param {{
 *   garments: Array, techniques: Array,
 *   garmentSlug: string, colorHex: string, techniqueSlug: string,
 *   activeView: string,
 *   onGarment: (slug:string)=>void,
 *   onColor: (hex:string)=>void,
 *   onTechnique: (slug:string)=>void,
 *   onView: (slug:string)=>void,
 *   busy: boolean,
 * }} props
 */
export function PanelPrenda({
  garments, techniques, garmentSlug, colorHex, techniqueSlug, activeView,
  onGarment, onColor, onTechnique, onView, busy,
}) {
  const garment = garments.find((g) => g.slug === garmentSlug) ?? garments[0];
  const variants = garment?.variants ?? [];
  const views = garment?.views ?? [];
  const activeTechnique = techniques.find((t) => t.slug === techniqueSlug);

  return h('section', { className: 'es-panel es-panel-prenda', 'aria-busy': busy ? 'true' : 'false' },
    h('h2', { className: 'es-panel-title' }, '1. Tu prenda'),

    // ── Prenda ──
    h('div', { className: 'es-field' },
      h('span', { className: 'es-label', id: 'es-lbl-prenda' }, 'Prenda'),
      h('div', { className: 'es-chip-row', role: 'radiogroup', 'aria-labelledby': 'es-lbl-prenda' },
        garments.map((g) => h('button', {
          key: g.slug,
          type: 'button',
          role: 'radio',
          'aria-checked': g.slug === garment.slug,
          className: cx('es-chip', g.slug === garment.slug && 'is-selected'),
          onClick: () => onGarment(g.slug),
          disabled: busy,
        }, g.name)),
      ),
    ),

    // ── Vista ── sólo si esta prenda trae vistas de presentación además de
    // front (hoy: left/right en la gorra, back en la playera). "Frente" no
    // viene en garment.views (ES la fila de garment_types) — se antepone aquí.
    views.length
      ? h('div', { className: 'es-field' },
          h('span', { className: 'es-label', id: 'es-lbl-vista' }, 'Vista'),
          h('div', { className: 'es-chip-row', role: 'radiogroup', 'aria-labelledby': 'es-lbl-vista' },
            [{ slug: 'front', name: 'Frente' }, ...views].map((v) => h('button', {
              key: v.slug,
              type: 'button',
              role: 'radio',
              'aria-checked': v.slug === activeView,
              className: cx('es-chip', v.slug === activeView && 'is-selected'),
              onClick: () => onView(v.slug),
              disabled: busy,
            }, v.name)),
          ),
          activeView !== 'front'
            ? h('p', { className: 'es-hint' }, 'Vista de presentación: el logo no se imprime aquí.')
            : null,
        )
      : null,

    // ── Color ──
    h('div', { className: 'es-field' },
      h('span', { className: 'es-label', id: 'es-lbl-color' },
        'Color',
        h('span', { className: 'es-label-note' },
          ' · ', variants.find((v) => v.color_hex === colorHex)?.color_name ?? ''),
      ),
      h('div', { className: 'es-swatch-row', role: 'radiogroup', 'aria-labelledby': 'es-lbl-color' },
        variants.map((v) => h('button', {
          key: v.color_hex,
          type: 'button',
          role: 'radio',
          'aria-checked': v.color_hex === colorHex,
          // El nombre va en aria-label porque el botón sólo muestra color: sin
          // esto, un lector de pantalla anuncia "botón" y nada más.
          'aria-label': v.color_name,
          title: v.color_name,
          className: cx('es-swatch', v.color_hex === colorHex && 'is-selected'),
          style: { background: v.color_hex },
          onClick: () => onColor(v.color_hex),
          disabled: busy,
        })),
      ),
    ),

    // ── Técnica ──
    h('div', { className: 'es-field' },
      h('span', { className: 'es-label', id: 'es-lbl-tecnica' }, 'Técnica de personalización'),
      h('div', { className: 'es-chip-row', role: 'radiogroup', 'aria-labelledby': 'es-lbl-tecnica' },
        techniques.map((t) => h('button', {
          key: t.slug,
          type: 'button',
          role: 'radio',
          'aria-checked': t.slug === techniqueSlug,
          className: cx('es-chip', t.slug === techniqueSlug && 'is-selected'),
          onClick: () => onTechnique(t.slug),
          disabled: busy,
        }, t.name)),
      ),
      // Las notas del catálogo dicen cosas que cambian la decisión — que la
      // sublimación sólo va sobre tela clara, que el bordado no se puede
      // replicar exacto en una imagen plana. Esconderlas sería dejar que el
      // cliente se entere después de pagar.
      activeTechnique?.notes
        ? h('p', { className: 'es-hint' }, activeTechnique.notes)
        : null,
    ),
  );
}

// El aviso de contraste logo/prenda vivía aquí y se renderizaba desde
// studio-app, pero panel-logo.js ya tenía el suyo: el mismo mensaje aparecía
// DOS VECES en pantalla. Se detectó mirando la captura de producción, no con
// una aserción. Se conserva el de panel-logo porque está integrado con el
// estado y los estilos de ese panel; éste se elimina en vez de dejarlo
// exportado sin uso.
