import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CTA_IDS, MAX_EVENTS, validateBatch, cleanGeo, parseAllowedHosts,
  requestHostname, isBotUserAgent,
} from '../../api/_lib/events.js';

const SID = 'a1b2c3d4e5f6';
const cta = (over = {}) => ({
  name: 'cta_click', t_ms: 5123, path: '/',
  props: { cta_id: 'hero', kind: 'whatsapp' }, ...over,
});
const batch = (events, extra = {}) => ({ sid: SID, ctx: { device: 'mobile', vw: 390 }, events, ...extra });

describe('events.js — validateBatch: forma del lote', () => {
  it('1. lote válido → una fila con sid, evento y contexto', () => {
    const r = validateBatch(batch([cta()]));
    expect(r.ok).toBe(true);
    expect(r.dropped).toBe(0);
    expect(r.rows).toEqual([{
      sid: SID, event: 'cta_click', path: '/', t_ms: 5123,
      props: { cta_id: 'hero', kind: 'whatsapp' },
      referrer_host: null, utm_source: null, utm_medium: null, utm_campaign: null,
      utm_content: null, utm_term: null, device: 'mobile', vw: 390,
    }]);
  });

  it('2. todas las filas salen con las mismas claves (PostgREST exige uniformidad)', () => {
    const r = validateBatch(batch([{ name: 'page_view' }, cta()]));
    const [a, b] = r.rows;
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  });

  it.each([
    ['sin body', undefined, 'INVALID_BODY'],
    ['body array', [], 'INVALID_BODY'],
    ['sid ausente', { events: [cta()] }, 'INVALID_SID'],
    ['sid con mayúsculas', batch([cta()], { sid: 'ABCDEFGH12' }), 'INVALID_SID'],
    ['sid demasiado corto', batch([cta()], { sid: 'abc' }), 'INVALID_SID'],
    ['events no es array', batch('x'), 'EMPTY_EVENTS'],
    ['events vacío', batch([]), 'EMPTY_EVENTS'],
  ])('3. rechaza el lote: %s', (_n, body, error) => {
    expect(validateBatch(body)).toEqual({ ok: false, error });
  });

  it('4. más de MAX_EVENTS eventos → TOO_MANY_EVENTS', () => {
    const r = validateBatch(batch(Array.from({ length: MAX_EVENTS + 1 }, () => cta())));
    expect(r).toEqual({ ok: false, error: 'TOO_MANY_EVENTS' });
  });
});

describe('events.js — validateBatch: lista blanca de eventos y props', () => {
  it('5. un evento inválido se descarta sin llevarse al resto del lote', () => {
    const r = validateBatch(batch([{ name: 'hackeo' }, cta(), null, 'x']));
    expect(r.rows).toHaveLength(1);
    expect(r.dropped).toBe(3);
  });

  it('6. cta_id fuera del catálogo (un typo en el HTML) descarta el evento', () => {
    const r = validateBatch(batch([cta({ props: { cta_id: 'hreo', kind: 'whatsapp' } })]));
    expect(r.rows).toHaveLength(0);
    expect(r.dropped).toBe(1);
  });

  it('7. kind o cta_id ausentes descartan el evento (son obligatorios)', () => {
    expect(validateBatch(batch([cta({ props: { cta_id: 'hero' } })])).rows).toHaveLength(0);
    expect(validateBatch(batch([cta({ props: { kind: 'tel' } })])).rows).toHaveLength(0);
  });

  it('8. PRIVACIDAD: nombre, correo, teléfono y detalle NUNCA llegan a la fila', () => {
    const r = validateBatch(batch([cta({
      props: {
        cta_id: 'contacto-form', kind: 'form', servicio: 'Lonas',
        name: 'Juan Pérez', nombre: 'Juan', email: 'juan@correo.com',
        phone: '5512345678', telefono: '5512345678',
        detalle: 'Necesito 5 lonas para el sábado', message: 'hola',
      },
    })]));
    const guardado = JSON.stringify(r.rows[0]);
    expect(r.rows[0].props).toEqual({ cta_id: 'contacto-form', kind: 'form', servicio: 'Lonas' });
    for (const secreto of ['Juan', 'juan@correo.com', '5512345678', 'lonas para el sábado']) {
      expect(guardado).not.toContain(secreto);
    }
  });

  it('9. servicio y work_cat aceptan acentos, pero no símbolos de inyección', () => {
    const ok = validateBatch(batch([cta({
      props: { cta_id: 'lightbox', kind: 'whatsapp', work_cat: 'Pósters', servicio: 'Artículos Promocionales' },
    })]));
    expect(ok.rows[0].props.work_cat).toBe('Pósters');
    expect(ok.rows[0].props.servicio).toBe('Artículos Promocionales');

    const mal = validateBatch(batch([cta({
      props: { cta_id: 'lightbox', kind: 'whatsapp', work_cat: "x'; drop table site_events;--", servicio: '<script>' },
    })]));
    expect(mal.rows[0].props).toEqual({ cta_id: 'lightbox', kind: 'whatsapp' });
  });

  it('10. path: sólo pathname (la query puede traer un correo o un token)', () => {
    const r = validateBatch(batch([cta({ path: '/estudio/?email=a@b.com#x' })]));
    expect(r.rows[0].path).toBe('/estudio/');
    expect(validateBatch(batch([cta({ path: 'https://evil' })])).rows[0].path).toBeNull();
  });

  it('11. t_ms fuera de rango o no entero → null, el evento se conserva', () => {
    for (const t of [-1, 1.5, '5', 90_000_000, null]) {
      expect(validateBatch(batch([cta({ t_ms: t })])).rows[0].t_ms).toBeNull();
    }
  });
});

describe('events.js — contexto de sesión', () => {
  it('12. UTM y referrer válidos pasan; referrer se normaliza a minúsculas', () => {
    const r = validateBatch(batch([cta()], {
      ctx: { referrer_host: 'L.Facebook.com', utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'promo-septiembre', device: 'desktop', vw: 1440 },
    }));
    expect(r.rows[0]).toMatchObject({
      referrer_host: 'l.facebook.com', utm_source: 'instagram', utm_medium: 'bio',
      utm_campaign: 'promo-septiembre', device: 'desktop', vw: 1440,
    });
  });

  it('13. contexto hostil se anula campo por campo sin descartar el evento', () => {
    const r = validateBatch(batch([cta()], {
      ctx: { referrer_host: 'a b/c', utm_source: 'x'.repeat(101), utm_medium: '<b>', device: 'watch', vw: 999999 },
    }));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      referrer_host: null, utm_source: null, utm_medium: null, device: null, vw: null,
    });
  });
});

describe('events.js — geo, hosts y bots', () => {
  it('14. cleanGeo acepta ISO-2 y región corta, y anula lo demás', () => {
    expect(cleanGeo('mx', 'CMX')).toEqual({ country: 'MX', region: 'CMX' });
    expect(cleanGeo('MEX', 'una región larguísima')).toEqual({ country: null, region: null });
    expect(cleanGeo(undefined, undefined)).toEqual({ country: null, region: null });
  });

  it('15. hosts: por defecto sólo producción; TRACK_ALLOWED_HOSTS lo sustituye', () => {
    expect(parseAllowedHosts(undefined)).toEqual(['grafik.mx', 'www.grafik.mx']);
    expect(parseAllowedHosts('')).toEqual(['grafik.mx', 'www.grafik.mx']);
    expect(parseAllowedHosts(' Preview.Vercel.app , grafik.mx ')).toEqual(['preview.vercel.app', 'grafik.mx']);
  });

  it('16. requestHostname quita el puerto y no lanza sin header', () => {
    expect(requestHostname({ host: 'WWW.grafik.mx' })).toBe('www.grafik.mx');
    expect(requestHostname({ host: 'localhost:3000' })).toBe('localhost');
    expect(requestHostname({})).toBe('');
    expect(requestHostname(undefined)).toBe('');
  });

  it('17. bots: rastreadores y herramientas, y User-Agent ausente', () => {
    for (const ua of ['Googlebot/2.1', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'curl/8.4.0', 'HeadlessChrome/120', 'Lighthouse', undefined, '']) {
      expect(isBotUserAgent(ua)).toBe(true);
    }
    expect(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe(false);
  });
});

// El descarte de un cta_id desconocido es deliberado y silencioso en producción
// (ver arriba, test 6). Este test es lo que impide que un typo en index.html
// pierda un botón entero de la métrica sin que nadie se entere: cruza la lista
// del servidor con los data-cta que de verdad están en el marcado.
describe('events.js — sincronía con index.html', () => {
  const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
  const HTML = readFileSync(`${RAIZ}index.html`, 'utf8');

  // El formulario no es un enlace: emite su evento a mano desde handleSubmit.
  const manuales = [...HTML.matchAll(/grafikTrack\(\s*'cta_click'\s*,\s*\{\s*cta_id:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  const marcados = [...HTML.matchAll(/data-cta="([a-z-]+)"/g)].map((m) => m[1]);

  it('18. cada data-cta del HTML existe en CTA_IDS', () => {
    for (const id of [...marcados, ...manuales]) expect(CTA_IDS).toContain(id);
  });

  it('19. cada CTA_IDS está marcado en el HTML (ninguno queda sin medir) y no hay repetidos', () => {
    const todos = [...marcados, ...manuales];
    expect(new Set(todos).size).toBe(todos.length);
    expect([...todos].sort()).toEqual([...CTA_IDS].sort());
  });

  it('20. todo enlace con data-cta lleva un href que el cliente sabe clasificar (wa.me o tel:)', () => {
    const enlaces = [...HTML.matchAll(/<a\b[^>]*data-cta="([a-z-]+)"[^>]*>/g)];
    expect(enlaces.length).toBe(marcados.length);
    for (const [tag, id] of enlaces) {
      expect(tag, `data-cta="${id}"`).toMatch(/waLink\(|href=\{`tel:/);
    }
  });
});
