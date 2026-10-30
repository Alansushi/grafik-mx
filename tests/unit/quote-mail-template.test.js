import { describe, expect, it } from 'vitest';
import { renderQuoteMail } from '../../api/_lib/quote-mail-template.js';

const baseUrl = 'https://www.grafik.mx';
const intent = {
  name: 'Ana', channel: 'contacto', return_token: 'return-token',
  unsubscribe_token: 'unsubscribe-token',
};

describe('plantillas de correo de cotización', () => {
  it('confirma lo guardado sin afirmar que WhatsApp recibió el mensaje', () => {
    const { subject, preheader, html } = renderQuoteMail({ kind: 'confirmation', intent, baseUrl });
    expect(subject).toContain('Guardamos tu solicitud');
    expect(preheader).toContain('WhatsApp');
    expect(html).toContain('enviar el mensaje desde WhatsApp');
    expect(html).toContain('Visitar GRAFIK');
    expect(html).not.toContain('Orkestalo lo recibi');
  });

  it('da un retorno distinto para Contacto y Estudio, y aclara la pérdida del diseño', () => {
    const contacto = renderQuoteMail({ kind: 'reminder', intent, baseUrl });
    const estudio = renderQuoteMail({
      kind: 'reminder', intent: { ...intent, channel: 'estudio' }, baseUrl,
    });
    expect(contacto.html).toContain('href="https://www.grafik.mx/?r=return-token#contacto"');
    expect(contacto.html).toContain('Retomar mi cotización');
    expect(estudio.html).toContain('href="https://www.grafik.mx/estudio/?r=return-token"');
    expect(estudio.html).toContain('no recupera tu diseño anterior');
    expect(estudio.html).toContain('Volver al Estudio');
    expect(contacto.preheader).not.toBe(estudio.preheader);
  });

  it('incluye la baja y escapa nombre y tokens dinámicos', () => {
    const html = renderQuoteMail({
      kind: 'reminder',
      intent: { ...intent, name: '<img src=x onerror=alert(1)> & Ana', return_token: 'a"&<', unsubscribe_token: 'b"&<' },
      baseUrl,
    }).html;
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; Ana');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('r=a%22%26%3C');
    expect(html).toContain('t=b%22%26%3C');
    expect(html).toContain('No recibir más correos de seguimiento ni promociones');
  });

  it('usa estructura de correo, estilos en línea, símbolo con alternativa de texto y ancho de 600 px', () => {
    const html = renderQuoteMail({ kind: 'reminder', intent, baseUrl }).html;
    expect(html).toContain('width="600"');
    expect(html).toContain('max-width:600px');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('style="');
    expect(html).toContain('assets/grafik-favicon-512.png');
    expect(html).toContain('GRAFIK');
    expect(html).toContain('wa.me/525539014600');
    expect(html).toContain('grafik.mx');
    expect(html).toContain('Barlow Condensed');
    expect(html).toContain('Arial');
  });

  it.each([
    ['confirmation', 'contacto', 'https://www.grafik.mx/'],
    ['reminder', 'contacto', 'https://www.grafik.mx/?r=return-token#contacto'],
    ['reminder', 'estudio', 'https://www.grafik.mx/estudio/?r=return-token'],
  ])('mantiene enlaces válidos y baja en %s para %s', (kind, channel, expectedReturn) => {
    const { html } = renderQuoteMail({ kind, intent: { ...intent, channel }, baseUrl });
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toContain(expectedReturn);
    expect(hrefs).toContain('https://www.grafik.mx/api/unsubscribe?t=unsubscribe-token');
    expect(hrefs).toContain('https://wa.me/525539014600');
    expect(hrefs.every((url) => url.startsWith('https://'))).toBe(true);
    expect(html).toContain('No recibir más correos de seguimiento ni promociones');
  });
});
