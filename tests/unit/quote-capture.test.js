import { describe, it, expect, vi } from 'vitest';
import quoteIntent from '../../api/quote-intent.js';
import sendReminders from '../../api/send-reminders.js';
import { verifySvix } from '../../api/resend-webhook.js';
import { validateBatch } from '../../api/_lib/events.js';

function request(body) {
  const listeners = {};
  const raw = JSON.stringify(body);
  const req = { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.9' },
    on(event, fn) {
      (listeners[event] ||= []).push(fn);
      if (event === 'end') queueMicrotask(() => {
        listeners.data?.forEach((f) => f(Buffer.from(raw)));
        listeners.end?.forEach((f) => f());
      });
      return req;
    },
    removeListener() { return req; },
  };
  return req;
}

function response() {
  return { statusCode: 0, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

describe('captura privada y medición', () => {
  it('permanece apagada por defecto: ni siquiera intenta leer el cuerpo ni escribir en Supabase', async () => {
    const previous = process.env.QUOTE_CAPTURE_ENABLED;
    delete process.env.QUOTE_CAPTURE_ENABLED;
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    try {
      const get = response();
      await quoteIntent({ method: 'GET' }, get);
      expect(get.body).toEqual({ enabled: false });
      const post = response();
      await quoteIntent({ method: 'POST' }, post);
      expect(post.statusCode).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
      if (previous === undefined) delete process.env.QUOTE_CAPTURE_ENABLED;
      else process.env.QUOTE_CAPTURE_ENABLED = previous;
    }
  });

  it('el cron rechaza peticiones sin el secreto antes de tocar datos', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    try {
      const res = response();
      await sendReminders({ method: 'POST', headers: {} }, res);
      expect(res.statusCode).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { fetchMock.mockRestore(); }
  });

  it('guarda un intento sólo en la tabla privada y completar el mismo key no crea otra fila', async () => {
    const old = { ...process.env };
    Object.assign(process.env, { QUOTE_CAPTURE_ENABLED: '1', PRIVACY_CONTROLLER: 'GRAFIK',
      PRIVACY_ADDRESS: 'CDMX', PRIVACY_EMAIL: 'privacidad@grafik.mx',
      SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'test-key' });
    delete process.env.RESEND_API_KEY;
    const calls = [];
    let row;
    const stub = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method || 'GET', body: init.body && JSON.parse(init.body) });
      if (String(url).includes('rpc_rate_limit_hit')) return { ok: true, json: async () => true };
      if (String(url).includes('/quote_intents') && !init.method) return { ok: true, json: async () =>
        String(url).includes('unsubscribed_at=not.is.null') ? [] : row ? [row] : [] };
      if (String(url).includes('/quote_intents') && init.method === 'POST') {
        row = { ...JSON.parse(init.body), id: '11111111-1111-4111-8111-111111111111', status: 'started' };
        return { ok: true, json: async () => [row] };
      }
      if (String(url).includes('/quote_intents') && init.method === 'PATCH') {
        row = { ...row, ...JSON.parse(init.body) };
        return { ok: true, json: async () => [row] };
      }
      throw new Error(`unexpected request ${url}`);
    });
    const base = { key: '00000000-0000-4000-8000-000000000001', channel: 'contacto',
      name: 'Ana', email: 'ana@example.com', service: 'Lonas', marketingConsent: false };
    try {
      const started = response();
      await quoteIntent(request({ ...base, action: 'start' }), started);
      expect(started.body).toEqual({ saved: true, completed: false });
      const done = response();
      await quoteIntent(request({ ...base, action: 'complete' }), done);
      expect(done.body).toEqual({ saved: true, completed: true });
      const retry = response();
      await quoteIntent(request({ ...base, action: 'complete' }), retry);
      expect(retry.body).toEqual({ saved: true, completed: true });
      expect(calls.filter((c) => c.method === 'POST' && c.url.includes('/quote_intents'))).toHaveLength(1);
      expect(row.status).toBe('completed');
      expect(row.marketing_consent).toBe(false);
      expect(calls.some((c) => c.url.includes('/site_events'))).toBe(false);
    } finally { stub.mockRestore(); process.env = old; }
  });

  it('los nuevos eventos permiten pasos pero eliminan datos personales', () => {
    const r = validateBatch({ sid: 'a1b2c3d4e5f6', events: [
      { name: 'form_step', props: { step: 'saved', email: 'cliente@ejemplo.com', nombre: 'Cliente' } },
      { name: 'studio_access', props: { step: 'saved', phone: '5512345678' } },
    ] });
    expect(r.dropped).toBe(0);
    expect(r.rows.map((row) => row.props)).toEqual([{ step: 'saved' }, { step: 'saved' }]);
  });
});

describe('webhook de Resend', () => {
  const secret = 'whsec_plJ3nmyCDGBKInavdOK15jsl';
  const payload = '{"event_type":"ping","data":{"success":true}}';
  const headers = {
    'svix-id': 'msg_loFOjxBNrRLzqYUf',
    'svix-timestamp': '1731705121',
    'svix-signature': 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=',
  };
  const now = 1731705121_000;
  it('acepta el vector oficial de Svix y rechaza cuerpo alterado o timestamp viejo', () => {
    expect(verifySvix(payload, headers, secret, now)).toBe(true);
    expect(verifySvix(payload + ' ', headers, secret, now)).toBe(false);
    expect(verifySvix(payload, headers, secret, now + 301_000)).toBe(false);
  });
});
