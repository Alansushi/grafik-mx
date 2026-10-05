// estudio/ui/panel-resumen.js — resumen del pedido + datos de contacto.
//
// Componente controlado: no hace fetch. Etapa A no muestra precios: el pedido
// llega por WhatsApp y se cotiza a mano con lo que el cliente armó.

import { h, Fragment } from './react.js';
import { breakdownToLabel } from '../lib/sizes.js';

// Mismo patrón que EMAIL_RE en api/_lib/validation.js#isEmail, duplicado a
// propósito: esta vista sólo da feedback temprano en el cliente, nunca es la
// validación autoritativa (esa corre en el servidor). Importar api/_lib/**
// desde el navegador mezclaría código de servidor con el bundle público.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isLikelyValidEmail(value) {
  return EMAIL_RE.test(value);
}

function SummaryBody({ summary }) {
  return h('dl', { className: 'es-resumen-summary' }, [
    h('dt', { className: 'es-resumen-summary-label', key: 'gt' }, 'Prenda'),
    h('dd', { className: 'es-resumen-summary-value', key: 'gd' }, summary.garmentName),
    h('dt', { className: 'es-resumen-summary-label', key: 'ct' }, 'Color'),
    h('dd', { className: 'es-resumen-summary-value', key: 'cd' }, summary.colorName),
    h('dt', { className: 'es-resumen-summary-label', key: 'tt' }, 'Técnica'),
    h('dd', { className: 'es-resumen-summary-value', key: 'td' }, summary.techniqueName),
    h('dt', { className: 'es-resumen-summary-label', key: 'st' }, 'Tallas'),
    h('dd', { className: 'es-resumen-summary-value', key: 'sd' }, summary.qty > 0 ? breakdownToLabel(summary.breakdown) : 'Aún sin piezas'),
  ]);
}

export function PanelResumen({
  summary,
  error,
  customer,
  onCustomer,
  onSubmit,
  canSubmit,
  submitting,
  submitted,
}) {
  const name = customer?.name ?? '';
  const email = customer?.email ?? '';
  const phone = customer?.phone ?? '';
  const emailLooksInvalid = email.length > 0 && !isLikelyValidEmail(email);

  const errorArea = error
    ? h('div', { className: 'es-resumen-error', role: 'alert', key: 'error' }, [
        h('p', { key: 'msg' }, error.message || 'No pudimos enviar tu pedido.'),
      ])
    : null;

  // Tras un envío exitoso, `onSubmit` ya abrió WhatsApp en otra pestaña —
  // esta sigue con el formulario intacto y habilitado si no se reemplaza
  // por algo, así que un cliente que vuelve a ella puede parecer que "no
  // pasó nada" y tocar enviar otra vez. El folio + liga a /estudio/pedido/
  // (la misma que ya viaja en el mensaje de WhatsApp, generada en
  // studio-app.js#onSubmit) le confirman que sí se guardó, sin inventar
  // ningún dato nuevo — short_code y public_token ya vienen de la
  // respuesta de /api/submit-quote.
  const formOrDone = submitted
    ? h('div', { className: 'es-resumen-done', role: 'status', key: 'done' }, [
        h('p', { className: 'es-resumen-done-title', key: 'title' },
          `Pedido enviado — folio ${submitted.short_code}`),
        h('p', { className: 'es-resumen-done-text', key: 'text' },
          'Seguimos la conversación por WhatsApp. Si cerraste esa pestaña, aquí puedes ver tu diseño y el estado de tu pedido:'),
        h('a', {
          key: 'link',
          className: 'es-btn es-btn-outline es-resumen-done-link',
          href: `/estudio/pedido/?t=${submitted.public_token}`,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, 'Ver mi pedido'),
      ])
    : h(Fragment, null,
        h('div', { className: 'es-resumen-contact', key: 'contact' }, [
      h('div', { className: 'es-field', key: 'name' }, [
        h('label', { className: 'es-label-sm', htmlFor: 'es-customer-name', key: 'label' }, 'Nombre *'),
        h('input', {
          key: 'input',
          type: 'text',
          id: 'es-customer-name',
          className: 'es-input',
          autoComplete: 'name',
          required: true,
          value: name,
          onChange: (e) => onCustomer('name', e.target.value),
        }),
      ]),

      h('div', { className: 'es-field', key: 'email' }, [
        h('label', { className: 'es-label-sm', htmlFor: 'es-customer-email', key: 'label' }, 'Correo *'),
        h('input', {
          key: 'input',
          type: 'email',
          id: 'es-customer-email',
          className: 'es-input',
          autoComplete: 'email',
          required: true,
          value: email,
          'aria-invalid': emailLooksInvalid || undefined,
          'aria-describedby': emailLooksInvalid ? 'es-customer-email-error' : undefined,
          onChange: (e) => onCustomer('email', e.target.value),
        }),
        emailLooksInvalid
          ? h(
              'p',
              { className: 'es-error-text', id: 'es-customer-email-error', key: 'error' },
              'Revisa el formato del correo.',
            )
          : null,
      ]),

      h('div', { className: 'es-field', key: 'phone' }, [
        h('label', { className: 'es-label-sm', htmlFor: 'es-customer-phone', key: 'label' }, 'WhatsApp *'),
        h('input', {
          key: 'input',
          type: 'tel',
          id: 'es-customer-phone',
          className: 'es-input',
          autoComplete: 'tel',
          required: true,
          placeholder: '55 1234 5678',
          value: phone,
          onChange: (e) => onCustomer('phone', e.target.value),
        }),
      ]),
    ]),
    h(
      'button',
      {
        type: 'button',
        className: 'es-btn es-btn-wa es-resumen-submit',
        disabled: !canSubmit || submitting,
        onClick: onSubmit,
        key: 'submit',
      },
      submitting ? 'Enviando…' : 'Enviar pedido por WhatsApp',
    ),
      );

  return h('section', { className: 'es-panel es-panel-resumen' }, [
    h('h2', { className: 'es-panel-title', key: 'heading' }, 'Resumen y contacto'),
    h(SummaryBody, { summary, key: 'summary' }),
    errorArea,
    formOrDone,
  ]);
}
