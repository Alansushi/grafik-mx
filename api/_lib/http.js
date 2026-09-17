// api/_lib/http.js
//
// Helpers mínimos para Vercel Functions en Node.js plano (sin Express, sin
// dependencias). `req` es un IncomingMessage: el body no llega parseado, hay
// que leerlo a mano desde el stream. Ningún binario cruza api/*, así que un
// body que se pasa de tamaño sólo puede ser abuso — de ahí el corte duro en
// readJsonBody, ANTES de intentar parsear nada.

import { AppError } from '../../estudio/lib/errors.js';

const DEFAULT_MAX_BYTES = 256 * 1024; // 256 KB

/** Responde JSON con el status dado. Encadenable al estilo res.status().json() de Vercel/Express. */
export function json(res, status, body) {
  res.status(status).json(body);
}

/**
 * Verifica el método HTTP. Si no coincide, responde 405 y devuelve false —
 * el handler debe cortar ahí (`if (!requireMethod(...)) return;`).
 */
export function requireMethod(req, res, method) {
  if (req.method !== method) {
    json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return false;
  }
  return true;
}

/**
 * Lee el body de `req` acumulando chunks, corta con PAYLOAD_TOO_LARGE en
 * cuanto se supera `maxBytes` (sin esperar a 'end' ni intentar parsear), y
 * convierte cualquier JSON malformado en INVALID_JSON en vez de dejar
 * escapar el SyntaxError crudo de JSON.parse.
 */
export function readJsonBody(req, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    let settled = false;

    const cleanup = () => {
      req.removeListener?.('data', onData);
      req.removeListener?.('end', onEnd);
      req.removeListener?.('error', onError);
    };

    function settleReject(err) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }

    function onData(chunk) {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        settleReject(
          new AppError('PAYLOAD_TOO_LARGE', 'El cuerpo de la petición excede el límite permitido', { maxBytes })
        );
        return;
      }
      chunks.push(buf);
    }

    function onEnd() {
      if (settled) return;
      settled = true;
      cleanup();

      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.trim() === '') {
        // Body vacío: no es JSON malformado, es la ausencia legítima de body.
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new AppError('INVALID_JSON', 'El cuerpo de la petición no es JSON válido', {}));
      }
    }

    function onError(err) {
      settleReject(err);
    }

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

/**
 * IP del cliente a partir de x-forwarded-for: toma el primero de la lista
 * (el más cercano al cliente real; los siguientes son proxies intermedios),
 * con trim. Sin el header, 'unknown' — nunca lanza.
 */
export function clientIp(req) {
  let header = req?.headers?.['x-forwarded-for'];
  if (Array.isArray(header)) header = header[0];
  if (!header) return 'unknown';
  const first = String(header).split(',')[0].trim();
  return first || 'unknown';
}
