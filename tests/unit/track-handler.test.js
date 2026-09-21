import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import handler from '../../api/track.js';

// El handler se prueba con req/res falsos y `fetch` simulado: sin red y sin
// Supabase. Lo que se vigila aquí es lo que NO se ve desde el navegador porque
// el cliente nunca lee la respuesta: qué se filtra, qué se limita y, sobre
// todo, que la IP del visitante no llegue a ninguna escritura.

const IP = '203.0.113.77';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const SERVICE_KEY = 'service-key-de-prueba';
const LOTE = {
  sid: 'a1b2c3d4e5f6',
  ctx: { device: 'mobile', vw: 390, utm_source: 'instagram' },
  events: [{ name: 'cta_click', t_ms: 4200, path: '/', props: { cta_id: 'hero', kind: 'whatsapp' } }],
};

function fakeReq({ method = 'POST', headers = {}, body } = {}) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const listeners = {};
  const req = {
    method,
    headers: { host: 'www.grafik.mx', 'user-agent': UA, 'x-forwarded-for': IP, ...headers },
    on(ev, cb) {
      (listeners[ev] ||= []).push(cb);
      if (ev === 'end') {
        queueMicrotask(() => {
          (listeners.data || []).forEach((f) => f(Buffer.from(raw)));
          (listeners.end || []).forEach((f) => f());
        });
      }
      return req;
    },
    removeListener() { return req; },
  };
  return req;
}

function fakeRes() {
  return {
    statusCode: null, body: undefined, ended: false,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { this.ended = true; return this; },
  };
}

let llamadas;
function stubFetch({ limiter = true, limiterOk = true, insertOk = true } = {}) {
  llamadas = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    llamadas.push({ url: String(url), init });
    if (String(url).includes('rpc_rate_limit_hit')) {
      return { ok: limiterOk, status: limiterOk ? 200 : 500, json: async () => limiter, text: async () => '' };
    }
    return { ok: insertOk, status: insertOk ? 201 : 500, text: async () => 'boom', json: async () => ({}) };
  }));
}
const inserciones = () => llamadas.filter((c) => c.url.includes('/rest/v1/site_events'));
const limitadores = () => llamadas.filter((c) => c.url.includes('rpc_rate_limit_hit'));

let envAntes;
beforeEach(() => {
  envAntes = { ...process.env };
  process.env.SUPABASE_URL = 'https://proyecto.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  delete process.env.TRACK_ALLOWED_HOSTS;
  stubFetch();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = envAntes;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function correr(reqOpts) {
  const res = fakeRes();
  await handler(fakeReq(reqOpts), res);
  return res;
}

describe('api/track.js', () => {
  it('1. sólo acepta POST', async () => {
    const res = await correr({ method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(llamadas).toHaveLength(0);
  });

  it('2. sin configuración de Supabase → 503 y sin tocar la red', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await correr({ body: LOTE });
    expect(res.statusCode).toBe(503);
    expect(llamadas).toHaveLength(0);
  });

  it('3. lote válido → 204, una inserción con contexto, geo y sin IP', async () => {
    const res = await correr({
      body: LOTE,
      headers: { 'x-vercel-ip-country': 'MX', 'x-vercel-ip-country-region': 'CMX' },
    });
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);

    const [ins] = inserciones();
    expect(ins.init.method).toBe('POST');
    expect(ins.init.headers.Prefer).toBe('return=minimal');
    const filas = JSON.parse(ins.init.body);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      sid: 'a1b2c3d4e5f6', event: 'cta_click', device: 'mobile', vw: 390,
      utm_source: 'instagram', country: 'MX', region: 'CMX',
      props: { cta_id: 'hero', kind: 'whatsapp' },
    });
  });

  it('4. PRIVACIDAD: la IP no aparece en ninguna escritura (ni cruda ni en el bucket)', async () => {
    await correr({ body: LOTE });
    for (const c of llamadas) {
      expect(c.url).not.toContain(IP);
      expect(String(c.init?.body ?? '')).not.toContain(IP);
    }
    const bucket = JSON.parse(limitadores()[0].init.body).p_bucket;
    expect(bucket).toMatch(/^track:[0-9a-f]{16}$/);
  });

  it('5. la misma IP cae en el mismo bucket y otra IP en uno distinto', async () => {
    const bucketDe = async (ip) => {
      stubFetch();
      await correr({ body: LOTE, headers: { 'x-forwarded-for': ip } });
      return JSON.parse(limitadores()[0].init.body).p_bucket;
    };
    const a1 = await bucketDe('198.51.100.1');
    const a2 = await bucketDe('198.51.100.1');
    const b = await bucketDe('198.51.100.2');
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it.each([
    ['host de preview', { host: 'publicidad-abc.vercel.app' }],
    ['localhost', { host: 'localhost:3000' }],
    ['bot', { 'user-agent': 'Googlebot/2.1' }],
    ['sin user-agent', { 'user-agent': '' }],
  ])('6. filtro silencioso (%s) → 204 sin escribir nada', async (_n, headers) => {
    const res = await correr({ body: LOTE, headers });
    expect(res.statusCode).toBe(204);
    expect(llamadas).toHaveLength(0);
  });

  it('7. TRACK_ALLOWED_HOSTS permite probar en un preview', async () => {
    process.env.TRACK_ALLOWED_HOSTS = 'publicidad-abc.vercel.app';
    const res = await correr({ body: LOTE, headers: { host: 'publicidad-abc.vercel.app' } });
    expect(res.statusCode).toBe(204);
    expect(inserciones()).toHaveLength(1);
  });

  it.each([
    ['lote sin sid', { events: LOTE.events }, 'INVALID_SID'],
    ['lote vacío', { sid: LOTE.sid, events: [] }, 'EMPTY_EVENTS'],
    ['ningún evento válido', { sid: LOTE.sid, events: [{ name: 'hackeo' }] }, 'NO_VALID_EVENTS'],
  ])('8. %s → 400 %s y nada se guarda', async (_n, body, error) => {
    const res = await correr({ body });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error });
    expect(inserciones()).toHaveLength(0);
  });

  it('9. cuerpo demasiado grande → 413', async () => {
    const res = await correr({ body: { ...LOTE, relleno: 'x'.repeat(9000) } });
    expect(res.statusCode).toBe(413);
    expect(llamadas).toHaveLength(0);
  });

  it('10. límite de tasa excedido → 429 y no inserta', async () => {
    stubFetch({ limiter: false });
    const res = await correr({ body: LOTE });
    expect(res.statusCode).toBe(429);
    expect(inserciones()).toHaveLength(0);
  });

  it('11. si el limitador falla se deja pasar: no se pierden métricas por una función auxiliar', async () => {
    stubFetch({ limiterOk: false });
    const res = await correr({ body: LOTE });
    expect(res.statusCode).toBe(204);
    expect(inserciones()).toHaveLength(1);
  });

  it('12. si la inserción falla → 502 y el error se registra sin la key', async () => {
    stubFetch({ insertOk: false });
    const res = await correr({ body: LOTE });
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'TRACK_FAILED' });
    expect(console.error).toHaveBeenCalled();
    expect(JSON.stringify(console.error.mock.calls)).not.toContain(SERVICE_KEY);
  });
});
