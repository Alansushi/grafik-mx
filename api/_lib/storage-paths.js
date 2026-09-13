// api/_lib/storage-paths.js — PURA.
// Rutas de objetos de Supabase Storage, mimes y tamaños permitidos. `nowMs`
// y `rand` entran como parámetros (spec §0): nada de Date.now() ni
// Math.random() aquí, para que los tests sean deterministas.
//
// Este módulo es la última línea de defensa contra path traversal: recibe
// el `filename` tal cual lo manda el cliente en POST /api/upload-url, y ese
// string termina formando parte de la ruta de escritura en el bucket. Si se
// le permitiera colar '..' o '/', un cliente podría escribir fuera del
// prefijo `logos/<year>/<month>/<draftId>/` del bucket.

import { ValidationError } from '../../estudio/lib/errors.js';
import { sanitizeFilename } from './validation.js';

export const MAX_LOGO_BYTES = 8 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;

const ALLOWED_LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
// El snapshot del canvas siempre sale de toDataURL() rasterizado: nunca es
// SVG, así que a diferencia del logo (que el cliente sube tal cual), el
// preview no incluye 'image/svg+xml' en la lista blanca.
const ALLOWED_PREVIEW_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

// Sólo se acepta una extensión de 1 a 10 caracteres alfanuméricos. Cualquier
// cosa que no calce (vacía, con '/', con '\', con '..') se trata igual que
// "no hay extensión": es preferible fallar ruidoso con NO_EXTENSION que
// aceptar un valor a medio sanear. Es lo que convierte un intento de path
// traversal como '../../etc/passwd' — cuyo "resto tras el último punto" es
// literalmente "/etc/passwd" — en un rechazo limpio en vez de en una ruta
// con una barra colada.
const EXTENSION_RE = /^[a-zA-Z0-9]{1,10}$/;

function splitExtension(filename) {
  const raw = String(filename ?? '');
  const lastDot = raw.lastIndexOf('.');
  const ext = lastDot === -1 ? '' : raw.slice(lastDot + 1);
  if (!EXTENSION_RE.test(ext)) {
    throw new ValidationError('NO_EXTENSION', 'El nombre de archivo no tiene una extensión válida.', {
      filename: raw,
    });
  }
  const base = raw.slice(0, lastDot);
  return { base, ext: ext.toLowerCase() };
}

/** year/month en UTC — el bucketeo por fecha no depende del huso horario del proceso que corre el código. */
function yearMonthUTC(nowMs) {
  const d = new Date(nowMs);
  const year = String(d.getUTCFullYear());
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return { year, month };
}

/**
 * Ruta del logo subido por el cliente:
 * logos/<year>/<month>/<draftId>/<slug>-<rand>.<ext>
 *
 * `draftId` se asume ya validado por el llamador (p.ej. con isUuid() antes
 * de invocar esta función) — el vector de ataque real es `filename`, el
 * único campo de texto libre que llega tal cual del cliente.
 */
export function logoObjectPath({ draftId, filename, nowMs, rand }) {
  const { base, ext } = splitExtension(filename);
  const slug = sanitizeFilename(base);
  const { year, month } = yearMonthUTC(nowMs);
  return `logos/${year}/${month}/${draftId}/${slug}-${rand}.${ext}`;
}

/**
 * Ruta del snapshot generado por el propio configurador (Konva → Blob):
 * previews/<year>/<month>/<draftId>/item-<itemIndex>-<rand>.png
 *
 * No recibe `filename`: el snapshot no tiene nombre de cliente, así que no
 * hay superficie de path traversal aquí. La extensión es siempre .png
 * porque el snapshot sale rasterizado y ese es el formato que produce el
 * pipeline de canvas (ver isAllowedPreviewMime).
 */
export function previewObjectPath({ draftId, itemIndex, nowMs, rand }) {
  const { year, month } = yearMonthUTC(nowMs);
  return `previews/${year}/${month}/${draftId}/item-${itemIndex}-${rand}.png`;
}

export function isAllowedLogoMime(m) {
  return ALLOWED_LOGO_MIMES.has(String(m).toLowerCase());
}

export function isAllowedPreviewMime(m) {
  return ALLOWED_PREVIEW_MIMES.has(String(m).toLowerCase());
}

export function isAllowedSize(bytes, max) {
  return Number.isFinite(bytes) && bytes > 0 && bytes <= max;
}
