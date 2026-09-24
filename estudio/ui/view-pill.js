// estudio/ui/view-pill.js — selector de vista (front/back/left/right).
//
// Componente controlado, sin estado propio: vivía dentro de panel-prenda.js
// (bloque "Vista") y se extrajo tal cual, mismo contrato de props, para
// poder montarlo vía portal sobre el canvas en vez de en el sidebar —
// conceptualmente pertenece a "qué se ve de la prenda ahora mismo", no a la
// elección de prenda/color/técnica. `onView` sigue siendo exactamente el
// callback de studio-app.js que llama stage.setView(...); este archivo no
// toca Konva ni el estado de negocio.

import { h, cx } from './react.js';

/**
 * @param {{
 *   views: Array<{slug:string, name:string}>,  // garment.views crudo, SIN 'front'
 *   activeView: string,
 *   onView: (slug:string) => void,
 *   busy: boolean,
 * }} props
 */
export function ViewPill({ views, activeView, onView, busy }) {
  if (!views.length) return null;

  // "Frente" no viene en garment.views (ES la fila de garment_types, la
  // única vista imprimible: tiene print_area, logo, Transformer) — se
  // antepone aquí, igual que antes en panel-prenda.js.
  const opciones = [{ slug: 'front', name: 'Frente' }, ...views];

  return h(
    'div',
    { className: 'es-view-pill' },
    h(
      'div',
      { className: 'es-view-pill-row', role: 'radiogroup', 'aria-label': 'Vista' },
      opciones.map((v) => h('button', {
        key: v.slug,
        type: 'button',
        role: 'radio',
        'aria-checked': v.slug === activeView,
        className: cx('es-view-pill-chip', v.slug === activeView && 'is-selected'),
        onClick: () => onView(v.slug),
        disabled: busy,
      }, v.name)),
    ),
    activeView !== 'front'
      ? h('p', { className: 'es-view-pill-hint' }, 'Vista de presentación: el logo no se imprime aquí.')
      : null,
  );
}
