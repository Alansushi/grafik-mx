import { describe, it, expect, vi, afterEach } from 'vitest';
import { redact, logError } from '../../api/_lib/log.js';
import { sbHeaders } from '../../api/_lib/supabase.js';
import { AppError, MpConfigError } from '../../estudio/lib/errors.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('log.js — redact (por prefijo de valor)', () => {
  // Las 5 formas de clave que redact() debe detectar por prefijo, sin
  // importar el nombre de la propiedad que las contiene.
  it('1. redacta un string que empieza por "TEST-" (token de MP en modo prueba)', () => {
    expect(redact('TEST-1234567890')).toBe('[REDACTED]');
  });

  it('2. redacta un string que empieza por "APP_USR-" (token de MP en producción)', () => {
    expect(redact('APP_USR-1234567890')).toBe('[REDACTED]');
  });

  it('3. redacta un string que empieza por "re_" (API key de Resend)', () => {
    expect(redact('re_abc123XYZ')).toBe('[REDACTED]');
  });

  it('4. redacta un string que empieza por "eyJ" (JWT, p.ej. service_role key)', () => {
    expect(redact('eyJhbGciOiJIUzI1NiJ9.payload.sig')).toBe('[REDACTED]');
  });

  // Los formatos que este caso probaba ('sbp_'/'sbs_') NO EXISTEN: vinieron de
  // una redacción equivocada del spec, que yo escribí. Las claves reales de
  // Supabase son sb_publishable_... y sb_secret_..., verificado contra la key
  // real del proyecto grafik-estudio. Con la regex anterior, una key de
  // Supabase jamás se habría redactado.
  it('5. redacta las claves de Supabase en su formato REAL', () => {
    expect(redact('sb_publishable_RlAaun0LluOAAsUek90OaQ')).toBe('[REDACTED]');
    expect(redact('sb_secret_abc123def')).toBe('[REDACTED]');
    // y embebidas en un mensaje mas largo
    expect(redact('usando sb_secret_abc123 para firmar')).toBe('usando [REDACTED] para firmar');
  });

  it('6. NO redacta un string normal que no matchea ningún prefijo', () => {
    expect(redact('hola mundo')).toBe('hola mundo');
    expect(redact('recibo-123')).toBe('recibo-123'); // contiene "re" pero no empieza por "re_"
  });

  // CONTRATO CAMBIADO A PROPÓSITO. Este caso afirmaba que un secreto embebido
  // a media cadena NO se redactaba — o sea, documentaba como requisito el
  // agujero que la revisión de seguridad encontró. Un test que fija un
  // comportamiento inseguro no se "arregla" haciéndolo pasar: se cambia el
  // contrato, a conciencia y dejando dicho por qué.
  it('7. un secreto embebido a media cadena SÍ se redacta, y el contexto sobrevive', () => {
    expect(redact('el token es TEST-1234 según el log')).toBe('el token es [REDACTED] según el log');
  });
});

describe('log.js — redact (por nombre de clave sensible)', () => {
  const sensitiveKeys = ['apikey', 'authorization', 'service_role', 'key', 'token', 'secret', 'password'];

  it.each(sensitiveKeys)('8. redacta el valor de la clave "%s" sin importar su contenido', (k) => {
    const input = { [k]: 'valor-cualquiera-sin-formato-de-secreto' };
    expect(redact(input)[k]).toBe('[REDACTED]');
  });

  it('9. es insensible a mayúsculas/minúsculas en el nombre de la clave (Authorization, ApiKey)', () => {
    const input = { Authorization: 'Bearer algo', ApiKey: 'algo' };
    expect(redact(input).Authorization).toBe('[REDACTED]');
    expect(redact(input).ApiKey).toBe('[REDACTED]');
  });

  it('10. sbHeaders({key,jwt}) queda con apikey y Authorization redactados (spec §2.12 caso 9)', () => {
    const headers = sbHeaders({ key: 'proyecto-anon-key', jwt: 'eyJ.user.jwt' });
    const safe = redact(headers);
    expect(safe.apikey).toBe('[REDACTED]');
    expect(safe.Authorization).toBe('[REDACTED]');
    expect(safe['Content-Type']).toBe('application/json'); // esto no es secreto, no se toca
  });

  it('11. una clave no sensible con valor que sí matchea un prefijo también se redacta (las dos reglas conviven)', () => {
    expect(redact({ note: 'eyJalgo' }).note).toBe('[REDACTED]');
  });
});

describe('log.js — redact (recursión)', () => {
  it('12. recorre objetos anidados', () => {
    const input = { a: { b: { apikey: 'x' } } };
    expect(redact(input).a.b.apikey).toBe('[REDACTED]');
  });

  it('13. recorre arrays y arrays de objetos', () => {
    const input = { tokens: ['TEST-1', 'valor-normal', { secret: 'x' }] };
    const safe = redact(input);
    expect(safe.tokens[0]).toBe('[REDACTED]');
    expect(safe.tokens[1]).toBe('valor-normal');
    expect(safe.tokens[2].secret).toBe('[REDACTED]');
  });

  it('14. no toca valores no-string no-objeto (number, boolean, null, undefined)', () => {
    const input = { n: 42, b: true, nul: null, u: undefined };
    expect(redact(input)).toEqual({ n: 42, b: true, nul: null, u: undefined });
  });

  it('15. no muta el objeto original (devuelve una copia)', () => {
    const input = { apikey: 'x' };
    const safe = redact(input);
    expect(safe).not.toBe(input);
    expect(input.apikey).toBe('x');
  });
});

describe('log.js — logError', () => {
  it('16. imprime con console.error y nunca lanza, aunque el "err" sea sólo un string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => logError('webhook', 'SECRET_MISSING')).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('17. trunca el detalle a 500 chars', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const longMessage = 'x'.repeat(2000);
    logError('scope', new Error(longMessage));
    const serialized = JSON.stringify(spy.mock.calls[0]);
    // el mensaje completo (2000 x) no debe aparecer entero
    expect(serialized).not.toContain('x'.repeat(501));
    expect(serialized).toContain('x'.repeat(500));
  });

  it('18. incluye el code del error cuando existe (AppError/subclases)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('mp', new MpConfigError('EMPTY_ITEMS', 'sin items'));
    const serialized = JSON.stringify(spy.mock.calls[0]);
    expect(serialized).toContain('EMPTY_ITEMS');
  });

  it('19. jamás imprime una API key: ni por prefijo en el mensaje ni por nombre de clave en "extra"', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new AppError('SUPABASE_FETCH_FAILED', 'eyJ.filtrado.no-deberia-salir');
    logError('supabase', err, { headers: sbHeaders({ key: 'sb_secret_no_deberia_salir' }) });
    const serialized = JSON.stringify(spy.mock.calls[0]);
    expect(serialized).not.toContain('eyJ.filtrado.no-deberia-salir');
    expect(serialized).not.toContain('sb_secret_no_deberia_salir');
    expect(serialized).toContain('[REDACTED]');
  });

  it('20. nunca lanza aunque "extra" sea un objeto raro (getter que revienta)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const evil = {};
    Object.defineProperty(evil, 'boom', {
      enumerable: true,
      get() {
        throw new Error('kaboom');
      },
    });
    expect(() => logError('scope', new Error('normal'), evil)).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });

  it('21. (cosecha) con err=undefined tampoco lanza', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => logError('scope', undefined)).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── Hallazgo de la revisión de seguridad ─────────────────────────────────
//
// redact() sólo miraba el PREFIJO de la cadena, así que un secreto embebido a
// media cadena sobrevivía intacto. No es hipotético: los mensajes de error de
// fetch traen la URL, y api/catalog.js mete el cuerpo de la respuesta de
// PostgREST dentro del mensaje de Error. Cualquiera de los dos puede arrastrar
// una key hasta los logs de Vercel.
describe('log.js — redact encuentra secretos embebidos, no sólo al inicio', () => {
  it('R1. un JWT a media cadena se redacta', () => {
    const msg = 'fetch fallo: https://x.supabase.co/rest/v1/orders?apikey=eyJhbGciOiJIUzI1NiSECRETO';
    const out = redact(msg);
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiSECRETO');
    expect(out).toContain('[REDACTED]');
    // el contexto útil sobrevive: si se borrara todo, el log no serviría
    expect(out).toContain('fetch fallo');
  });

  it('R2. cada prefijo conocido se detecta embebido', () => {
    const casos = [
      ['token=TEST-123456 fin', 'TEST-123456'],
      ['usa APP_USR-9988 aqui', 'APP_USR-9988'],
      ['key re_abc123def y mas', 're_abc123def'],
      ['sb_secret_xyz789 al medio', 'sb_secret_xyz789'],
      ['bearer eyJhbGciOiJI.abc', 'eyJhbGciOiJI.abc'],
    ];
    for (const [texto, secreto] of casos) {
      expect(redact(texto)).not.toContain(secreto);
    }
  });

  it('R3. no redacta de más: texto normal queda intacto', () => {
    const normal = 'pedido GK-4F2A9C con 12 piezas, total 1800 MXN';
    expect(redact(normal)).toBe(normal);
  });

  it('R4. funciona dentro de objetos y arrays anidados', () => {
    const o = { a: ['x eyJabc.def y'], b: { c: 'pre APP_USR-77 post' } };
    const s = JSON.stringify(redact(o));
    expect(s).not.toContain('eyJabc.def');
    expect(s).not.toContain('APP_USR-77');
  });
});
