// estudio/ui/panel-resumen.js — desglose de precio + datos de contacto.
//
// Componente controlado: no hace fetch, no calcula ni un centavo. Todo el
// dinero que se pinta viene tal cual de `quote` (la respuesta de
// POST /api/quote, ver api/quote.js) y siempre pasa por formatCentsMXN antes
// de tocar el DOM — nunca se divide entre 100 ni se formatea a mano aquí.
//
// El precio unitario que muestra este panel es el mismo `unit_price_cents`
// que ya trae cada item de `quote.items`: el cliente nunca calcula precios,
// sólo los presenta.

import { h } from './react.js';
import { formatCentsMXN } from '../lib/format.js';

// Mismo patrón que EMAIL_RE en api/_lib/validation.js#isEmail, duplicado a
// propósito: esta vista sólo da feedback temprano en el cliente, nunca es la
// validación autoritativa (esa corre en el servidor, igual que dice el
// encargo). Importar api/_lib/** desde el navegador mezclaría código de
// servidor con el bundle público.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isLikelyValidEmail(value) {
  return EMAIL_RE.test(value);
}

function QuoteLine({ label, amountCents }) {
  return h('div', { className: 'es-resumen-line' }, [
    h('span', { className: 'es-resumen-line-label', key: 'l' }, label),
    h('span', { className: 'es-resumen-line-value', key: 'v' }, formatCentsMXN(amountCents)),
  ]);
}

function QuoteItem({ item, showHeading }) {
  return h('div', { className: 'es-resumen-item' }, [
    showHeading
      ? h('p', { className: 'es-resumen-item-heading', key: 'heading' }, item.garment_slug)
      : null,
    h(QuoteLine, {
      key: 'unit',
      label: `Precio unitario (${item.qty} pzas)`,
      amountCents: item.unit_price_cents,
    }),
    h(QuoteLine, { key: 'subtotal', label: 'Subtotal', amountCents: item.subtotal_cents }),
    item.size_surcharge_cents > 0
      ? h(QuoteLine, { key: 'surcharge', label: 'Recargo por talla', amountCents: item.size_surcharge_cents })
      : null,
    h(QuoteLine, { key: 'total', label: 'Total', amountCents: item.total_cents }),
  ]);
}

function QuoteBody({ quote }) {
  const items = quote.items ?? [];
  const showHeading = items.length > 1;

  return h('div', { className: 'es-resumen-quote' }, [
    quote.is_placeholder
      ? h(
          'p',
          { className: 'es-resumen-placeholder', key: 'placeholder' },
          'Precios de referencia — te confirmamos el total antes de cerrar el pedido.',
        )
      : null,
    h(
      'div',
      { className: 'es-resumen-items', key: 'items' },
      items.map((item) => h(QuoteItem, { key: item.index, item, showHeading })),
    ),
    h('div', { className: 'es-resumen-total', key: 'grand-total' }, [
      h('span', { key: 'l' }, 'Total del pedido'),
      h('span', { key: 'v' }, formatCentsMXN(quote.total_cents)),
    ]),
  ]);
}

export function PanelResumen({
  quote,
  loading,
  error,
  customer,
  onCustomer,
  onSubmit,
  canSubmit,
  submitting,
}) {
  const name = customer?.name ?? '';
  const email = customer?.email ?? '';
  const phone = customer?.phone ?? '';
  const emailLooksInvalid = email.length > 0 && !isLikelyValidEmail(email);

  let quoteArea;
  if (loading) {
    quoteArea = h('p', { className: 'es-resumen-status', 'aria-live': 'polite' }, 'Cotizando…');
  } else if (error) {
    quoteArea = h('div', { className: 'es-resumen-error', role: 'alert' }, [
      h('p', { key: 'msg' }, error.message || 'No pudimos calcular tu cotización.'),
      h(
        'p',
        { className: 'es-resumen-error-hint', key: 'hint' },
        'Ajusta la prenda o las tallas para volver a intentarlo.',
      ),
    ]);
  } else if (quote) {
    quoteArea = h(QuoteBody, { quote });
  } else {
    quoteArea = h('p', { className: 'es-resumen-status' }, 'Elige tu prenda y tus tallas para ver el precio.');
  }

  return h('section', { className: 'es-panel es-panel-resumen' }, [
    h('h2', { className: 'es-field-label', key: 'heading' }, 'Resumen y contacto'),
    quoteArea,

    h('div', { className: 'es-resumen-contact', key: 'contact' }, [
      h('div', { className: 'es-field', key: 'name' }, [
        h('label', { className: 'es-label-sm', htmlFor: 'es-customer-name', key: 'label' }, 'Nombre'),
        h('input', {
          key: 'input',
          type: 'text',
          id: 'es-customer-name',
          className: 'es-input',
          autoComplete: 'name',
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
        h('label', { className: 'es-label-sm', htmlFor: 'es-customer-phone', key: 'label' }, 'WhatsApp (opcional)'),
        h('input', {
          key: 'input',
          type: 'tel',
          id: 'es-customer-phone',
          className: 'es-input',
          autoComplete: 'tel',
          placeholder: '55 1234 5678',
          value: phone,
          onChange: (e) => onCustomer('phone', e.target.value),
        }),
      ]),
    ]),

    // El wrapper es sólo para poder pegar el botón al fondo del viewport en
    // escritorio ancho (ver .es-resumen-cta en studio.css) sin duplicar
    // onSubmit/canSubmit ni el botón mismo.
    h('div', { className: 'es-resumen-cta', key: 'cta' },
      h(
        'button',
        {
          type: 'button',
          className: 'es-btn es-btn-wa es-resumen-submit',
          disabled: !canSubmit || submitting,
          onClick: onSubmit,
        },
        submitting ? 'Enviando…' : 'Enviar pedido por WhatsApp',
      ),
    ),
  ]);
}
