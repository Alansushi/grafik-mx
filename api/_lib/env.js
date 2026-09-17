// api/_lib/env.js
//
// Lectura y validación de variables de entorno. Falla ruidoso, nunca
// silencioso: una variable requerida ausente debe reventar con un error
// claro (código estable, nombre de la variable) en vez de dejar que el fetch
// que la necesitaba falle más adelante con un mensaje críptico.

import { AppError } from '../../estudio/lib/errors.js';

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

/**
 * Lee `env[name]`. Con `required:true`, una variable ausente o vacía tras
 * trim lanza AppError('MISSING_ENV', ..., {name}) — el error nunca lleva el
 * valor (no hay nada que redactar si nunca se guardó). Sin `required`,
 * devuelve el valor tal cual llegó, o '' si no está definida.
 */
export function readEnv(env, name, options = {}) {
  const required = options.required === true;
  const raw = env ? env[name] : undefined;

  if (isBlank(raw)) {
    if (required) {
      throw new AppError('MISSING_ENV', `Falta la variable de entorno requerida: ${name}`, { name });
    }
    return '';
  }

  return raw;
}

/**
 * Devuelve, en el orden pedido, las claves de `keys` que están ausentes en
 * `env` o que quedan vacías tras hacer trim de su valor.
 */
export function findMissingEnv(env, keys) {
  return keys.filter((key) => isBlank(env ? env[key] : undefined));
}

/**
 * Resuelve la URL base pública del deploy. Prioridad:
 *   1. PUBLIC_BASE_URL, si está definida (config explícita).
 *   2. https://${VERCEL_URL} — OJO: VERCEL_URL NO incluye el esquema
 *      (Vercel la expone literal como "mi-app.vercel.app"), así que hay que
 *      anteponer 'https://' a mano. Olvidar esto es un error clásico: el
 *      valor "crudo" no es una URL válida y romperá cualquier `new URL(...)`
 *      o comparación con `isHttpsUrl`.
 *   3. 'http://localhost:3000' — desarrollo local, donde ninguna de las dos
 *      anteriores suele estar definida.
 */
export function resolveBaseUrl(env = {}) {
  if (!isBlank(env.PUBLIC_BASE_URL)) {
    return env.PUBLIC_BASE_URL;
  }
  if (!isBlank(env.VERCEL_URL)) {
    return `https://${env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}
