import { describe, it, expect } from 'vitest';
import { json, requireMethod, readJsonBody, clientIp } from '../../api/_lib/http.js';

// Objetos req/res falsos hechos a mano, sin librerías nuevas. fakeRes imita
// el patrón encadenable de Vercel/Express: res.status(code).json(body).
// fakeReq imita un IncomingMessage: un emisor de eventos 'data'/'end'/'error'
// minimalista, suficiente para dirigir readJsonBody sin depender de node:http
// ni de node:events.
function makeFakeRes() {
  return {
    statusCode: null,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function makeFakeReq({ headers = {} } = {}) {
  const listeners = {};
  return {
    headers,
    on(event, cb) {
      (listeners[event] ||= []).push(cb);
      return this;
    },
    removeListener(event, cb) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((fn) => fn !== cb);
      }
      return this;
    },
    _emit(event, ...args) {
      // Copia defensiva: un handler puede desregistrarse a sí mismo durante
      // la emisión (p.ej. al fallar), y no queremos mutar el array in situ
      // mientras lo recorremos.
      (listeners[event] || []).slice().forEach((cb) => cb(...args));
    },
  };
}

describe('http.js — json', () => {
  it('1. llama res.status(status) y luego res.json(body)', () => {
    const res = makeFakeRes();
    json(res, 201, { ok: true });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('http.js — requireMethod', () => {
  it('2. método coincide → devuelve true y no toca res', () => {
    const res = makeFakeRes();
    const req = { method: 'POST' };
    expect(requireMethod(req, res, 'POST')).toBe(true);
    expect(res.statusCode).toBeNull();
  });

  it('3. método NO coincide → devuelve false y responde 405', () => {
    const res = makeFakeRes();
    const req = { method: 'GET' };
    expect(requireMethod(req, res, 'POST')).toBe(false);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'METHOD_NOT_ALLOWED' });
  });
});

describe('http.js — clientIp', () => {
  it('4. toma el primero de x-forwarded-for, con trim', () => {
    const req = makeFakeReq({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' } });
    expect(clientIp(req)).toBe('203.0.113.5');
  });

  it('5. respeta espacios alrededor de la primera IP', () => {
    const req = makeFakeReq({ headers: { 'x-forwarded-for': '  203.0.113.9   , 10.0.0.1' } });
    expect(clientIp(req)).toBe('203.0.113.9');
  });

  it('6. sin el header, devuelve "unknown"', () => {
    const req = makeFakeReq({ headers: {} });
    expect(clientIp(req)).toBe('unknown');
  });

  it('7. header con una sola IP (sin comas) la devuelve tal cual', () => {
    const req = makeFakeReq({ headers: { 'x-forwarded-for': '203.0.113.5' } });
    expect(clientIp(req)).toBe('203.0.113.5');
  });

  it('8. (cosecha) req sin objeto headers no lanza, devuelve "unknown"', () => {
    expect(clientIp({})).toBe('unknown');
  });
});

describe('http.js — readJsonBody', () => {
  it('9. body JSON válido se resuelve parseado', async () => {
    const req = makeFakeReq();
    const promise = readJsonBody(req, { maxBytes: 1024 });
    req._emit('data', Buffer.from('{"a":1,"b":"dos"}'));
    req._emit('end');
    await expect(promise).resolves.toEqual({ a: 1, b: 'dos' });
  });

  it('10. body repartido en varios chunks se concatena antes de parsear', async () => {
    const req = makeFakeReq();
    const promise = readJsonBody(req, { maxBytes: 1024 });
    req._emit('data', Buffer.from('{"a":'));
    req._emit('data', Buffer.from('42}'));
    req._emit('end');
    await expect(promise).resolves.toEqual({ a: 42 });
  });

  it('11. JSON malformado rechaza con code INVALID_JSON, nunca un SyntaxError crudo', async () => {
    const req = makeFakeReq();
    const promise = readJsonBody(req, { maxBytes: 1024 });
    req._emit('data', Buffer.from('{esto no es json'));
    req._emit('end');
    await expect(promise).rejects.toMatchObject({ code: 'INVALID_JSON' });
  });

  it('12. body que excede maxBytes rechaza con PAYLOAD_TOO_LARGE antes de intentar parsear', async () => {
    const req = makeFakeReq();
    const promise = readJsonBody(req, { maxBytes: 10 });
    req._emit('data', Buffer.from('{"a":"01234567890123456789"}')); // > 10 bytes
    // Si intentara parsear, este JSON de hecho es válido — el rechazo por
    // tamaño debe ganar de todos modos, confirmando que ocurre ANTES del parseo.
    await expect(promise).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('13. la suma de varios chunks pequeños que superan maxBytes también rechaza', async () => {
    const req = makeFakeReq();
    const promise = readJsonBody(req, { maxBytes: 10 });
    req._emit('data', Buffer.from('123456'));
    req._emit('data', Buffer.from('7890123')); // total 13 > 10
    await expect(promise).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('14. sin maxBytes explícito, el default es 256 KB (un body de 300 KB rechaza)', async () => {
    const req = makeFakeReq();
    const promise = readJsonBody(req);
    req._emit('data', Buffer.alloc(300 * 1024, 'a'));
    await expect(promise).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('15. un body de 200 KB (bajo el default de 256 KB) no rechaza por tamaño', async () => {
    const req = makeFakeReq();
    const promise = readJsonBody(req);
    const payload = JSON.stringify({ big: 'a'.repeat(200 * 1024 - 20) });
    req._emit('data', Buffer.from(payload));
    req._emit('end');
    await expect(promise).resolves.toBeTruthy();
  });

  it('16. un error del stream se propaga (rechaza la promesa, no queda colgada)', async () => {
    const req = makeFakeReq();
    const promise = readJsonBody(req, { maxBytes: 1024 });
    const boom = new Error('stream roto');
    req._emit('error', boom);
    await expect(promise).rejects.toBe(boom);
  });

  it('17. (cosecha) body vacío se resuelve como undefined, sin lanzar INVALID_JSON', async () => {
    const req = makeFakeReq();
    const promise = readJsonBody(req, { maxBytes: 1024 });
    req._emit('end');
    await expect(promise).resolves.toBeUndefined();
  });
});
