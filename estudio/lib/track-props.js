// estudio/lib/track-props.js — PURA.
//
// Convierte lo que hay en el estudio (un File, un Error, la respuesta de
// /api/quote) en los valores CERRADOS que acepta el servidor de analítica
// (api/_lib/events.js, que importa de aquí: una sola fuente de verdad).
//
// Dos razones para que existan:
//  - Que un dato raro no cueste el evento entero. El servidor descarta sin error
//    lo que no reconoce, así que un código de error con forma inesperada
//    (DOMException.code es numérico) borraría el evento del embudo sin avisar.
//  - Que jamás salga de aquí algo que el usuario escribió o nombró. El nombre de
//    un archivo de logo suele ser el de su marca o su cliente: nunca viaja.
//
// Se usan Map y no objetos literales a propósito: con un objeto, un archivo
// llamado "x.constructor" devolvería la función Object.prototype.constructor
// como si fuera su formato.

export const LOGO_FORMATS = ['png', 'jpeg', 'webp', 'svg', 'other'];

// Formatos que se rechazan hoy y que un cliente de imprenta sube con frecuencia
// (PDF y los de diseño: AI, CDR, EPS, PSD). Saber CUÁLES intentan subir dice qué
// formato habría que aceptar. Lista cerrada: el nombre del archivo nunca sale.
const REJECTED_EXT = new Map([
  ['pdf', 'pdf'], ['ai', 'ai'], ['cdr', 'cdr'], ['eps', 'eps'], ['psd', 'psd'],
  ['tif', 'tif'], ['tiff', 'tif'], ['gif', 'gif'], ['bmp', 'bmp'],
  ['heic', 'heic'], ['heif', 'heic'],
]);
const REJECTED_MIME = new Map([
  ['application/pdf', 'pdf'], ['image/tiff', 'tif'], ['image/gif', 'gif'],
  ['image/bmp', 'bmp'], ['image/heic', 'heic'], ['image/heif', 'heic'],
]);
export const REJECTED_KINDS = ['pdf', 'ai', 'cdr', 'eps', 'psd', 'tif', 'gif', 'bmp', 'heic', ...LOGO_FORMATS];

/** Tope de cantidad que acepta el servidor de analítica. Más allá, se acota. */
export const MAX_TRACKED_QTY = 100000;

/** Forma de un código de error de la app: AppError.code, en MAYÚSCULAS_Y_GUIONES_BAJOS. */
export const ERROR_CODE_RE = /^[A-Z][A-Z0-9_]{1,39}$/;

const MIME_FORMAT = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpeg'],
  ['image/webp', 'webp'],
  ['image/svg+xml', 'svg'],
]);
const EXT_FORMAT = new Map([
  ['png', 'png'], ['jpg', 'jpeg'], ['jpeg', 'jpeg'], ['webp', 'webp'], ['svg', 'svg'],
]);

/**
 * Formato de un logo subido. El mime manda; si llega vacío (algunos gestores de
 * archivos de Android/iOS no lo rellenan, sobre todo con SVG) cae a la
 * extensión. Todo lo demás es 'other'. Nunca lanza.
 */
export function logoFormat(file) {
  const type = typeof file?.type === 'string' ? file.type : '';
  if (MIME_FORMAT.has(type)) return MIME_FORMAT.get(type);
  const name = typeof file?.name === 'string' ? file.name : '';
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return EXT_FORMAT.get(ext) ?? 'other';
}

/** `value` si tiene forma de código de error de la app; si no, `fallback`. */
export function safeCode(value, fallback) {
  return typeof value === 'string' && ERROR_CODE_RE.test(value) ? value : fallback;
}

/**
 * Código de un fallo de /api/quote. Se prefiere el del primer detalle
 * (BELOW_MIN, ABOVE_MAX...) al genérico (INVALID_BREAKDOWN): es el accionable.
 */
export function quoteErrorCode(data) {
  return safeCode(data?.details?.[0]?.code, safeCode(data?.error, 'UNKNOWN'));
}

/**
 * Cantidad de piezas apta para un evento. Un entero >= 1; por encima del tope se
 * ACOTA, porque el servidor descarta sin error un evento con la cantidad fuera de
 * rango y se perdería justo el paso del embudo de quien pidió "demasiado".
 * Cualquier otra cosa → undefined (no se emite con basura).
 */
export function trackedQty(n) {
  if (!Number.isInteger(n) || n < 1) return undefined;
  return Math.min(n, MAX_TRACKED_QTY);
}

/**
 * Tipo de un archivo que el panel de logo rechazó (por formato o por tamaño).
 * Un formato ACEPTADO se devuelve tal cual: si lo rechazaron fue por pesar de más.
 * Lo desconocido es 'other'. Nunca lanza y nunca devuelve parte del nombre.
 */
export function rejectedKind(file) {
  const aceptado = logoFormat(file);
  if (aceptado !== 'other') return aceptado;
  const type = typeof file?.type === 'string' ? file.type : '';
  if (REJECTED_MIME.has(type)) return REJECTED_MIME.get(type);
  const name = typeof file?.name === 'string' ? file.name : '';
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return REJECTED_EXT.get(ext) ?? 'other';
}
