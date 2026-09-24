// estudio/ui/logo-toolbar.js — controles de colocación del logo.
//
// Antes vivía dentro de panel-logo.js (Escala/Rotación/Ajustar/Quitar); se
// extrajo tal cual (mismos cálculos, mismo RangeField) para montarse vía
// portal en #es-logo-toolbar-mount, en flujo normal debajo del canvas —
// "flotante" es de estilo (fondo semitransparente, borde, sombra), no de
// posicionamiento absoluto. Gana un primer grupo "Subir/Cambiar logo" que
// abre el mismo <input> que estudio/ui/canvas-dropzone.js, vía el
// `fileInputRef` que ahora es propiedad de studio-app.js.
//
// onTransform/onFit/onRemove siguen siendo exactamente los callbacks de
// studio-app.js (que a su vez llaman al stage de Konva) — este archivo no
// cambia cuándo se disparan, sólo dónde viven los botones que los llaman.

import { h, cx } from './react.js';
import { snapRotation } from '../lib/geometry.js';

const ROTATION_MIN = -180;
const ROTATION_MAX = 180;
const ROTATION_STEP = 1;

function UploadIcon() {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: 18,
      height: 18,
      'aria-hidden': 'true',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    h('path', { d: 'M12 15.5V3.5M12 3.5 8 7.5M12 3.5l4 4' }),
    h('path', { d: 'M4 15.5v2.5A2.5 2.5 0 0 0 6.5 20.5h11a2.5 2.5 0 0 0 2.5-2.5v-2.5' }),
  );
}

/**
 * Fila reutilizable de "label + slider + valor legible", usada por Escala y
 * Rotación. `extra` es el hueco para el botón "0°" de Rotación; Escala no lo
 * usa y pasa null.
 */
function RangeField({ id, label, value, min, max, step, display, disabled, onChange, extra, numberInput }) {
  return h(
    'div',
    { className: 'es-field es-lt-field' },
    h(
      'div',
      { className: 'es-logo-range-head' },
      h('label', { className: 'es-field-label', htmlFor: id }, label),
      // Un <span> de solo lectura no deja teclear un valor exacto — con el
      // slider solo, llegar a "150%" o "45°" depende de arrastrar fino o de
      // repetir flechas de a un `step`. El input numérico reusa el mismo
      // `onChange`/estado; sólo cambia el DOMINIO en que se expresa el valor
      // (p.ej. Escala lo recibe en % relativo al fit, no en escala absoluta).
      numberInput
        ? h('input', {
            type: 'number',
            className: 'es-logo-range-number',
            'aria-label': `${label} (valor exacto)`,
            value: numberInput.value,
            min: numberInput.min,
            max: numberInput.max,
            step: numberInput.step,
            disabled,
            onChange: (e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) numberInput.onChange(n);
            },
          })
        : h('span', { className: 'es-logo-range-value' }, display),
    ),
    h(
      'div',
      { className: 'es-logo-range-row' },
      h('input', {
        id,
        type: 'range',
        min,
        max,
        step,
        value,
        disabled,
        'aria-valuetext': display,
        onChange: (e) => onChange(Number(e.target.value)),
      }),
      extra || null,
    ),
  );
}

/**
 * @param {{
 *   logo: object | null,
 *   transform: {x:number,y:number,scaleX:number,scaleY:number,rotation:number} | null,
 *   fitScale: number,  // techo alcanzable AHORA; 100% de Escala = este valor
 *   busy: boolean,
 *   openPicker: () => void,    // comparte el <input> de canvas-dropzone.js
 *   onTransform: (partial: object) => void,
 *   onFit: (mode: 'contain'|'cover') => void,
 *   onRemove: () => void,
 * }} props
 */
export function LogoToolbar({ logo, transform, fitScale, busy, openPicker, onTransform, onFit, onRemove }) {
  const scale = transform?.scaleX ?? 1;
  const rotation = transform?.rotation ?? 0;
  const controlsDisabled = busy || !transform;

  // % de Escala relativo al FIT, no absoluto: "100%" = el máximo que cabe en
  // el área imprimible AHORA MISMO (a la rotación actual — ver getFitScale()
  // en konva-adapter.js). fitScaleSafe evita dividir por 0/undefined antes
  // de que exista un fit.
  const fitScaleSafe = Number(fitScale) > 0 ? fitScale : (scale || 1);
  const scaleMin = fitScaleSafe * 0.2;
  const scaleMax = fitScaleSafe;
  const scaleStep = fitScaleSafe / 100;
  const scalePercent = Math.round((scale / fitScaleSafe) * 100);

  return h(
    'div',
    { className: 'es-logo-toolbar' },
    h(
      'div',
      { className: 'es-lt-group' },
      h('button', {
        type: 'button',
        className: 'es-lt-btn',
        onClick: openPicker,
        disabled: busy,
      }, h(UploadIcon, null), logo ? 'Cambiar logo' : 'Subir logo'),
    ),

    logo
      ? h(
          'div',
          { className: 'es-lt-group' },
          h(RangeField, {
            id: 'es-logo-scale',
            label: 'Escala',
            value: scale,
            min: scaleMin,
            max: scaleMax,
            step: scaleStep,
            display: `${scalePercent}%`,
            disabled: controlsDisabled,
            onChange: (v) => onTransform({ scaleX: v, scaleY: v }),
            numberInput: {
              // Tope en 100, a juego con scaleMax: no hay nada por encima.
              value: scalePercent,
              min: 20,
              max: 100,
              step: 1,
              onChange: (pct) => {
                const s = (pct / 100) * fitScaleSafe;
                onTransform({ scaleX: s, scaleY: s });
              },
            },
          }),
        )
      : null,

    logo
      ? h(
          'div',
          { className: 'es-lt-group' },
          h(RangeField, {
            id: 'es-logo-rotation',
            label: 'Rotación',
            value: rotation,
            min: ROTATION_MIN,
            max: ROTATION_MAX,
            step: ROTATION_STEP,
            display: `${Math.round(rotation)}°`,
            disabled: controlsDisabled,
            onChange: (v) => onTransform({ rotation: snapRotation(v) }),
            numberInput: {
              value: Math.round(rotation),
              min: ROTATION_MIN,
              max: ROTATION_MAX,
              step: 1,
              onChange: (v) => onTransform({ rotation: snapRotation(v) }),
            },
            extra: h('button', {
              type: 'button',
              className: 'es-btn es-btn-outline es-btn-sm',
              'aria-label': 'Restablecer rotación a 0 grados',
              onClick: () => onTransform({ rotation: 0 }),
              disabled: controlsDisabled || rotation === 0,
            }, '0°'),
          }),
        )
      : null,

    logo
      ? h(
          'div',
          { className: 'es-lt-group' },
          h('button', {
            type: 'button',
            className: 'es-btn es-btn-outline',
            onClick: () => onFit('contain'),
            disabled: controlsDisabled,
          }, 'Ajustar al área'),
          h('button', {
            type: 'button',
            className: 'es-btn es-btn-danger',
            onClick: onRemove,
            disabled: busy,
          }, 'Quitar logo'),
        )
      : null,
  );
}
