import { it, expect } from 'vitest';
import unsubscribe from '../../api/unsubscribe.js';

function response() {
  return {
    code: 0, headers: {}, body: '',
    status(code) { this.code = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    send(body) { this.body = body; return this; },
  };
}

const TOKEN = '123e4567-e89b-42d3-a456-426614174000';

it('presenta la baja con la identidad de GRAFIK y conserva el formulario', async () => {
  const res = response();
  await unsubscribe({ method: 'GET', query: { t: TOKEN } }, res);
  expect(res.code).toBe(200);
  expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
  expect(res.headers['X-Robots-Tag']).toBe('noindex, nofollow');
  expect(res.body).toContain('href="/styles.css"');
  expect(res.body).toContain('href="/defs.svg#mark"');
  expect(res.body).toContain('class="unsubscribe-page"');
  expect(res.body).toContain('Confirma que ya no quieres recibir correos de seguimiento ni promociones.');
  expect(res.body).toContain('<form method="post"');
  expect(res.body).toContain(`name="token" value="${TOKEN}"`);
  expect(res.body).toContain('Confirmar baja');
});

it('muestra el enlace inválido con el mismo diseño y sin formulario', async () => {
  const res = response();
  await unsubscribe({ method: 'GET', query: { t: 'invalid' } }, res);
  expect(res.body).toContain('class="unsubscribe-page"');
  expect(res.body).toContain('El enlace no es válido.');
  expect(res.body).not.toContain('<form');
  expect(res.body).toContain('Volver al sitio');
});
