// api/_lib/log.js
//
// Toda excepción o dato que pase por aquí puede terminar en los logs de
// Vercel, que no son un lugar seguro para un secreto (los ve cualquiera con
// acceso al proyecto, y pueden reenviarse a integraciones externas). Este
// módulo es la última barrera antes de console.error: redacta por CONTENIDO
// (valores con forma de secreto conocido) y por NOMBRE (claves que siempre
// son sensibles, sin importar qué tengan dentro).

// Prefijos de secretos reales de este proyecto: tokens de Mercado Pago
// (TEST-/APP_USR-), API key de Resend (re_), JWT en general — incluida la
// service_role key de Supabase, que es un JWT (eyJ...) — y las claves nuevas
// de Supabase (sb_publishable_/sb_secret_, acortadas aquí a sbp_/sbs_ por
// contrato del spec).
const SECRET_PREFIX_RE = /^(TEST-|APP_USR-|re_|eyJ|sb[ps]_)/;

// Nombres de propiedad que son sensibles sin importar su contenido: aunque el
// valor no tenga "forma" de secreto (p.ej. en un test), si la clave es
// "apikey" lo tratamos como si lo fuera. Comparación insensible a mayúsculas
// porque los headers HTTP no tienen una convención fija ('Authorization' vs
// 'authorization').
const SENSITIVE_KEYS = new Set(['apikey', 'authorization', 'service_role', 'key', 'token', 'secret', 'password']);

/**
 * Redacta recursivamente un valor: strings que empiecen por un prefijo de
 * secreto conocido, y valores de claves sensibles por nombre (en cualquier
 * nivel de anidación). Nunca muta el valor recibido.
 */
export function redact(value) {
  if (typeof value === 'string') {
    return SECRET_PREFIX_RE.test(value) ? '[REDACTED]' : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(value[key]);
    }
    return out;
  }
  // number, boolean, null, undefined, etc.: no hay nada que redactar.
  return value;
}

function truncate(s, max) {
  const str = String(s ?? '');
  return str.length > max ? str.slice(0, max) : str;
}

// `err` en la práctica llega de tres formas distintas: una instancia de
// AppError/Error (el caso normal), un string suelto (p.ej.
// logError('webhook', 'SECRET_MISSING'), forma usada en los endpoints para
// fallos que no ameritan construir una excepción), o cualquier otra cosa que
// alguien haya lanzado por error. Nunca debe romper por un tipo inesperado.
function normalizeErr(err) {
  if (err instanceof Error) {
    return { message: err.message ?? '', code: err.code };
  }
  if (typeof err === 'string') {
    return { message: err, code: undefined };
  }
  try {
    return { message: JSON.stringify(err) ?? String(err), code: err && err.code };
  } catch {
    return { message: String(err), code: undefined };
  }
}

/**
 * Registra un error de forma segura: nunca lanza (un fallo al loguear no
 * puede tumbar el flujo principal), trunca el detalle a 500 chars y redacta
 * tanto el mensaje como cualquier `extra` estructurado antes de imprimir.
 */
export function logError(scope, err, extra) {
  try {
    const { message, code } = normalizeErr(err);
    const payload = { scope };
    if (code) payload.code = code;
    payload.detail = redact(truncate(message, 500));

    if (extra !== undefined) {
      // La redacción de `extra` se aísla en su propio try: si algo ahí
      // revienta (p.ej. un getter que lanza), igual queremos que el error
      // principal quede registrado.
      try {
        payload.extra = redact(extra);
      } catch {
        payload.extra = '[UNLOGGABLE]';
      }
    }

    console.error('[grafik:estudio]', payload);
  } catch {
    // Nunca propaga: loguear no puede ser la causa de un fallo mayor.
  }
}
