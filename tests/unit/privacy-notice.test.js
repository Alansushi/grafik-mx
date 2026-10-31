import { it, expect } from 'vitest';
import privacyNotice from '../../api/privacy-notice.js';

it('publica el aviso integral con los datos configurados y el flujo real de WhatsApp', () => {
  const previous = { ...process.env };
  Object.assign(process.env, {
    QUOTE_CAPTURE_ENABLED: '1',
    PRIVACY_CONTROLLER: 'Orkestalo S.A.S. de C.V.',
    PRIVACY_ADDRESS: 'Norte 13 núm. 282, CDMX',
    PRIVACY_EMAIL: 'info@orkestalo.com',
  });
  const res = {
    code: 0, headers: {}, body: '',
    status(code) { this.code = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    send(body) { this.body = body; return this; },
  };
  try {
    privacyNotice({ method: 'GET' }, res);
    expect(res.code).toBe(200);
    expect(res.body).toContain('Orkestalo S.A.S. de C.V.');
    expect(res.body).toContain('Norte 13 núm. 282, CDMX');
    expect(res.body).toContain('mailto:info@orkestalo.com');
    expect(res.body).toContain('nombre, correo, teléfono y detalle');
    expect(res.body).toContain('debes enviarlo desde esa aplicación');
    expect(res.body).toContain('Las promociones requieren tu aceptación separada');
    expect(res.body).toContain('Supabase');
    expect(res.body).toContain('Resend');
    expect(res.body).toContain('derechos ARCO');
    expect(res.body).toContain('Volver a GRAFIK');
    expect(res.body).toContain('href="/styles.css"');
    expect(res.body).toContain('class="privacy-page"');
  } finally {
    process.env = previous;
  }
});
