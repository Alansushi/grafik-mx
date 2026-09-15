// estudio/ui/panel-tallas.js — desglose de tallas del configurador.
//
// Componente controlado: no guarda su propio estado, no valida nada que no
// pueda derivarse de las props. `breakdown` llega YA normalizado por el
// padre (ver contrato en el encargo); este archivo nunca lo muta ni suma sus
// valores a mano — para "total de piezas" y para los errores de negocio pasa
// siempre por el mismo par normalizeBreakdown → validateBreakdown/totalUnits
// que usa el servidor (estudio/lib/sizes.js), así la vista jamás puede
// mostrar un número que el backend calcularía distinto.
//
// El motivo concreto (documentado en sizes.js): un <input type="number">
// devuelve STRINGS. `{M:'5', L:'7'}` sumado a mano da '057' — un pedido de
// 12 piezas cotizado como 57, saltando de tramo y cobrando casi 4× de más.
// Por eso `onChange` sólo entrega el valor crudo del input; normalizar es
// trabajo exclusivo del padre, y aquí ni siquiera se intenta.

import { h, useMemo, cx } from './react.js';
import { normalizeBreakdown, totalUnits, validateBreakdown } from '../lib/sizes.js';

/** Etiqueta humana de una talla. 'U' (gorra) se lee "Cantidad", no "Talla U". */
function sizeLabel(size) {
  return size === 'U' ? 'Cantidad' : `Talla ${size}`;
}

/** Traduce un error de validateBreakdown a un mensaje legible en español. */
function translateError(err) {
  switch (err.code) {
    case 'BELOW_MIN':
      return `Mínimo ${err.min} piezas por pedido (llevas ${err.got}).`;
    case 'ABOVE_MAX':
      return `Máximo ${err.max} piezas por pedido (llevas ${err.got}).`;
    case 'NEGATIVE_QTY':
      return `${sizeLabel(err.size)}: la cantidad no puede ser negativa.`;
    case 'NON_INTEGER':
      return `${sizeLabel(err.size)}: la cantidad debe ser un número entero.`;
    case 'NON_NUMERIC_QTY':
      return `${sizeLabel(err.size)}: esa cantidad no es válida.`;
    case 'UNKNOWN_SIZE':
      return `${sizeLabel(err.size)}: esta talla no está disponible para esta prenda.`;
    case 'MAX_PER_SIZE':
      return `${sizeLabel(err.size)}: máximo ${err.max} piezas en esta talla (llevas ${err.got}).`;
    default:
      return 'Hay un problema con las cantidades ingresadas.';
  }
}

function StepButton({ label, onClick, children }) {
  return h(
    'button',
    {
      type: 'button',
      className: 'es-talla-btn',
      'aria-label': label,
      onClick,
    },
    children,
  );
}

export function PanelTallas({ allowedSizes, breakdown, minQty, maxQty, onChange }) {
  const isSingleSize = allowedSizes.length === 1 && allowedSizes[0] === 'U';
  const sizesToRender = isSingleSize ? ['U'] : allowedSizes;

  // Defensa en profundidad: aunque el contrato garantiza que `breakdown` ya
  // llega normalizado, el total que se MUESTRA nunca se calcula sumando
  // `breakdown` a mano — siempre pasa por normalizeBreakdown antes de
  // totalUnits, exactamente como exige sizes.js. Si por algún motivo llegara
  // un valor no numérico, se prefiere mostrar 0 a reventar el panel entero.
  const total = useMemo(() => {
    try {
      return totalUnits(normalizeBreakdown(breakdown));
    } catch {
      return 0;
    }
  }, [breakdown]);

  const validation = useMemo(
    () => validateBreakdown(breakdown, { allowedSizes, minTotal: minQty, maxTotal: maxQty }),
    [breakdown, allowedSizes, minQty, maxQty],
  );

  const fieldErrors = {};
  const generalErrors = [];
  for (const err of validation.errors) {
    const message = translateError(err);
    if (err.size) {
      if (!fieldErrors[err.size]) fieldErrors[err.size] = [];
      fieldErrors[err.size].push(message);
    } else {
      generalErrors.push(message);
    }
  }

  function step(size, delta) {
    const current = typeof breakdown[size] === 'number' ? breakdown[size] : 0;
    onChange(size, Math.max(0, current + delta));
  }

  function renderField(size) {
    const label = sizeLabel(size);
    const inputId = `es-talla-${size}`;
    const errorId = `es-talla-error-${size}`;
    const errors = fieldErrors[size];
    const value = typeof breakdown[size] === 'number' ? breakdown[size] : '';

    return h(
      'div',
      { className: 'es-talla-field', key: size },
      [
        h('label', { className: 'es-label-sm', htmlFor: inputId, key: 'label' }, label),
        h(
          'div',
          { className: 'es-talla-stepper', key: 'stepper' },
          [
            h(
              StepButton,
              { key: 'minus', label: `Restar una pieza — ${label}`, onClick: () => step(size, -1) },
              '−',
            ),
            h('input', {
              key: 'input',
              type: 'number',
              inputMode: 'numeric',
              min: 0,
              step: 1,
              id: inputId,
              className: 'es-talla-input',
              value,
              'aria-invalid': errors ? true : undefined,
              'aria-describedby': errors ? errorId : undefined,
              onChange: (e) => onChange(size, e.target.value),
            }),
            h(
              StepButton,
              { key: 'plus', label: `Sumar una pieza — ${label}`, onClick: () => step(size, 1) },
              '+',
            ),
          ],
        ),
        errors
          ? h('p', { className: 'es-error-text', id: errorId, key: 'error' }, errors.join(' '))
          : null,
      ],
    );
  }

  const generalErrorsId = 'es-tallas-general-errors';

  return h(
    'fieldset',
    {
      className: 'es-panel es-panel-tallas',
      'aria-describedby': generalErrors.length > 0 ? generalErrorsId : undefined,
    },
    [
      h('legend', { className: 'es-field-label', key: 'legend' }, 'Tallas'),
      h(
        'div',
        { className: cx('es-tallas-grid', isSingleSize && 'es-tallas-grid--single'), key: 'grid' },
        sizesToRender.map(renderField),
      ),
      h('div', { className: 'es-tallas-total', key: 'total' }, [
        h('span', { key: 'label' }, 'Total de piezas'),
        h('span', { key: 'value' }, String(total)),
      ]),
      generalErrors.length > 0
        ? h(
            'div',
            { className: 'es-tallas-errors', id: generalErrorsId, role: 'alert', key: 'general-errors' },
            generalErrors.map((message, i) => h('p', { key: i }, message)),
          )
        : null,
    ],
  );
}
