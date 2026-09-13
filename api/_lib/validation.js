// api/_lib/validation.js — PURA.
// Validadores y sanitizadores genéricos reutilizados por los endpoints de
// api/*.js. Sin DOM, sin red, sin reloj, sin Math.random (spec §0,
// convenciones transversales). Cualquier fallo de forma se reporta con
// ValidationError y un `.code` estable; nunca se lanza el mensaje como
// contrato de test.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida forma básica de email: local@dominio.tld, sin espacios. */
export function isEmail(s) {
  return typeof s === 'string' && EMAIL_RE.test(s);
}

/**
 * Normaliza un teléfono mexicano a 10 dígitos, sin lada de país.
 * Sólo quita el prefijo de país cuando el conteo de dígitos indica que está
 * presente (12 dígitos → '52' + 10; 13 dígitos → '521' + 10, variante vieja
 * de celular con el '1' de larga distancia). Nunca lanza: si la entrada no
 * corresponde a ningún patrón conocido, devuelve los dígitos tal cual para
 * que isMxPhone la rechace por longitud, no por una excepción.
 */
export function normalizeMxPhone(s) {
  const digits = String(s ?? '').replace(/\D+/g, '');
  if (digits.length === 12 && digits.startsWith('52')) return digits.slice(2);
  if (digits.length === 13 && digits.startsWith('521')) return digits.slice(3);
  return digits;
}

/** true sólo si, tras normalizar, quedan exactamente 10 dígitos. */
export function isMxPhone(s) {
  return /^\d{10}$/.test(normalizeMxPhone(s));
}

/** Valida forma de UUID (cualquier versión), case-insensitive por RFC 4122. */
export function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

/**
 * Convierte un nombre de archivo arbitrario (potencialmente hostil, viene
 * del cliente) en un slug seguro para usarse como segmento de una ruta de
 * Storage: minúsculas, sólo [a-z0-9-], nunca vacío.
 *
 * Razonamiento de seguridad: `split(/[/\\]+/).pop()` descarta todo excepto
 * el último segmento de ruta *antes* de tocar nada más — así, sin importar
 * cuántos `../` o `..\` antepone un atacante, sólo sobrevive el componente
 * final. Después, `[^a-z0-9]+` colapsa a un solo guión cualquier cosa que no
 * sea alfanumérica: espacios, paréntesis, puntos, bytes nulos, etc. Un byte
 * nulo no necesita un caso especial porque ya cae en ese conjunto. El
 * resultado nunca puede contener '/', '\' ni '..' porque esos caracteres ya
 * fueron eliminados por el primer paso o convertidos a '-' por el segundo.
 */
export function sanitizeFilename(s) {
  const raw = String(s === null || s === undefined ? '' : s);
  const lastSegment = raw.split(/[/\\]+/).pop() ?? '';
  const slug = lastSegment
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/^-+|-+$/g, ''); // el slice a 60 puede dejar un guión colgando
  return slug.length > 0 ? slug : 'file';
}

/**
 * Valida que `obj` tenga, para cada clave de `schema`, un valor presente
 * (ni undefined ni null) del `typeof` indicado. Es un "schema mínimo"
 * deliberado (spec §2.13): sólo tipos planos vía `typeof`, sin anidamiento.
 * Los campos de `obj` que no aparecen en `schema` se ignoran — no son un
 * error, son metadata adicional que el llamador no pidió validar. Los
 * errores se acumulan (no cortocircuita) para que el llamador pueda mostrar
 * todos los problemas de una sola pasada.
 */
export function assertShape(obj, schema) {
  const value = obj ?? {};
  const errors = [];
  for (const [path, type] of Object.entries(schema)) {
    const fieldValue = value[path];
    if (fieldValue === undefined || fieldValue === null) {
      errors.push({ path, code: 'REQUIRED' });
      continue;
    }
    const actualType = type === 'array' ? (Array.isArray(fieldValue) ? 'array' : typeof fieldValue) : typeof fieldValue;
    if (actualType !== type) {
      errors.push({ path, code: 'INVALID_TYPE' });
    }
  }
  return { valid: errors.length === 0, errors };
}
