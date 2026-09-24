// estudio/ui/step-indicator.js — indicador de progreso en el header.
//
// De solo lectura: no dispara navegación, scroll ni cambia ningún estado —
// sólo refleja booleans que YA existen en studio-app.js (los mismos
// ingredientes de canSubmit, ver stepsDone). El configurador no tiene
// wizard ni router; todo sigue en una sola pantalla, esto es sólo contexto
// de "qué te falta", igual que la fila de pasos del mockup de referencia.

import { h, cx } from './react.js';

const STEPS = [
  { key: 'prenda', label: 'Prenda' },
  { key: 'logo', label: 'Logo' },
  { key: 'tallas', label: 'Tallas' },
  { key: 'contacto', label: 'Contacto' },
];

/**
 * @param {{ done: {prenda:boolean, logo:boolean, tallas:boolean, contacto:boolean} }} props
 */
export function StepIndicator({ done }) {
  return h(
    'ol',
    { className: 'es-steps' },
    STEPS.map((s, i) => h(
      'li',
      { key: s.key, className: cx('es-steps-item', done[s.key] && 'is-done') },
      h('span', { className: 'es-steps-num', 'aria-hidden': 'true' }, done[s.key] ? '✓' : String(i + 1)),
      s.label,
    )),
  );
}
