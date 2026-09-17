// POST /api/upload-url — firma una subida directa a Supabase Storage.
//
// Ningún binario cruza api/*: el cliente pide aquí una URL firmada (body de
// ~200 bytes) y hace el PUT del archivo directo a Storage. Evita la doble
// transferencia, el 33% que infla base64, y deja que el bucket valide mime y
// tamaño como tercera red — una defensa que no depende de que este código
// acierte.
//
// Es el endpoint abierto más expuesto del sistema: recibe el nombre de archivo
// que teclea un desconocido. De ahí que la ruta se construya con
// storage-paths.js, que neutraliza el path traversal, y no concatenando strings.

import { readEnv } from './_lib/env.js';
import { json, requireMethod, readJsonBody, clientIp } from './_lib/http.js';
import { sbHeaders } from './_lib/supabase.js';
import { logError } from './_lib/log.js';
import { isUuid } from './_lib/validation.js';
import {
  logoObjectPath,
  previewObjectPath,
  isAllowedLogoMime,
  isAllowedPreviewMime,
  isAllowedSize,
  MAX_LOGO_BYTES,
  MAX_PREVIEW_BYTES,
} from './_lib/storage-paths.js';

const KINDS = {
  logo: {
    bucket: 'logos',
    maxBytes: MAX_LOGO_BYTES,
    mimeOk: isAllowedLogoMime,
  },
  preview: {
    bucket: 'previews',
    maxBytes: MAX_PREVIEW_BYTES,
    mimeOk: isAllowedPreviewMime,
  },
};

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  let supabaseUrl;
  let serviceKey;
  try {
    supabaseUrl = readEnv(process.env, 'SUPABASE_URL', { required: true });
    serviceKey = readEnv(process.env, 'SUPABASE_SERVICE_ROLE_KEY', { required: true });
  } catch (err) {
    logError('upload-url', err);
    return json(res, 503, { error: 'NOT_CONFIGURED' });
  }

  let body;
  try {
    body = await readJsonBody(req, { maxBytes: 8192 });
  } catch (err) {
    return json(res, err.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: err.code ?? 'BAD_REQUEST' });
  }

  const { kind, draftId, filename, size, mime, itemIndex } = body ?? {};

  const spec = KINDS[kind];
  if (!spec) return json(res, 400, { error: 'INVALID_KIND' });
  if (!isUuid(draftId)) return json(res, 400, { error: 'INVALID_DRAFT_ID' });
  if (!spec.mimeOk(mime)) return json(res, 415, { error: 'UNSUPPORTED_MEDIA_TYPE', mime });
  if (!Number.isInteger(size) || size <= 0) return json(res, 400, { error: 'INVALID_SIZE' });
  if (!isAllowedSize(size, spec.maxBytes)) {
    return json(res, 413, { error: 'FILE_TOO_LARGE', max_bytes: spec.maxBytes });
  }

  // nowMs y rand se inyectan aquí, no dentro de storage-paths: ese módulo es
  // puro para que sus tests sean deterministas.
  const nowMs = Date.now();
  const rand = randomToken();

  let objectPath;
  try {
    objectPath =
      kind === 'logo'
        ? logoObjectPath({ draftId, filename: String(filename ?? ''), nowMs, rand })
        : previewObjectPath({ draftId, itemIndex: Number(itemIndex ?? 0), nowMs, rand });
  } catch (err) {
    return json(res, 400, { error: err.code ?? 'INVALID_FILENAME' });
  }

  try {
    const signUrl = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/upload/sign/${spec.bucket}/${objectPath}`;
    const r = await fetch(signUrl, {
      method: 'POST',
      headers: sbHeaders({ key: serviceKey }),
      body: JSON.stringify({}),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '(sin cuerpo)');
      logError('upload-url', new Error(`Storage ${r.status}: ${detail.slice(0, 300)}`), {
        bucket: spec.bucket,
        ip: clientIp(req),
      });
      return json(res, 502, { error: 'SIGN_FAILED' });
    }

    // Storage devuelve { url: '/object/upload/sign/<bucket>/<path>?token=...' },
    // una ruta relativa al prefijo /storage/v1. Se devuelve absoluta para que el
    // cliente no tenga que reconstruirla — y porque equivocar ese prefijo es un
    // error silencioso que acaba en 404 al subir.
    const { url: relative, token } = await r.json();
    const uploadUrl = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1${relative}`;

    return json(res, 200, {
      bucket: spec.bucket,
      path: objectPath,
      upload_url: uploadUrl,
      token,
      max_bytes: spec.maxBytes,
    });
  } catch (err) {
    logError('upload-url', err, { ip: clientIp(req) });
    return json(res, 502, { error: 'SIGN_FAILED' });
  }
}

// 8 chars hex desde crypto: hace impredecible el nombre final del objeto, así
// que conocer el draftId no basta para adivinar la ruta de un logo ajeno.
function randomToken() {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
