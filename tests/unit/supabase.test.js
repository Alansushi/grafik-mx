import { describe, it, expect } from 'vitest';
import { buildPostgrestUrl, encodeFilterValue, sbHeaders } from '../../api/_lib/supabase.js';
import { AppError } from '../../estudio/lib/errors.js';

// Estos tests cubren la tabla de casos del spec §2.12 más los casos "de
// cosecha" pedidos explícitamente: baseUrl/table vacíos, eq con valor
// undefined y un valor con caracteres Unicode.
//
// Por qué el '+' necesita encodeo especial: en un query string, un '+' sin
// encodear se decodifica como espacio (application/x-www-form-urlencoded).
// 'a+b@c.com' sin encodear el '+' llegaría a PostgREST como 'a b@c.com'.
//
// Por qué la ',' necesita comillas dobles en un valor eq: PostgREST usa la
// coma como separador de listas (p.ej. dentro de "in.(a,b)"). Sin comillas,
// eq:{note:'a,b'} se leería como si 'a' y 'b' fueran dos tokens distintos en
// vez de un solo valor con una coma dentro.

describe('supabase.js — buildPostgrestUrl', () => {
  it('1. select + eq + limit, caso literal del spec', () => {
    const url = buildPostgrestUrl('https://x.supabase.co', 'orders', {
      select: 'id,status',
      eq: { id: 'abc' },
      limit: 1,
    });
    expect(url).toBe('https://x.supabase.co/rest/v1/orders?select=id%2Cstatus&id=eq.abc&limit=1');
  });

  it('2. eq con "+" y "@" encodeados (si no, PostgREST lee el "+" como espacio)', () => {
    const url = buildPostgrestUrl('https://x.supabase.co', 'orders', {
      eq: { email: 'a+b@c.com' },
    });
    expect(url).toBe('https://x.supabase.co/rest/v1/orders?email=eq.a%2Bb%40c.com');
  });

  it('3. in con lista de valores → "in.(a,b)" completo percent-encodeado', () => {
    const url = buildPostgrestUrl('https://x.supabase.co', 'orders', {
      in: { status: ['paid', 'ready'] },
    });
    expect(url).toBe('https://x.supabase.co/rest/v1/orders?status=in.%28paid%2Cready%29');
  });

  it('4. eq con coma en el valor va entre comillas dobles y encodeado', () => {
    const url = buildPostgrestUrl('https://x.supabase.co', 'orders', {
      eq: { note: 'a,b' },
    });
    // "a,b" (con comillas literales) → %22a%2Cb%22
    expect(url).toBe('https://x.supabase.co/rest/v1/orders?note=eq.%22a%2Cb%22');
  });

  it('5. baseUrl con "/" final no produce doble slash antes de rest', () => {
    const url = buildPostgrestUrl('https://x.supabase.co/', 'orders', { limit: 1 });
    expect(url).toBe('https://x.supabase.co/rest/v1/orders?limit=1');
    expect(url).not.toContain('//rest');
  });

  it('6. order y offset se anteponen tal cual, encodeados', () => {
    const url = buildPostgrestUrl('https://x.supabase.co', 'orders', {
      order: 'created_at.desc',
      offset: 20,
    });
    expect(url).toBe('https://x.supabase.co/rest/v1/orders?order=created_at.desc&offset=20');
  });

  it('7. sin params produce la URL base sin "?"', () => {
    const url = buildPostgrestUrl('https://x.supabase.co', 'orders', {});
    expect(url).toBe('https://x.supabase.co/rest/v1/orders');
  });

  it('8. (cosecha) baseUrl vacío lanza AppError', () => {
    try {
      buildPostgrestUrl('', 'orders', {});
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('INVALID_BASE_URL');
    }
  });

  it('9. (cosecha) table vacía lanza AppError', () => {
    try {
      buildPostgrestUrl('https://x.supabase.co', '', {});
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('INVALID_TABLE');
    }
  });

  it('10. (cosecha) eq con valor undefined se omite en vez de mandar "undefined" literal', () => {
    const url = buildPostgrestUrl('https://x.supabase.co', 'orders', {
      eq: { id: 'abc', archived_at: undefined },
    });
    expect(url).toBe('https://x.supabase.co/rest/v1/orders?id=eq.abc');
  });

  it('11. (cosecha) valor con caracteres Unicode se encodea correctamente', () => {
    const url = buildPostgrestUrl('https://x.supabase.co', 'customers', {
      eq: { name: 'José Núñez' },
    });
    expect(url).toBe(`https://x.supabase.co/rest/v1/customers?name=eq.${encodeURIComponent('José Núñez')}`);
    expect(url).toBe('https://x.supabase.co/rest/v1/customers?name=eq.Jos%C3%A9%20N%C3%BA%C3%B1ez');
  });

  it('12. múltiples eq mantienen el orden de inserción de las claves', () => {
    const url = buildPostgrestUrl('https://x.supabase.co', 'orders', {
      eq: { status: 'paid', customer_id: 'c1' },
    });
    expect(url).toBe('https://x.supabase.co/rest/v1/orders?status=eq.paid&customer_id=eq.c1');
  });
});

describe('supabase.js — encodeFilterValue', () => {
  it('1. encodea "+" y "@" como encodeURIComponent', () => {
    expect(encodeFilterValue('a+b@c.com')).toBe('a%2Bb%40c.com');
  });

  it('2. encodea paréntesis, que encodeURIComponent deja intactos', () => {
    expect(encodeFilterValue('(paid,ready)')).toBe('%28paid%2Cready%29');
  });

  it('3. encodea comillas simples y signo de admiración', () => {
    expect(encodeFilterValue(`it's!`)).toBe('it%27s%21');
  });

  it('4. deja intactos alfanuméricos y guiones', () => {
    expect(encodeFilterValue('abc-123')).toBe('abc-123');
  });

  it('5. (cosecha) soporta Unicode', () => {
    expect(encodeFilterValue('café')).toBe('caf%C3%A9');
  });
});

describe('supabase.js — sbHeaders', () => {
  it('6. sólo key → apikey y Authorization con la misma key, Content-Type json', () => {
    expect(sbHeaders({ key: 'k' })).toEqual({
      apikey: 'k',
      Authorization: 'Bearer k',
      'Content-Type': 'application/json',
    });
  });

  it('7. key (anon) + jwt de usuario → Authorization usa el jwt, apikey sigue siendo la anon', () => {
    const headers = sbHeaders({ key: 'anon', jwt: 'user-jwt' });
    expect(headers.Authorization).toBe('Bearer user-jwt');
    expect(headers.apikey).toBe('anon');
  });

  it('8. prefer agrega el header Prefer', () => {
    const headers = sbHeaders({ key: 'k', prefer: 'return=representation' });
    expect(headers.Prefer).toBe('return=representation');
    expect(headers.apikey).toBe('k');
  });

  it('9. (cosecha) sin prefer, la clave Prefer no aparece', () => {
    const headers = sbHeaders({ key: 'k' });
    expect('Prefer' in headers).toBe(false);
  });
});

// ── Hallazgo de la puerta de revisión (incremento 6) ──────────────────────
//
// quoteIfNeeded envolvía en comillas dobles cualquier valor con coma, pero NO
// escapaba las comillas ni las barras invertidas que ya viniera trayendo el
// valor. Resultado: a,"b producía "a,"b" — PostgREST lee la cadena
// entrecomillada como `a,` y el resto queda como basura, así que el filtro
// apunta a otra cosa y devuelve las filas equivocadas. Sin excepción, sin
// aviso: exactamente el tipo de fallo silencioso que este proyecto persigue.
//
// Regla de PostgREST: dentro de comillas dobles, " se escapa como \" y \ como
// \\. La barra invertida va PRIMERO o se re-escaparía la que uno mismo añade.
describe('supabase.js — escapado dentro de valores entrecomillados', () => {
  const DQ = String.fromCharCode(34);
  const BS = String.fromCharCode(92);
  const filtro = (v) =>
    decodeURIComponent(
      buildPostgrestUrl('https://x.co', 't', { eq: { note: v } }).split('note=eq.')[1],
    );

  it('E1. coma sola: se entrecomilla', () => {
    expect(filtro('a,b')).toBe(DQ + 'a,b' + DQ);
  });

  it('E2. coma + comilla: la comilla interna se escapa', () => {
    // sin el escape esto era  "a,"b"  y PostgREST lo parseaba mal
    expect(filtro('a,' + DQ + 'b')).toBe(DQ + 'a,' + BS + DQ + 'b' + DQ);
  });

  it('E3. coma + barra invertida: la barra se escapa', () => {
    expect(filtro('a,' + BS + 'b')).toBe(DQ + 'a,' + BS + BS + 'b' + DQ);
  });

  it('E4. barra y comilla juntas: el orden del escapado no se duplica', () => {
    // La barra se escapa primero; si se hiciera al revés, el \ que introduce
    // el escape de la comilla se volvería a escapar y saldría \\" .
    expect(filtro('a,' + BS + DQ + 'b')).toBe(DQ + 'a,' + BS + BS + BS + DQ + 'b' + DQ);
  });

  it('E5. lo mismo aplica a cada elemento de una lista in.()', () => {
    const url = buildPostgrestUrl('https://x.co', 't', { in: { note: ['a,b', 'c' + DQ + 'd'] } });
    const dec = decodeURIComponent(url.split('note=in.')[1]);
    // los dos elementos entrecomillados, y la comilla interna del segundo escapada
    expect(dec).toBe('(' + DQ + 'a,b' + DQ + ',' + DQ + 'c' + BS + DQ + 'd' + DQ + ')');
  });

  it('E7. un valor que EMPIEZA con comilla se entrecomilla y escapa', () => {
    // Sin esto PostgREST le quita las comillas y el filtro busca `hola` en vez
    // del literal `"hola"`: un match silenciosamente equivocado.
    expect(filtro(DQ + 'hola' + DQ)).toBe(DQ + BS + DQ + 'hola' + BS + DQ + DQ);
  });

  it('E8. una barra invertida sola tambien fuerza el entrecomillado', () => {
    expect(filtro('a' + BS + 'b')).toBe(DQ + 'a' + BS + BS + 'b' + DQ);
  });

  it('E6. un valor sin caracteres reservados NO se entrecomilla', () => {
    expect(filtro('hola')).toBe('hola');
  });
});

// ── Hallazgos de la revisión de seguridad ────────────────────────────────
//
// buildPostgrestUrl encodeaba los VALORES de los filtros pero no los
// IDENTIFICADORES: ni el nombre de la tabla ni el de la columna. Ninguno de los
// endpoints actuales los toma del cliente, pero este módulo es genérico y el
// día que alguien pase un identificador dinámico la inyección es total, no
// parcial: {eq:{'id=eq.1&role':'admin'}} producía `id=eq.1&role=eq.admin`, un
// filtro extra completo sobre la consulta.
//
// Se validan como identificadores SQL en vez de encodearlos: un nombre de tabla
// o columna legítimo nunca necesita escapado, así que cualquier cosa que lo
// necesite es un error de programación o un ataque. Fallar ruidoso es correcto.
describe('supabase.js — identificadores validados, no encodeados', () => {
  it('S1. nombre de tabla con parámetros inyectados lanza INVALID_TABLE', () => {
    for (const t of ['orders?select=*&x', 'orders/../secrets', 'orders&x=1', 'ord ers', '']) {
      let code = null;
      try { buildPostgrestUrl('https://x.co', t, { select: 'id' }); } catch (e) { code = e.code; }
      expect(code).toBe('INVALID_TABLE');
    }
  });

  it('S2. nombre de columna con filtro inyectado lanza INVALID_COLUMN', () => {
    let code = null;
    try {
      buildPostgrestUrl('https://x.co', 'orders', { eq: { 'id=eq.1&role': 'admin' } });
    } catch (e) { code = e.code; }
    expect(code).toBe('INVALID_COLUMN');
  });

  it('S3. lo mismo para las columnas de in.()', () => {
    let code = null;
    try {
      buildPostgrestUrl('https://x.co', 'orders', { in: { 'status&x=1': ['paid'] } });
    } catch (e) { code = e.code; }
    expect(code).toBe('INVALID_COLUMN');
  });

  it('S4. los identificadores legítimos siguen funcionando', () => {
    const url = buildPostgrestUrl('https://x.co', 'order_items', {
      select: 'id,qty', eq: { order_id: 'abc' }, in: { item_index: ['1', '2'] },
    });
    expect(url).toContain('/rest/v1/order_items?');
    expect(url).toContain('order_id=eq.abc');
  });

  it('S5. sbHeaders rechaza valores con CR o LF (inyección de cabeceras)', () => {
    const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
    for (const bad of ['tok' + CR + LF + 'X-Admin: true', 'tok' + LF, 'tok' + CR]) {
      let code = null;
      try { sbHeaders({ key: 'k', jwt: bad }); } catch (e) { code = e.code; }
      expect(code).toBe('INVALID_HEADER_VALUE');
    }
    let code2 = null;
    try { sbHeaders({ key: 'k', prefer: 'return=x' + LF + 'evil: 1' }); } catch (e) { code2 = e.code; }
    expect(code2).toBe('INVALID_HEADER_VALUE');
  });
});
