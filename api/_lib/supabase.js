// api/_lib/supabase.js
//
// No hay @supabase/supabase-js: el runtime de producción no tiene
// dependencias, así que PostgREST se consume con fetch crudo. Este módulo es
// la parte PURA de esa integración — construir URLs y headers — para que se
// pueda testear sin red. El fetch en sí vive en los endpoints de api/*.js.
//
// Construir mal un filtro de PostgREST es cómo se filtran datos de más: un
// '+' sin encodear en query string se decodifica como espacio, y una coma
// sin comillas dentro de un valor se confunde con el separador de listas de
// PostgREST (el mismo separador que usa "in.(a,b)").

import { AppError } from '../../estudio/lib/errors.js';

/**
 * Encodea un valor de filtro de PostgREST. encodeURIComponent ya resuelve el
 * caso más peligroso ('+' → %2B, así no se decodifica como espacio; '@' →
 * %40), pero deja sin tocar cuatro caracteres que sí son significativos para
 * la sintaxis de PostgREST cuando aparecen en un valor: paréntesis (delimitan
 * "in.(...)"), comilla simple y '!' (operadores de negación/arrays). Se
 * completan a mano para que el valor viaje inerte en la query string.
 */
export function encodeFilterValue(v) {
  return encodeURIComponent(String(v)).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

// PostgREST usa la coma como separador de listas (tanto en "in.(a,b)" como,
// implícitamente, en cualquier valor). Si un valor individual trae una coma
// dentro, hay que envolverlo en comillas dobles antes de encodearlo o
// PostgREST lo interpreta como dos valores.
//
// Y al entrecomillar hay que ESCAPAR lo que ya venía dentro: dentro de comillas
// dobles, PostgREST escapa " como \" y \ como \\. Sin esto, el valor a,"b
// producía "a,"b" — PostgREST lee la cadena entrecomillada como `a,` y el resto
// queda como basura, así que el filtro apunta a otra cosa y devuelve las filas
// equivocadas. Sin excepción y sin aviso.
//
// El orden importa: la barra invertida se escapa PRIMERO. Al revés, la barra
// que introduce el escape de la comilla se volvería a escapar.
// Se entrecomilla también cuando el valor trae una comilla o una barra, no sólo
// por la coma: un valor que EMPIEZA con comilla (p.ej. el literal "hola" con
// comillas) PostgREST lo lee como cadena entrecomillada y se las quita, así que
// el filtro terminaría buscando hola en vez de "hola". Otro match
// silenciosamente equivocado.
function quoteIfNeeded(raw) {
  if (!/[,"\\]/.test(raw)) return raw;
  const escaped = raw
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function buildPostgrestUrl(baseUrl, table, params = {}) {
  if (!baseUrl) {
    throw new AppError('INVALID_BASE_URL', 'baseUrl es requerido para construir la URL de PostgREST', { baseUrl });
  }
  assertIdentifier('nombre de tabla', table, 'INVALID_TABLE');

  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const qs = [];

  if (params.select !== undefined) {
    qs.push(`select=${encodeURIComponent(params.select)}`);
  }

  if (params.eq) {
    for (const [column, rawValue] of Object.entries(params.eq)) {
      // undefined significa "este filtro no aplica" — se omite en vez de
      // mandar la cadena literal "undefined" a PostgREST.
      if (rawValue === undefined) continue;
      assertIdentifier('nombre de columna', column, 'INVALID_COLUMN');
      const quoted = quoteIfNeeded(String(rawValue));
      qs.push(`${column}=eq.${encodeFilterValue(quoted)}`);
    }
  }

  if (params.in) {
    for (const [column, values] of Object.entries(params.in)) {
      assertIdentifier('nombre de columna', column, 'INVALID_COLUMN');
      const inner = values.map((v) => quoteIfNeeded(String(v))).join(',');
      qs.push(`${column}=in.${encodeFilterValue(`(${inner})`)}`);
    }
  }

  if (params.order !== undefined) {
    qs.push(`order=${encodeURIComponent(params.order)}`);
  }
  if (params.limit !== undefined) {
    qs.push(`limit=${encodeURIComponent(String(params.limit))}`);
  }
  if (params.offset !== undefined) {
    qs.push(`offset=${encodeURIComponent(String(params.offset))}`);
  }

  const query = qs.length ? `?${qs.join('&')}` : '';
  return `${trimmedBase}/rest/v1/${table}${query}`;
}

/**
 * Headers para llamar a PostgREST/Storage. `key` siempre va en `apikey`
 * (identifica el proyecto ante Supabase); `jwt`, si viene, reemplaza a `key`
 * SOLO en `Authorization` — así es como el panel de admin consulta con la
 * sesión del usuario (su jwt) mientras sigue identificándose como el
 * proyecto con la anon key, y RLS aplica las políticas de ese usuario.
 */
// Un CR o LF dentro del valor de una cabecera parte la petición y deja inyectar
// cabeceras arbitrarias. El runtime de Node suele rechazarlo, pero depender de
// eso es depender de un detalle del runtime: aquí falla ruidoso y con un code
// propio, que además señala el bug en vez de dar un error opaco de undici.
function assertHeaderValue(name, value) {
  // CR, LF y NUL. NO el espacio: un Prefer legitimo como
  // 'return=representation, count=exact' lleva espacios y debe pasar.
  if (/[\r\n\0]/.test(String(value))) {
    throw new AppError(
      'INVALID_HEADER_VALUE',
      `El valor de la cabecera ${name} contiene saltos de línea o bytes nulos`,
      { header: name },
    );
  }
}

export function sbHeaders({ key, jwt, prefer } = {}) {
  assertHeaderValue('apikey', key ?? '');
  if (jwt !== undefined) assertHeaderValue('Authorization', jwt);
  if (prefer) assertHeaderValue('Prefer', prefer);

  const headers = {
    apikey: key,
    Authorization: `Bearer ${jwt || key}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

// Los identificadores (tabla y columna) se VALIDAN, no se encodean.
//
// Un nombre de tabla o columna legítimo nunca necesita escapado, así que
// cualquiera que lo necesite es un error de programación o un intento de
// inyección — en los dos casos lo correcto es fallar ruidoso, no encodear y
// seguir con una consulta que no es la que se pretendía.
//
// Sin esto, {eq:{'id=eq.1&role':'admin'}} producía `id=eq.1&role=eq.admin`: un
// filtro extra completo sobre la consulta.
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertIdentifier(kind, value, code) {
  if (typeof value !== 'string' || !IDENTIFIER_RE.test(value)) {
    throw new AppError(code, `${kind} inválido para PostgREST: ${JSON.stringify(value)}`, { value });
  }
}
